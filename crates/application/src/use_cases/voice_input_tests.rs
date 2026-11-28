use super::*;
use crate::testing::{FakePreferences, FakeTranscriber, FakeUptime, RecordingVoiceEvents};
use crate::{VoiceAccess, VoiceLanguage};
use VoiceEvent::{Ended, Failed, Fixed, Listening, Preparing, Provisional, Silence};
use domain::voice_shortcut::ShortcutError;

struct Bench {
    input: VoiceInput,
    transcriber: Arc<FakeTranscriber>,
    preferences: Arc<FakePreferences>,
    events: Arc<RecordingVoiceEvents>,
    uptime: Arc<FakeUptime>,
}

fn bench(transcriber: FakeTranscriber) -> Bench {
    let transcriber = Arc::new(transcriber);
    let preferences = Arc::new(FakePreferences::default());
    let events = Arc::new(RecordingVoiceEvents::default());
    let uptime = Arc::new(FakeUptime::default());
    let input = VoiceInput::with_silence(
        Arc::clone(&transcriber) as Arc<dyn Transcriber>,
        Arc::clone(&preferences) as Arc<dyn Preferences>,
        Arc::clone(&events) as Arc<dyn VoiceEvents>,
        Arc::clone(&uptime) as Arc<dyn Uptime>,
        Duration::from_secs(30),
    );
    Bench {
        input,
        transcriber,
        preferences,
        events,
        uptime,
    }
}

fn text(value: &str) -> String {
    value.to_owned()
}

#[test]
fn listening_follows_the_engine_until_the_stop_fixes_what_is_left() {
    let bench = bench(
        FakeTranscriber::new()
            .saying(vec![
                Listening,
                Provisional(text("bon")),
                Provisional(text("bonjour")),
                Fixed(text("Bonjour. ")),
                Provisional(text("à dem")),
            ])
            .saying_at_stop(Vec::new()),
    );
    bench.input.start().unwrap();
    bench.events.wait_until(|events| events.len() >= 5);
    assert!(bench.input.status().unwrap().listening);
    bench.input.stop();
    assert_eq!(
        bench.events.wait_for_the_end(),
        vec![
            Listening,
            Provisional(text("bon")),
            Provisional(text("bonjour")),
            Fixed(text("Bonjour. ")),
            Provisional(text("à dem")),
            Fixed(text("à dem")),
            Ended
        ]
    );
    assert!(!bench.input.status().unwrap().listening);
}

#[test]
fn listening_uses_the_language_of_the_mac_without_a_choice() {
    let bench = bench(FakeTranscriber::new());
    bench.input.start().unwrap();
    bench.input.stop();
    bench.events.wait_for_the_end();
    assert_eq!(bench.transcriber.listened(), vec![None]);
}

#[test]
fn starting_does_not_ask_the_engine_for_its_catalog() {
    // Le catalogue lance un second programme (énumère les langues, lit les modèles) : un
    // démarrage à froid de plus entre le clic et l'écoute (fiche 0107).
    for chosen in [None, Some("en-US")] {
        let bench = bench(FakeTranscriber::new());
        bench.input.choose_language(chosen).unwrap();
        let asked = bench.transcriber.catalogs();
        bench.input.start().unwrap();
        bench.input.stop();
        bench.events.wait_for_the_end();
        assert_eq!(bench.transcriber.catalogs(), asked, "{chosen:?}");
    }
}

#[test]
fn the_events_of_the_start_reach_the_interface_in_the_order_of_the_engine() {
    // Préparation du modèle, puis écoute, puis le texte capté dès l'ouverture du micro.
    let bench = bench(FakeTranscriber::new().saying(vec![
        Preparing,
        Listening,
        Provisional(text("bon")),
        Fixed(text("Bonjour. ")),
    ]));
    bench.input.start().unwrap();
    bench.input.stop();
    assert_eq!(
        bench.events.wait_for_the_end(),
        vec![
            Preparing,
            Listening,
            Provisional(text("bon")),
            Fixed(text("Bonjour. ")),
            Ended
        ]
    );
}

