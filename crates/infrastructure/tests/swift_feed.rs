//! Le tampon du son de la saisie vocale (`Feed`, `swift/voice.swift`, fiche 0108) : il est écrit
//! en Swift et se vérifie par un petit programme Swift (`swift/tests/feed/main.swift`), compilé et
//! joué ici. Sans `swiftc` (autre système, Swift absent), le test dit qu'il passe son tour : la
//! construction fait de même pour l'assistant.

#![cfg(target_os = "macos")]

use std::path::Path;
use std::process::Command;

use tempfile::TempDir;

#[test]
fn the_sound_waiting_for_the_model_is_not_lost() {
    let swift = Path::new(env!("CARGO_MANIFEST_DIR")).join("swift");
    let folder = TempDir::new().unwrap();
    let program = folder.path().join("feed-test");
    let compiled = match Command::new("swiftc")
        .arg("-DFEED_TEST")
        .arg(swift.join("voice.swift"))
        .arg(swift.join("tests/feed/main.swift"))
        .arg("-o")
        .arg(&program)
        .output()
    {
        Ok(output) => output,
        // Sans Swift, rien à vérifier (comme la construction de l'assistant).
        Err(_) => return,
    };
    assert!(
        compiled.status.success(),
        "swiftc a échoué : {}",
        String::from_utf8_lossy(&compiled.stderr)
    );
    let played = Command::new(&program).output().unwrap();
    let said = String::from_utf8_lossy(&played.stdout);
    assert!(played.status.success() && said.trim() == "ok", "{said}");
}
