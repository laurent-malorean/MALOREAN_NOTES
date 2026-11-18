//! Assemblage : seul endroit qui connaît toutes les couches.

use std::sync::Arc;

use api::{Session, commands};
use infrastructure::{FsWorkspaceOpener, FsWorkspaceWatcher, JsonPreferences, SystemClock};
use tauri::Manager;

const PREFERENCES_FILE: &str = "preferences.json";

fn main() {
    tracing_subscriber::fmt::init();
    let started = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let preferences =
                JsonPreferences::new(app.path().app_config_dir()?.join(PREFERENCES_FILE));
            let session = Session::new(
                Arc::new(FsWorkspaceOpener),
                Arc::new(preferences),
                Arc::new(SystemClock),
            )
            .with_watcher(Arc::new(FsWorkspaceWatcher));
            app.manage(Arc::new(session));
            Ok(())
        })
        .invoke_handler(commands::invoke_handler())
        .run(tauri::generate_context!());
    if let Err(error) = started {
        tracing::error!(%error, "l'application n'a pas pu démarrer");
        std::process::exit(1);
    }
}