#[test]
fn listening_uses_the_chosen_language() {
    let bench = bench(FakeTranscriber::new());
    bench.input.choose_language(Some("en-US")).unwrap();
    bench.input.start().unwrap();
    bench.input.stop();
    bench.events.wait_for_the_end();
    assert_eq!(bench.transcriber.listened(), vec![Some(text("en-US"))]);
}

#[test]
fn a_mac_without_a_language_to_offer_says_so_by_an_event() {
    let bench = bench(FakeTranscriber::new().with_catalog(VoiceCatalog {
        system: None,
        access: VoiceAccess::Allowed,
        languages: Vec::new(),
    }));
    bench.input.start().unwrap();
    assert_eq!(
        bench.events.wait_for_the_end(),
        vec![Failed(VoiceFailure::LanguageUnsupported), Ended]
    );
    assert!(!bench.input.status().unwrap().listening);
}

#[test]
fn only_one_listening_at_a_time() {
    let bench = bench(FakeTranscriber::new());
    bench.input.start().unwrap();
    assert_eq!(
        bench.input.start(),
        Err(AppError::Voice(VoiceFailure::AlreadyListening))
    );
    assert_eq!(bench.transcriber.listened().len(), 1);
    bench.input.stop();
    bench.events.wait_for_the_end();
}

#[test]
fn a_new_listening_can_start_once_the_previous_one_has_ended() {
    let bench = bench(FakeTranscriber::new());
    bench.input.start().unwrap();
    bench.input.stop();
    bench.events.wait_for_the_end();
    bench.input.start().unwrap();
    assert_eq!(bench.transcriber.listened().len(), 2);
    bench.input.stop();
}

#[test]
fn an_engine_that_cannot_start_frees_the_place() {
    let bench = bench(FakeTranscriber::new().failing_to_listen(VoiceFailure::EngineMissing));
    assert_eq!(
        bench.input.start(),
        Err(AppError::Voice(VoiceFailure::EngineMissing))
    );
    assert!(!bench.input.status().unwrap().listening);
    assert_eq!(
        bench.input.start(),
        Err(AppError::Voice(VoiceFailure::EngineMissing))
    );
}

#[test]
fn stopping_without_listening_does_nothing() {
    let bench = bench(FakeTranscriber::new());
    bench.input.stop();
    bench.input.check_silence();
    assert_eq!(bench.transcriber.stops(), 0);
    assert!(bench.events.events().is_empty());
}

#[test]
fn an_engine_that_stops_by_itself_fixes_the_text_tells_and_frees_the_place() {
    let bench = bench(
        FakeTranscriber::new()
            .saying(vec![
                Listening,
                Provisional(text("à demain")),
                Failed(VoiceFailure::Stopped),
            ])
            .ending_by_itself(),
    );
    bench.input.start().unwrap();
    assert_eq!(
        bench.events.wait_for_the_end(),
        vec![
            Listening,
            Provisional(text("à demain")),
            Fixed(text("à demain")),
            Failed(VoiceFailure::Stopped),
            Ended
        ]
    );
    assert!(!bench.input.status().unwrap().listening);
    bench.input.start().unwrap();
}

#[test]
fn the_preparation_of_the_language_is_passed_on() {
    let bench = bench(FakeTranscriber::new().saying(vec![Preparing, Listening]));
    bench.input.start().unwrap();
    assert_eq!(
        bench.events.wait_until(|events| events.len() >= 2),
        vec![Preparing, Listening]
    );
    bench.input.stop();
}

#[test]
fn thirty_seconds_without_speech_stop_the_listening() {
    let bench = bench(
        FakeTranscriber::new()
            .saying(vec![Listening, Provisional(text("un"))])
            .saying_at_stop(Vec::new()),
    );
    bench.input.start().unwrap();
    bench.events.wait_until(|events| events.len() >= 2);
    bench.uptime.advance(Duration::from_secs(29));
    bench.input.check_silence();
    assert_eq!(bench.transcriber.stops(), 0);
    bench.uptime.advance(Duration::from_secs(1));
    bench.input.check_silence();
    assert_eq!(
        bench.events.wait_for_the_end(),
        vec![
            Listening,
            Provisional(text("un")),
            Silence,
            Fixed(text("un")),
            Ended
        ]
    );
    assert_eq!(bench.transcriber.stops(), 1);
}

