//! Assemblage : seul endroit qui connaît toutes les couches.

use std::env;
use std::ffi::OsString;
use std::path::Path;
use std::sync::Arc;

use api::{Session, commands};
use application::{
    ConnectionSocket, IndexOpener, NoteIndex, OpenedIndex, SegmentingIndex, StoreError,
    WorkspaceLocation,
};
use infrastructure::{
    AppToolsRelay, AppleWritingAssistant, CONNECT_OPTION, ClaudeCodeCli, FsConnectionKeys,
    FsExportStore, FsHistories, FsWorkspaceOpener, FsWorkspaceWatcher, JsonPreferences,
    MacClipboard, ModelFolder, PermanentSocket, RELAY_OPTION, SocketPlace, SqliteIndexes,
    SystemClock, SystemSecretMaker, claude_folders, connect, relay,
};
use tauri::{Manager, RunEvent};

#[cfg(feature = "essai")]
mod essai;

const PREFERENCES_FILE: &str = "preferences.json";

/// Le fichier de la clé de branchement, dans le dossier de configuration (fiche 0056).
const CONNECTION_KEY_FILE: &str = "connection-key.json";

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

/// Lancée par une IA extérieure avec `--brancher <clé>`, l'application n'est que la commande de
/// branchement (fiche 0056) : comme le relais, rien d'autre ne démarre ni ne s'écrit sur sa sortie.
fn run_connect(arguments: &[OsString]) -> ! {
    let (Some(home), Some(key)) = (
        env::var_os("HOME"),
        arguments.get(2).and_then(|key| key.to_str()),
    ) else {
        std::process::exit(2)
    };
    let connected = connect(
        Path::new(&home),
        key,
        std::io::stdin().lock(),
        std::io::stdout(),
    );
    std::process::exit(i32::from(connected.is_err()))
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

/// Les index des espaces de travail : l'index de mots et l'index de sens partagent le même fichier,
/// et chaque changement de l'index de mots range aussi les segments des notes dans l'index de sens
/// (fiches 0044 et 0046).
#[derive(Debug)]
struct MeaningIndexes(SqliteIndexes);

impl IndexOpener for MeaningIndexes {
    fn open(&self, location: &WorkspaceLocation) -> Result<Arc<dyn NoteIndex>, StoreError> {
        Ok(self.open_with_meaning(location)?.words)
    }

    fn open_with_meaning(&self, location: &WorkspaceLocation) -> Result<OpenedIndex, StoreError> {
        let (words, meaning) = self.0.open_with_meaning(location)?;
        Ok(OpenedIndex {
            words: Arc::new(SegmentingIndex::new(words, meaning.clone())),
            meaning,
        })
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

/// La session où l'on peut brancher une IA extérieure par `socket` (fiche 0056) : la clé de
/// branchement est gardée dans le dossier de configuration. Sans prise (pas de dossier personnel),
/// aucune IA ne peut être branchée.
fn with_connection(
    session: Session,
    app: &tauri::App,
    socket: Option<&Arc<PermanentSocket>>,
) -> Result<Session, Box<dyn std::error::Error>> {
    let Some(socket) = socket else {
        return Ok(session);
    };
    let keys = FsConnectionKeys::new(app.path().app_config_dir()?.join(CONNECTION_KEY_FILE));
    Ok(session.with_connection(
        Arc::new(keys),
        Arc::new(SystemSecretMaker),
        Arc::clone(socket) as Arc<dyn ConnectionSocket>,
        env::current_exe()?,
    ))
}

/// Fait répondre la prise de branchement par `session`, puis l'ouvre si une clé de branchement
/// existe ; sans clé, aucune prise n'est ouverte.
fn open_connection(session: &Arc<Session>, socket: &PermanentSocket) {
    let answering = Arc::clone(session);
    socket.answer_with(Arc::new(move |key: &str, line: &str| {
        answering.answer_connection(key, line)
    }));
    if let Err(error) = session.open_connection() {
        tracing::warn!(error = %error.message, "prise de branchement non ouverte");
    }
}

/// La session avec ses stockages : espaces de travail, index de mots et de sens, modèles de sens
/// (dans le dossier de support de l'application, `models/`), historique, surveillance, exports,
/// presse-papiers et aide à l'écriture. Sans modèle de sens téléchargé, la recherche se fait par
/// les mots seuls.
fn base_session(
    app: &tauri::App,
    preferences: JsonPreferences,
) -> Result<Session, Box<dyn std::error::Error>> {
    let support = app.path().app_data_dir()?;
    Ok(Session::new(
        Arc::new(FsWorkspaceOpener),
        Arc::new(preferences),
        Arc::new(SystemClock),
    )
    .with_indexes(Arc::new(MeaningIndexes(SqliteIndexes::new(
        support.clone(),
    ))))
    .with_meaning_models(Arc::new(ModelFolder::new(&support)))
    .with_meaning_events(Arc::new(commands::meaning::TauriMeaningEvents(
        app.handle().clone(),
    )))
    .with_histories(Arc::new(FsHistories))
    .with_watcher(Arc::new(FsWorkspaceWatcher))
    .with_exports(Arc::new(FsExportStore))
    .with_clipboard(Arc::new(MacClipboard::default()))
    .with_writing_assistant(Arc::new(AppleWritingAssistant::installed())))
}

/// Prépare l'application au lancement : préférences, session avec ses stockages, outils de
/// l'application pour Claude (prise du tour) et pour les IA extérieures (prise de branchement).
fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let preferences = JsonPreferences::new(app.path().app_config_dir()?.join(PREFERENCES_FILE));
    let connection = app
        .path()
        .home_dir()
        .ok()
        .map(|home| Arc::new(PermanentSocket::new(&home)));
    let session = with_connection(base_session(app, preferences)?, app, connection.as_ref())?;
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
    if let Some(socket) = connection {
        open_connection(&session, &socket);
        app.manage(socket);
    }
    app.manage(session);
    #[cfg(feature = "essai")]
    app.manage(essai::Essai::from_environment());
    Ok(())
}

fn main() {
    let arguments: Vec<OsString> = env::args_os().collect();
    if arguments
        .get(1)
        .is_some_and(|option| option == RELAY_OPTION)
    {
        run_relay(&arguments);
    }
    if arguments
        .get(1)
        .is_some_and(|option| option == CONNECT_OPTION)
    {
        run_connect(&arguments);
    }
    tracing_subscriber::fmt::init();
    // Les commandes de l'essai de l'application réelle, seulement dans l'application construite pour
    // lui (fiche 0054).
    let handler = commands::invoke_handler();
    #[cfg(feature = "essai")]
    let handler = essai::handler(handler);
    let started = tauri::Builder::default()
        // La barre des menus est celle de l'interface (`install_menu`) : pas celle de Tauri, dont
        // Cmd+W fermerait la fenêtre au lieu de l'onglet.
        .enable_macos_default_menu(false)
        .on_menu_event(|app, event| commands::menu::chosen(app, &event))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(setup)
        .invoke_handler(handler)
        .build(tauri::generate_context!());
    match started {
        Ok(app) => app.run(|app, event| {
            // Quitter l'application, c'est quitter ses notes : une version de chacune de celles
            // enregistrées depuis leur dernière version.
            if let RunEvent::Exit = event {
                let session = app.state::<Arc<Session>>();
                session.keep_pending_versions();
                session.stop_meaning();
            }
        }),
        Err(error) => {
            tracing::error!(%error, "l'application n'a pas pu démarrer");
            std::process::exit(1);
        }
    }
}
