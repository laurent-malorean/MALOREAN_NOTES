//! Assemblage : seul endroit qui connaît toutes les couches.

use std::sync::Arc;

use api::{Session, commands};
use infrastructure::{
    AppleWritingAssistant, FsExportStore, FsHistories, FsWorkspaceOpener, FsWorkspaceWatcher,
    JsonPreferences, MacClipboard, SqliteIndexes, SystemClock,
};
use tauri::{Manager, RunEvent};

const PREFERENCES_FILE: &str = "preferences.json";

fn main() {
    tracing_subscriber::fmt::init();
    let started = tauri::Builder::default()
        // La barre des menus est celle de la page (`install_menu`) : pas celle de Tauri, dont
        // Cmd+W fermerait la fenêtre au lieu de l'onglet.
        .enable_macos_default_menu(false)
        .on_menu_event(|app, event| commands::menu::chosen(app, &event))
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
            .with_indexes(Arc::new(SqliteIndexes::new(app.path().app_data_dir()?)))
            .with_histories(Arc::new(FsHistories))
            .with_watcher(Arc::new(FsWorkspaceWatcher))
            .with_exports(Arc::new(FsExportStore))
            .with_clipboard(Arc::new(MacClipboard::default()))
            .with_writing_assistant(Arc::new(AppleWritingAssistant::installed()));
            app.manage(Arc::new(session));
            Ok(())
        })
        .invoke_handler(commands::invoke_handler())
        .build(tauri::generate_context!());
    match started {
        Ok(app) => app.run(|app, event| {
            // Quitter l'application, c'est quitter ses notes : une version de chacune de celles
            // enregistrées depuis leur dernière version.
            if let RunEvent::Exit = event {
                app.state::<Arc<Session>>().keep_pending_versions();
            }
        }),
        Err(error) => {
            tracing::error!(%error, "l'application n'a pas pu démarrer");
            std::process::exit(1);
        }
    }
}