#[test]
fn the_listening_watches_the_silence_by_itself() {
    let transcriber = Arc::new(FakeTranscriber::new().saying(vec![Listening]));
    let uptime = Arc::new(FakeUptime::default());
    let events = Arc::new(RecordingVoiceEvents::default());
    let input = VoiceInput::with_silence(
        Arc::clone(&transcriber) as Arc<dyn Transcriber>,
        Arc::new(FakePreferences::default()),
        Arc::clone(&events) as Arc<dyn VoiceEvents>,
        Arc::clone(&uptime) as Arc<dyn Uptime>,
        Duration::from_millis(40),
    );
    input.start().unwrap();
    events.wait_until(|events| !events.is_empty());
    uptime.advance(Duration::from_millis(40));
    assert_eq!(events.wait_for_the_end(), vec![Listening, Silence, Ended]);
}

#[test]
fn the_default_silence_is_thirty_seconds() {
    let transcriber = Arc::new(FakeTranscriber::new().saying(vec![Listening]));
    let uptime = Arc::new(FakeUptime::default());
    let events = Arc::new(RecordingVoiceEvents::default());
    let input = VoiceInput::new(
        transcriber,
        Arc::new(FakePreferences::default()),
        Arc::clone(&events) as Arc<dyn VoiceEvents>,
        Arc::clone(&uptime) as Arc<dyn Uptime>,
    );
    input.start().unwrap();
    events.wait_until(|events| !events.is_empty());
    uptime.advance(Duration::from_secs(29));
    input.check_silence();
    assert_eq!(events.events(), vec![Listening]);
    uptime.advance(Duration::from_secs(1));
    input.check_silence();
    assert_eq!(events.wait_for_the_end(), vec![Listening, Silence, Ended]);
}

#[test]
fn the_status_tells_the_engine_the_choice_and_the_listening() {
    let bench = bench(FakeTranscriber::new());
    let status = bench.input.status().unwrap();
    assert_eq!(status.engine, bench.transcriber.catalog());
    assert_eq!(status.chosen, None);
    assert!(!status.listening);
    bench.input.choose_language(Some("en-US")).unwrap();
    assert_eq!(bench.input.status().unwrap().chosen, Some(text("en-US")));
    bench.input.choose_language(None).unwrap();
    assert_eq!(bench.input.status().unwrap().chosen, None);
}

#[test]
fn the_status_of_a_mac_that_cannot_says_why() {
    let bench = bench(FakeTranscriber::unavailable(VoiceFailure::SystemTooOld));
    assert_eq!(
        bench.input.status().unwrap().engine,
        Err(VoiceFailure::SystemTooOld)
    );
}

#[test]
fn an_unknown_language_is_refused_and_nothing_is_kept() {
    let bench = bench(FakeTranscriber::new());
    assert_eq!(
        bench.input.choose_language(Some("tlh")),
        Err(AppError::Voice(VoiceFailure::LanguageUnsupported))
    );
    assert_eq!(bench.preferences.voice_language().unwrap(), None);
}

#[test]
fn the_language_does_not_change_while_listening() {
    let bench = bench(FakeTranscriber::new());
    bench.input.start().unwrap();
    assert_eq!(
        bench.input.choose_language(Some("en-US")),
        Err(AppError::Voice(VoiceFailure::LanguageLocked))
    );
    assert_eq!(bench.preferences.voice_language().unwrap(), None);
    bench.input.stop();
    bench.events.wait_for_the_end();
    bench.input.choose_language(Some("en-US")).unwrap();
}

