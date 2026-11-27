//! Construit les assistants Swift avec le reste du projet : seul Swift a accès au modèle d'IA
//! intégré au Mac (aide à l'écriture, `malorean-writing`, fiche 0031) et à SpeechAnalyzer
//! (saisie vocale, `malorean-voice`, fiche 0103). Le chemin de chacun est donné au code par
//! `MALOREAN_WRITING_HELPER` et `MALOREAN_VOICE_HELPER` ; vide si le Mac n'a pas Swift (ou pas
//! le SDK qui a SpeechAnalyzer) : l'assistant se dit alors introuvable au lieu d'empêcher la
//! construction.

use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

/// La plus ancienne version de macOS où les assistants se lancent (ils disent alors « macOS trop
/// ancien ») : celle qui a les tâches asynchrones de Swift.
const OLDEST_MACOS: &str = "12.0";

/// Un assistant Swift : sa source, son nom, la variable qui donne son chemin au code, et le
/// fichier d'informations lié au programme (les textes des demandes d'accès), s'il en a un.
struct Helper {
    source: &'static str,
    name: &'static str,
    variable: &'static str,
    plist: Option<&'static str>,
}

const HELPERS: [Helper; 2] = [
    Helper {
        source: "swift/writing.swift",
        name: "malorean-writing",
        variable: "MALOREAN_WRITING_HELPER",
        plist: None,
    },
    Helper {
        source: "swift/voice.swift",
        name: "malorean-voice",
        variable: "MALOREAN_VOICE_HELPER",
        plist: Some("swift/voice-Info.plist"),
    },
];

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    for helper in &HELPERS {
        println!("cargo:rerun-if-changed={}", helper.source);
        if let Some(plist) = helper.plist {
            println!("cargo:rerun-if-changed={plist}");
        }
        let built = env::var_os("OUT_DIR")
            .map(|out| PathBuf::from(out).join(helper.name))
            .filter(|path| compile(helper, path));
        let path = built.map(|path| path.display().to_string());
        println!(
            "cargo:rustc-env={}={}",
            helper.variable,
            path.unwrap_or_default()
        );
    }
}

/// Compile `helper` à `path` pour le Mac visé ; faux, avec un avertissement, si ce n'est pas
/// possible.
fn compile(helper: &Helper, path: &Path) -> bool {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return false;
    }
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        _ => "x86_64",
    };
    let mut command = Command::new("swiftc");
    command
        .args(["-O", "-parse-as-library", "-target"])
        .arg(format!("{arch}-apple-macos{OLDEST_MACOS}"))
        .arg(helper.source)
        .arg("-o")
        .arg(path);
    if let Some(plist) = helper.plist {
        command.args(["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT"]);
        command.args(["-Xlinker", "__info_plist", "-Xlinker", plist]);
    }
    match command.status() {
        Ok(status) if status.success() => true,
        Ok(status) => warn(helper, &format!("swiftc a échoué ({status})")),
        Err(error) => warn(helper, &format!("swiftc introuvable ({error})")),
    }
}

fn warn(helper: &Helper, reason: &str) -> bool {
    println!("cargo:warning={} non construit : {reason}", helper.name);
    false
}
