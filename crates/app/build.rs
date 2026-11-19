//! Prépare l'application Tauri à la compilation (configuration, permissions, icônes), et
//! construit l'assistant Swift de l'aide à l'écriture, qu'elle emporte comme programme annexe
//! (`bundle.externalBin`) : Tauri le pose à côté du programme de l'application, en
//! développement comme dans l'application livrée (fiche 0031).

use std::env;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

const SOURCE: &str = "../infrastructure/swift/writing.swift";
/// La plus ancienne version de macOS où l'assistant se lance (il dit alors « macOS trop ancien »).
const OLDEST_MACOS: &str = "12.0";
/// Sans Swift, l'assistant livré ne fait que s'arrêter : l'application le dit introuvable.
const STAND_IN: &str = "#!/bin/sh\nexit 1\n";

fn main() {
    println!("cargo:rerun-if-changed={SOURCE}");
    let target = env::var("TARGET").unwrap_or_default();
    let helper = format!("binaries/malorean-writing-{target}");
    if !compile(Path::new(&helper)) {
        stand_in(Path::new(&helper));
    }
    tauri_build::build();
}

/// Compile l'assistant à `helper` ; faux, avec un avertissement, si ce n'est pas possible.
fn compile(helper: &Path) -> bool {
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        _ => "x86_64",
    };
    if let Some(folder) = helper.parent() {
        fs::create_dir_all(folder).ok();
    }
    let status = Command::new("swiftc")
        .args(["-O", "-parse-as-library", "-target"])
        .arg(format!("{arch}-apple-macos{OLDEST_MACOS}"))
        .arg(SOURCE)
        .arg("-o")
        .arg(helper)
        .status();
    let built = status.is_ok_and(|status| status.success());
    if !built {
        println!("cargo:warning=assistant d'écriture non construit : swiftc a échoué ou manque");
    }
    built
}

fn stand_in(helper: &Path) {
    if fs::write(helper, STAND_IN).is_ok() {
        fs::set_permissions(helper, fs::Permissions::from_mode(0o755)).ok();
    }
}
