//! Le transcripteur du Mac : son échange avec l'assistant Swift, joué avec de petits scripts qui
//! répondent à sa place. Le vrai moteur (micro, boîtes de dialogue de macOS) ne se joue qu'à la
//! main : voir le test marqué `ignore` en bas de ce fichier.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use application::{Transcriber, VoiceAccess};
use domain::voice_input::{VoiceEvent, VoiceFailure};
use infrastructure::{AppleTranscriber, VOICE_HELPER};
use tempfile::TempDir;

/// Un assistant Swift remplacé par le script `body` ; il garde dans `dir/command` la commande
/// reçue (`$1 $2`).
fn scripted(body: &str) -> (TempDir, AppleTranscriber) {
    let folder = TempDir::new().unwrap();
    let script = folder.path().join("helper.sh");
    let dir = folder.path().display();
    fs::write(
        &script,
        format!("#!/bin/sh\necho \"$1 $2\" > '{dir}/command'\n{body}\n"),
    )
    .unwrap();
    fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
    (folder, AppleTranscriber::new(script))
}

fn replying(reply: &str) -> (TempDir, AppleTranscriber) {
    scripted(&format!("printf '%s' '{reply}'"))
}

fn command(folder: &TempDir) -> String {
    fs::read_to_string(folder.path().join("command")).unwrap()
}

const STATUS: &str = r#"{"system":"fr-FR","access":"undecided","languages":[{"id":"fr-FR","name":"français (France)","ready":true},{"id":"en-US","name":"anglais (États-Unis)","ready":false}]}"#;

#[test]
fn the_catalog_comes_from_the_status_of_the_helper() {
    let (folder, transcriber) = replying(STATUS);
    let catalog = transcriber.catalog().unwrap();
    assert_eq!(command(&folder), "status \n");
    assert_eq!(catalog.system.as_deref(), Some("fr-FR"));
    assert_eq!(catalog.access, VoiceAccess::Undecided);
    assert_eq!(catalog.languages.len(), 2);
    assert_eq!(catalog.languages[0].id, "fr-FR");
    assert_eq!(catalog.languages[0].name, "français (France)");
    assert!(catalog.languages[0].ready);
    assert!(!catalog.languages[1].ready);
}

