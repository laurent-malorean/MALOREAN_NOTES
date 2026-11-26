//! Le vrai petit modèle gardé en mémoire (fiche 0088), joué seulement s'il est sur ce Mac : la
//! deuxième recherche réutilise le modèle chargé, et le modèle est libéré tout seul après le
//! délai. Le test écrit l'empreinte mémoire du processus (`footprint`) et les durées mesurées.

use std::os::unix::fs::symlink;
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use application::{MeaningModels, Uptime};
use infrastructure::{KeptModels, ModelFolder, SystemUptime};
use tempfile::TempDir;

use crate::real_model::{MODEL, real_model_folder};

/// L'empreinte mémoire du processus, en Mo, lue par `footprint` (outil du Mac).
fn footprint_mb() -> Option<f64> {
    let output = Command::new("footprint")
        .arg(std::process::id().to_string())
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().find(|l| l.contains("Footprint:"))?;
    let mut words = line.split_whitespace().skip_while(|w| *w != "Footprint:");
    let value: f64 = words.nth(1)?.parse().ok()?;
    match words.next()? {
        "GB" => Some(value * 1024.0),
        "KB" => Some(value / 1024.0),
        _ => Some(value),
    }
}

#[expect(
    clippy::print_stderr,
    reason = "la mesure se lit avec --nocapture ; le lanceur capture eprintln!"
)]
fn say(text: &str) {
    eprintln!("{text}");
}

#[test]
fn the_real_model_is_loaded_once_and_freed_by_itself_after_the_delay() {
    let Some(folder) = real_model_folder() else {
        say("test ignoré : le modèle E5 petit n'est pas sur ce Mac");
        return;
    };
    let support = TempDir::new().unwrap();
    std::fs::create_dir_all(support.path().join("models")).unwrap();
    symlink(folder, support.path().join("models").join(MODEL.name())).unwrap();
    let delay = Duration::from_secs(3);
    let clock = Arc::new(SystemUptime::default());
    let models = KeptModels::with_duration(
        Arc::new(ModelFolder::new(support.path())),
        clock.clone(),
        delay,
    );
    let before = footprint_mb();

    let started = clock.elapsed();
    let first = models.open(MODEL).unwrap();
    let vector = first.embed_query("recette de tarte").unwrap();
    let cold = clock.elapsed() - started;
    let during = footprint_mb();

    let started = clock.elapsed();
    let second = models.open(MODEL).unwrap();
    second.embed_query("recette de tarte").unwrap();
    let warm = clock.elapsed() - started;
    assert!(Arc::ptr_eq(&first, &second), "le modèle n'est pas rechargé");
    assert_eq!(vector.values().len(), MODEL.dimensions());

    let weak = Arc::downgrade(&first);
    drop((first, second));
    assert!(weak.upgrade().is_some(), "gardé pendant le délai");
    thread::sleep(delay + Duration::from_secs(2));
    assert!(weak.upgrade().is_none(), "libéré tout seul après le délai");
    let after = footprint_mb();

    say(&format!(
        "chargement à froid + 1re question : {cold:?} ; 2e question à chaud : {warm:?}"
    ));
    say(&format!(
        "empreinte (Mo) avant : {before:?} ; pendant : {during:?} ; après libération : {after:?}"
    ));
}
