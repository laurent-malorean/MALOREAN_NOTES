//! Construit l'assistant Swift de l'aide à l'écriture (`malorean-writing`) avec le reste du
//! projet : seul Swift a accès au modèle d'IA intégré au Mac (fiche 0031). Son chemin est donné
//! au code par `MALOREAN_WRITING_HELPER` ; vide si le Mac n'a pas Swift, et l'assistant d'écriture
//! se dit alors introuvable au lieu d'empêcher la construction.

use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

const SOURCE: &str = "swift/writing.swift";
const HELPER: &str = "malorean-writing";
/// La plus ancienne version de macOS où l'assistant se lance (il dit alors « macOS trop ancien ») :
/// celle qui a les tâches asynchrones de Swift.
const OLDEST_MACOS: &str = "12.0";

fn main() {
    println!("cargo:rerun-if-changed={SOURCE}");
    println!("cargo:rerun-if-changed=build.rs");
    let built = env::var_os("OUT_DIR")
        .map(|out| PathBuf::from(out).join(HELPER))
        .filter(|helper| compile(helper));
    let path = built.map(|helper| helper.display().to_string());
    println!(
        "cargo:rustc-env=MALOREAN_WRITING_HELPER={}",
        path.unwrap_or_default()
    );
}

/// Compile l'assistant à `helper` pour le Mac visé ; faux, avec un avertissement, si ce n'est
/// pas possible.
fn compile(helper: &Path) -> bool {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return false;
    }
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        _ => "x86_64",
    };
    let status = Command::new("swiftc")
        .args(["-O", "-parse-as-library", "-target"])
        .arg(format!("{arch}-apple-macos{OLDEST_MACOS}"))
        .arg(SOURCE)
        .arg("-o")
        .arg(helper)
        .status();
    match status {
        Ok(status) if status.success() => true,
        Ok(status) => warn(&format!("swiftc a échoué ({status})")),
        Err(error) => warn(&format!("swiftc introuvable ({error})")),
    }
}

fn warn(reason: &str) -> bool {
    println!("cargo:warning=assistant d'écriture non construit : {reason}");
    false
}