#[test]
fn each_access_is_understood_and_an_unknown_one_counts_as_denied() {
    for (word, access) in [
        ("allowed", VoiceAccess::Allowed),
        ("undecided", VoiceAccess::Undecided),
        ("denied", VoiceAccess::Denied),
        ("futur", VoiceAccess::Denied),
    ] {
        let reply = format!(r#"{{"system":null,"access":"{word}","languages":[]}}"#);
        let catalog = replying(&reply).1.catalog().unwrap();
        assert_eq!(catalog.access, access, "{word}");
        assert_eq!(catalog.system, None);
    }
}

#[test]
fn a_mac_older_than_26_is_reported_as_such() {
    assert_eq!(
        replying(r#"{"unavailable":"systemTooOld"}"#).1.catalog(),
        Err(VoiceFailure::SystemTooOld)
    );
}

#[test]
fn a_helper_that_says_nothing_clear_counts_as_missing() {
    for reply in [r#"{"unavailable":"autre"}"#, "{}", "", "pas du JSON"] {
        assert_eq!(
            replying(reply).1.catalog(),
            Err(VoiceFailure::EngineMissing),
            "{reply}"
        );
    }
}

#[test]
fn a_missing_helper_is_reported_as_missing_everywhere() {
    let transcriber = AppleTranscriber::new("/nulle/part/malorean-voice");
    assert_eq!(transcriber.catalog(), Err(VoiceFailure::EngineMissing));
    assert_eq!(
        transcriber.prepare("fr-FR"),
        Err(VoiceFailure::EngineMissing)
    );
    assert!(matches!(
        transcriber.listen("fr-FR", Box::new(|_| ())),
        Err(VoiceFailure::EngineMissing)
    ));
}

#[test]
fn a_language_is_prepared_by_the_helper() {
    let (folder, transcriber) = replying(r#"{"ready":true}"#);
    assert_eq!(transcriber.prepare("en-US"), Ok(()));
    assert_eq!(command(&folder), "prepare en-US\n");
}

#[test]
fn a_preparation_that_fails_says_why() {
    assert_eq!(
        replying(r#"{"failed":"languageDownload"}"#)
            .1
            .prepare("en-US"),
        Err(VoiceFailure::LanguageDownload)
    );
    assert_eq!(
        replying(r#"{"failed":"languageUnsupported"}"#)
            .1
            .prepare("xx"),
        Err(VoiceFailure::LanguageUnsupported)
    );
    assert_eq!(
        replying(r#"{"unavailable":"systemTooOld"}"#)
            .1
            .prepare("fr-FR"),
        Err(VoiceFailure::SystemTooOld)
    );
    assert_eq!(
        replying(r#"{"ready":false}"#).1.prepare("fr-FR"),
        Err(VoiceFailure::EngineMissing)
    );
}

type Events = Arc<Mutex<Vec<VoiceEvent>>>;

fn collecting(events: &Events) -> application::VoiceSink {
    let events = Arc::clone(events);
    Box::new(move |event| events.lock().unwrap().push(event))
}

fn wait_for_the_end(events: &Events) -> Vec<VoiceEvent> {
    for _ in 0..500 {
        let seen = events.lock().unwrap().clone();
        if seen.last() == Some(&VoiceEvent::Ended) {
            return seen;
        }
        thread::sleep(Duration::from_millis(10));
    }
    events.lock().unwrap().clone()
}

#[test]
fn the_events_of_the_helper_reach_the_sink_and_stop_ends_the_listening() {
    let (folder, transcriber) = scripted(
        r#"printf '{"event":"listening"}\n{"event":"provisional","text":"bon"}\nligne ignorée\n'
read line
echo "$line" > "$(dirname "$0")/stop"
printf '{"event":"fixed","text":"Bon."}\n{"event":"ended"}\n'"#,
    );
    let events = Events::default();
    let listening = transcriber.listen("en-US", collecting(&events)).unwrap();
    for _ in 0..500 {
        if events.lock().unwrap().len() >= 2 {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(
        *events.lock().unwrap(),
        vec![
            VoiceEvent::Listening,
            VoiceEvent::Provisional("bon".to_owned())
        ]
    );
    listening.stop();
    assert_eq!(
        wait_for_the_end(&events),
        vec![
            VoiceEvent::Listening,
            VoiceEvent::Provisional("bon".to_owned()),
            VoiceEvent::Fixed("Bon.".to_owned()),
            VoiceEvent::Ended
        ]
    );
    assert_eq!(command(&folder), "listen en-US\n");
    assert_eq!(
        fs::read_to_string(folder.path().join("stop")).unwrap(),
        "stop\n"
    );
    listening.stop();
}

#[test]
fn a_helper_that_dies_after_speaking_is_a_stopped_engine() {
    let (_folder, transcriber) = scripted(r#"printf '{"event":"listening"}\n'"#);
    let events = Events::default();
    let _listening = transcriber.listen("fr-FR", collecting(&events)).unwrap();
    assert_eq!(
        wait_for_the_end(&events),
        vec![
            VoiceEvent::Listening,
            VoiceEvent::Failed(VoiceFailure::Stopped),
            VoiceEvent::Ended
        ]
    );
}

#[test]
fn a_helper_that_says_nothing_before_dying_is_a_missing_engine() {
    let (_folder, transcriber) = scripted("exit 1");
    let events = Events::default();
    let _listening = transcriber.listen("fr-FR", collecting(&events)).unwrap();
    assert_eq!(
        wait_for_the_end(&events),
        vec![
            VoiceEvent::Failed(VoiceFailure::EngineMissing),
            VoiceEvent::Ended
        ]
    );
}

#[test]
fn a_failure_told_by_the_helper_is_passed_on_before_the_end() {
    let (_folder, transcriber) =
        scripted(r#"printf '{"event":"failed","reason":"noMicrophone"}\n{"event":"ended"}\n'"#);
    let events = Events::default();
    let _listening = transcriber.listen("fr-FR", collecting(&events)).unwrap();
    assert_eq!(
        wait_for_the_end(&events),
        vec![
            VoiceEvent::Failed(VoiceFailure::NoMicrophone),
            VoiceEvent::Ended
        ]
    );
}

#[test]
fn an_abandoned_listening_does_not_leave_the_helper_running() {
    let (folder, transcriber) = scripted(
        r#"echo $$ > "$(dirname "$0")/pid"
printf '{"event":"listening"}\n'
exec sleep 30"#,
    );
    let events = Events::default();
    let listening = transcriber.listen("fr-FR", collecting(&events)).unwrap();
    let pid_file = folder.path().join("pid");
    for _ in 0..500 {
        if pid_file.exists() && !events.lock().unwrap().is_empty() {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    let pid = fs::read_to_string(&pid_file).unwrap().trim().to_owned();
    drop(listening);
    for _ in 0..500 {
        let alive = std::process::Command::new("kill")
            .args(["-0", &pid])
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap()
            .success();
        if !alive {
            return;
        }
        thread::sleep(Duration::from_millis(10));
    }
    panic!("l'assistant {pid} tourne encore");
}

#[test]
fn the_installed_helper_is_the_built_one_when_none_is_next_to_the_program() {
    let next_to_program: PathBuf = std::env::current_exe()
        .unwrap()
        .with_file_name(VOICE_HELPER);
    assert!(!next_to_program.exists());
    assert_eq!(AppleTranscriber::installed(), AppleTranscriber::built());
    assert!(AppleTranscriber::built().helper().ends_with(VOICE_HELPER));
}

/// Le vrai moteur, avec le vrai micro : à lancer à la main, en parlant, depuis un terminal à qui
/// macOS a donné l'accès au micro (la première fois, il le demande) :
///
/// `VOICE_SECONDS=10 VOICE_LANGUAGE=fr-FR cargo test -p infrastructure --test apple_voice -- --ignored --nocapture`
///
/// Écrit sur la sortie d'erreur chaque événement reçu (texte provisoire, texte fixé, niveau
/// sonore), puis le texte fixé en entier.
#[test]
#[ignore = "écoute le micro : il faut parler ; à lancer à la main"]
fn the_real_engine_writes_what_the_microphone_hears() {
    use std::io::Write;
    let seconds: u64 = std::env::var("VOICE_SECONDS")
        .ok()
        .and_then(|seconds| seconds.parse().ok())
        .unwrap_or(10);
    let language = std::env::var("VOICE_LANGUAGE").unwrap_or_else(|_| "fr-FR".to_owned());
    let transcriber = AppleTranscriber::built();
    let catalog = transcriber.catalog().unwrap();
    let mut stderr = std::io::stderr();
    writeln!(stderr, "catalogue : {catalog:?}").unwrap();
    let events = Events::default();
    let listening = transcriber.listen(&language, collecting(&events)).unwrap();
    writeln!(
        stderr,
        "ÉCOUTE {seconds} secondes en {language} : parlez maintenant"
    )
    .unwrap();
    thread::sleep(Duration::from_secs(seconds));
    listening.stop();
    let seen = wait_for_the_end(&events);
    for event in &seen {
        writeln!(stderr, "{event:?}").unwrap();
    }
    let fixed: String = seen
        .iter()
        .filter_map(|event| match event {
            VoiceEvent::Fixed(text) => Some(text.as_str()),
            _ => None,
        })
        .collect();
    writeln!(stderr, "TEXTE FIXÉ : {fixed}").unwrap();
    assert_eq!(seen.last(), Some(&VoiceEvent::Ended));
}