#[test]
fn a_language_is_prepared_when_the_mac_knows_it() {
    let bench = bench(FakeTranscriber::new());
    bench.input.prepare_language("en-US").unwrap();
    assert_eq!(bench.transcriber.prepared(), vec![text("en-US")]);
    assert_eq!(
        bench.input.prepare_language("tlh"),
        Err(AppError::Voice(VoiceFailure::LanguageUnsupported))
    );
    assert_eq!(bench.transcriber.prepared(), vec![text("en-US")]);
}

#[test]
fn a_failed_download_is_reported() {
    let bench = bench(FakeTranscriber::new().failing_to_prepare(VoiceFailure::LanguageDownload));
    assert_eq!(
        bench.input.prepare_language("en-US"),
        Err(AppError::Voice(VoiceFailure::LanguageDownload))
    );
}

#[test]
fn a_language_listed_by_the_mac_is_known_by_its_identifier() {
    let language = VoiceLanguage {
        id: text("fr-FR"),
        name: text("français (France)"),
        ready: true,
    };
    let bench = bench(FakeTranscriber::new().with_catalog(VoiceCatalog {
        system: Some(text("fr-FR")),
        access: VoiceAccess::Undecided,
        languages: vec![language],
    }));
    bench.input.choose_language(Some("fr-FR")).unwrap();
    assert!(bench.input.choose_language(Some("fr")).is_err());
}

#[test]
fn the_settings_are_the_default_shortcut_and_no_beep_at_first() {
    let bench = bench(FakeTranscriber::new());
    let settings = bench.input.settings().unwrap();
    assert_eq!(settings.shortcut.to_string(), "Ctrl+Maj+D");
    assert!(settings.shortcut.is_default());
    assert!(!settings.beeps);
}

#[test]
fn a_chosen_shortcut_is_kept_written_the_way_of_the_menus_and_can_be_reset() {
    let bench = bench(FakeTranscriber::new());
    let chosen = bench.input.choose_shortcut(Some("cmd+alt+e")).unwrap();
    assert_eq!(chosen.to_string(), "Alt+Cmd+E");
    assert_eq!(bench.input.settings().unwrap().shortcut, chosen);
    assert_eq!(bench.preferences.voice_shortcut().unwrap(), chosen);
    let reset = bench.input.choose_shortcut(None).unwrap();
    assert!(reset.is_default());
    assert!(bench.input.settings().unwrap().shortcut.is_default());
}

#[test]
fn a_shortcut_that_is_not_valid_is_refused_with_its_reason_and_nothing_is_kept() {
    let bench = bench(FakeTranscriber::new());
    bench.input.choose_shortcut(Some("Ctrl+F5")).unwrap();
    for (written, reason) in [
        ("D", ShortcutError::NoControlOrCommand),
        ("Maj+D", ShortcutError::NoControlOrCommand),
        ("Ctrl+Maj", ShortcutError::NoKey),
        ("Ctrl+Tab", ShortcutError::UnknownKey),
        ("Ctrl+D+E", ShortcutError::TooManyKeys),
    ] {
        assert_eq!(
            bench.input.choose_shortcut(Some(written)),
            Err(AppError::VoiceShortcut(reason)),
            "{written}"
        );
    }
    assert_eq!(
        bench.input.settings().unwrap().shortcut.to_string(),
        "Ctrl+F5"
    );
}

#[test]
fn the_shortcut_and_the_beeps_can_change_while_listening() {
    let bench = bench(FakeTranscriber::new());
    bench.input.start().unwrap();
    bench.input.choose_shortcut(Some("Ctrl+E")).unwrap();
    bench.input.choose_beeps(true).unwrap();
    bench.input.stop();
    bench.events.wait_for_the_end();
    assert!(bench.input.settings().unwrap().beeps);
}

#[test]
fn the_beeps_are_kept_and_can_be_turned_off() {
    let bench = bench(FakeTranscriber::new());
    bench.input.choose_beeps(true).unwrap();
    assert!(bench.input.settings().unwrap().beeps);
    assert!(bench.preferences.voice_beeps().unwrap());
    bench.input.choose_beeps(false).unwrap();
    assert!(!bench.input.settings().unwrap().beeps);
}
