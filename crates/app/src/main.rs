//! Assemblage : seul endroit qui connaît toutes les couches.

use std::env;
use std::ffi::OsString;
use std::path::Path;
use std::sync::Arc;

use api::{Session, commands};
use infrastructure::{
    AppToolsRelay, AppleWritingAssistant, ClaudeCodeCli, FsExportStore, FsHistories,
    FsWorkspaceOpener, FsWorkspaceWatcher, JsonPreferences, MacClipboard, RELAY_OPTION,
    SocketPlace, SqliteIndexes, SystemClock, claude_folders, relay,
};
use tauri::{Manager, RunEvent};

const PREFERENCES_FILE: &str = "preferences.json";

/// Lancée par Claude Code avec `--relais-mcp <prise> <clé>`, l'application n'est que le relais des
/// outils de l'application (fiche 0040) : rien d'autre ne démarre, et rien d'autre n'est écrit sur
/// sa sortie, qui appartient au protocole MCP.
fn run_relay(arguments: &[OsString]) -> ! {
    let (Some(socket), Some(key)) = (
        arguments.get(2),
        arguments.get(3).and_then(|key| key.to_str()),
    ) else {
        std::process::exit(2)
    };
    let relayed = relay(
        Path::new(socket),
        key,
        std::io::stdin().lock(),
        std::io::stdout(),
    );
    std::process::exit(i32::from(relayed.is_err()))
}

/// Claude Code, qui offre les outils de l'application par le relais (le programme de
/// l'application) et la prise `place`, s'ils ont pu être préparés.
fn claude_code(home: Option<&Path>, place: Option<&SocketPlace>) -> ClaudeCodeCli {
    let claude = ClaudeCodeCli::searching(claude_folders(home, env::var_os("PATH").as_deref()));
    match (place, env::current_exe()) {
        (Some(place), Ok(program)) => claude.with_app_tools(AppToolsRelay {
            program,
            socket: place.socket(),
        }),
        _ => claude,
    }
}

/// Ouvre la prise locale des outils de l'application, qui répond par `session`, et la garde
/// ouverte tant que l'application tourne.
fn serve_app_tools(app: &tauri::App, place: SocketPlace, session: &Arc<Session>) {
    let answering = Arc::clone(session);
    let answer = move |key: &str, line: &str| answering.answer_app_tools(key, line);
    match place.serve(Arc::new(answer)) {
        Ok(socket) => {
            app.manage(socket);
        }
        Err(error) => tracing::warn!(%error, "prise des outils non ouverte"),
    }
}

fn main() {
    let arguments: Vec<OsString> = env::args_os().collect();
    if arguments
        .get(1)
        .is_some_and(|option| option == RELAY_OPTION)
    {
        run_relay(&arguments);
    }
    tracing_subscriber::fmt::init();
    let started = tauri::Builder::default()
        // La barre des menus est celle de l'interface (`install_menu`) : pas celle de Tauri, dont
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
            // La prise locale des outils de l'application : réservée au compte de l'utilisateur,
            // aucun port réseau (fiche 0040). Sans elle, Claude n'a que ses propres outils.
            let place = SocketPlace::new()
                .inspect_err(|error| tracing::warn!(%error, "prise des outils non préparée"))
                .ok();
            let home = app.path().home_dir().ok();
            let claude = claude_code(home.as_deref(), place.as_ref());
            let screen = commands::claude::TauriScreen(app.handle().clone());
            let session = Arc::new(
                session
                    .with_claude(Arc::new(claude))
                    .with_screen(Arc::new(screen)),
            );
            if let Some(place) = place {
                serve_app_tools(app, place, &session);
            }
            app.manage(session);
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
