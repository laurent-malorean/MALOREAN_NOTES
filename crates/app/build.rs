//! Prépare l'application Tauri à la compilation (configuration, permissions, icônes), et
//! construit les assistants Swift qu'elle emporte comme programmes annexes (`bundle.externalBin`) :
//! `malorean-writing` pour l'aide à l'écriture (fiche 0031) et `malorean-voice` pour la saisie
//! vocale (fiche 0103). Tauri les pose à côté du programme de l'application, en développement
//! comme dans l'application livrée.

use std::env;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

/// La plus ancienne version de macOS où les assistants se lancent (ils disent alors « macOS trop
/// ancien »).
const OLDEST_MACOS: &str = "12.0";
/// Sans Swift, l'assistant livré ne fait que s'arrêter : l'application le dit introuvable.
const STAND_IN: &str = "#!/bin/sh\nexit 1\n";

/// Un assistant Swift : sa source, son nom de programme annexe, et le fichier d'informations lié
/// au programme (les textes des demandes d'accès), s'il en a un.
struct Helper {
    source: &'static str,
    name: &'static str,
    plist: Option<&'static str>,
}

const HELPERS: [Helper; 2] = [
    Helper {
        source: "../infrastructure/swift/writing.swift",
        name: "malorean-writing",
        plist: None,
    },
    Helper {
        source: "../infrastructure/swift/voice.swift",
        name: "malorean-voice",
        plist: Some("../infrastructure/swift/voice-Info.plist"),
    },
];

fn main() {
    let target = env::var("TARGET").unwrap_or_default();
    for helper in &HELPERS {
        println!("cargo:rerun-if-changed={}", helper.source);
        if let Some(plist) = helper.plist {
            println!("cargo:rerun-if-changed={plist}");
        }
        let path = format!("binaries/{}-{target}", helper.name);
        if !compile(helper, Path::new(&path)) {
            stand_in(Path::new(&path));
        }
    }
    println!("cargo:rerun-if-changed=Info.plist");
    println!("cargo:rerun-if-changed=Entitlements.plist");
    tauri_build::build();
}

/// Compile `helper` à `path` ; faux, avec un avertissement, si ce n'est pas possible.
fn compile(helper: &Helper, path: &Path) -> bool {
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        _ => "x86_64",
    };
    if let Some(folder) = path.parent() {
        fs::create_dir_all(folder).ok();
    }
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
    let built = command.status().is_ok_and(|status| status.success());
    if !built {
        println!(
            "cargo:warning={} non construit : swiftc a échoué ou manque",
            helper.name
        );
    }
    built
}

fn stand_in(helper: &Path) {
    if fs::write(helper, STAND_IN).is_ok() {
        fs::set_permissions(helper, fs::Permissions::from_mode(0o755)).ok();
    }
}
