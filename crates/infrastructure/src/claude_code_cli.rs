//! Claude Code piloté en arrière-plan : chaque tour lance le programme `claude` dans le dossier
//! de l'espace de travail, lui écrit le message sur son entrée et lit son flux JSON ligne à ligne
//! (fiche 0032).

use std::ffi::OsStr;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::{Mutex, MutexGuard, PoisonError};

use application::{ClaudeCode, ClaudeError, ClaudeStatus, WorkspaceLocation};
use domain::claude::{ClaudeEvent, ConversationId};

use crate::claude_stream::events_of;

/// Les seuls outils offerts à Claude : lire, chercher, créer et modifier des fichiers, lancer
/// des sous-agents ; ni commande système, ni web.
const TOOLS: &str = "Read,Write,Edit,Glob,Grep,Agent";

/// La clé d'une facturation à l'usage : retirée, pour que ce soit toujours l'abonnement de
/// l'utilisateur qui serve.
const API_KEY: &str = "ANTHROPIC_API_KEY";

/// Le nom du programme de Claude Code.
const PROGRAM: &str = "claude";

/// Les dossiers où l'installation de Claude Code range `claude`, partagés par tout le Mac.
const SHARED_FOLDERS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];

/// Les dossiers où l'installation de Claude Code range `claude`, dans le dossier personnel.
const HOME_FOLDERS: [&str; 2] = [".local/bin", ".claude/local"];

/// Ce que dit `claude auth status --json` : seul « connecté ou non » est lu, jamais l'adresse
/// ni l'organisation du compte.
#[derive(Debug, serde::Deserialize)]
struct AuthStatus {
    #[serde(rename = "loggedIn")]
    logged_in: bool,
}

/// Le tour en cours : le programme lancé, et s'il a été arrêté.
#[derive(Debug, Default)]
struct Turn {
    child: Option<Child>,
    stopped: bool,
}

/// Les dossiers où chercher `claude`, dans l'ordre : ceux où son installation le range, puis
/// ceux du `PATH` (une application ouverte depuis le Finder n'a pas celui du Terminal).
#[must_use]
pub fn claude_folders(home: Option<&Path>, path: Option<&OsStr>) -> Vec<PathBuf> {
    let shared = SHARED_FOLDERS.map(PathBuf::from);
    let personal = home
        .into_iter()
        .flat_map(|home| HOME_FOLDERS.map(|folder| home.join(folder)));
    let searched = path.into_iter().flat_map(std::env::split_paths);
    shared.into_iter().chain(personal).chain(searched).collect()
}

/// Claude Code, par le programme `claude` installé sur le Mac.
#[derive(Debug)]
pub struct ClaudeCodeCli {
    /// Les programmes possibles, dans l'ordre : le premier qui peut être lancé sert.
    candidates: Vec<PathBuf>,
    turn: Mutex<Turn>,
}

impl ClaudeCodeCli {
    /// Claude Code lancé par le programme rangé à `program`.
    #[must_use]
    pub fn new(program: impl Into<PathBuf>) -> Self {
        Self {
            candidates: vec![program.into()],
            turn: Mutex::default(),
        }
    }

    /// Claude Code lancé par le premier programme `claude` trouvé dans `folders`, cherché à
    /// chaque usage : installé après le lancement de l'application, il est trouvé.
    #[must_use]
    pub fn searching(folders: impl IntoIterator<Item = PathBuf>) -> Self {
        Self {
            candidates: folders
                .into_iter()
                .map(|folder| folder.join(PROGRAM))
                .collect(),
            turn: Mutex::default(),
        }
    }

    /// Le programme de Claude Code : le premier des possibles qui est un fichier exécutable.
    fn program(&self) -> Option<&Path> {
        self.candidates
            .iter()
            .map(PathBuf::as_path)
            .find(|candidate| {
                candidate
                    .metadata()
                    .is_ok_and(|file| file.is_file() && file.permissions().mode() & 0o111 != 0)
            })
    }

    fn turn(&self) -> MutexGuard<'_, Turn> {
        self.turn.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Lance le programme pour un tour et lui donne `message` ; rend sa sortie.
    fn start(
        &self,
        workspace: &WorkspaceLocation,
        conversation: Option<&ConversationId>,
        message: &str,
    ) -> Result<ChildStdout, ClaudeError> {
        if !Path::new(workspace.as_str()).is_dir() {
            return Err(ClaudeError::Failed(format!(
                "l'espace de travail {} est introuvable",
                workspace.as_str()
            )));
        }
        let mut turn = self.turn();
        if turn.child.is_some() {
            return Err(ClaudeError::Busy);
        }
        let program = self.program().ok_or(ClaudeError::Missing)?;
        let mut child = Command::new(program)
            .args(arguments(conversation))
            .current_dir(workspace.as_str())
            .env_remove(API_KEY)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| ClaudeError::Missing)?;
        let (Some(mut stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
            unreachable!("l'entrée et la sortie sont demandées en tuyaux")
        };
        *turn = Turn {
            child: Some(child),
            stopped: false,
        };
        drop(turn);
        // Un programme qui s'arrête sans tout lire ne garde pas le message : sa fin, lue sur sa
        // sortie, dit ce qu'il en est.
        stdin.write_all(message.as_bytes()).ok();
        Ok(stdout)
    }

    /// Attend la fin du programme du tour et dit comment le tour s'est terminé.
    fn finish(&self, summarized: bool) -> Result<(), ClaudeError> {
        let mut turn = self.turn();
        let succeeded = turn
            .child
            .take()
            .is_some_and(|mut child| child.wait().is_ok_and(|status| status.success()));
        if turn.stopped {
            Err(ClaudeError::Stopped)
        } else if summarized || succeeded {
            Ok(())
        } else {
            Err(ClaudeError::Failed("aucun bilan".to_owned()))
        }
    }
}

/// Les arguments d'un tour : flux JSON, conversation continuée, autorisations de Claude.
fn arguments(conversation: Option<&ConversationId>) -> Vec<&str> {
    let mut arguments = vec!["-p", "--output-format", "stream-json", "--verbose"];
    if let Some(conversation) = conversation {
        arguments.extend(["--resume", conversation.as_str()]);
    }
    arguments.extend([
        "--tools",
        TOOLS,
        "--permission-mode",
        "acceptEdits",
        "--permission-prompts",
        "none",
        "--restricted",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--forward-subagent-text",
    ]);
    arguments
}

impl ClaudeCode for ClaudeCodeCli {
    fn status(&self) -> ClaudeStatus {
        let Some(program) = self.program() else {
            return ClaudeStatus::Missing;
        };
        let Ok(output) = Command::new(program)
            .args(["auth", "status", "--json"])
            .env_remove(API_KEY)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
        else {
            return ClaudeStatus::Missing;
        };
        // Pas connecté, `claude` sort en erreur mais le dit quand même : seule sa réponse compte.
        match serde_json::from_slice::<AuthStatus>(&output.stdout) {
            Ok(AuthStatus { logged_in: true }) => ClaudeStatus::Ready,
            Ok(AuthStatus { logged_in: false }) => ClaudeStatus::LoggedOut,
            Err(_) => ClaudeStatus::Failed,
        }
    }

    fn send(
        &self,
        workspace: &WorkspaceLocation,
        conversation: Option<&ConversationId>,
        message: &str,
        on_event: &mut dyn FnMut(ClaudeEvent),
    ) -> Result<(), ClaudeError> {
        let stdout = self.start(workspace, conversation, message)?;
        let mut summarized = false;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            for event in events_of(&line) {
                summarized |= matches!(event, ClaudeEvent::Summary(_));
                on_event(event);
            }
        }
        self.finish(summarized)
    }

    fn stop(&self) {
        let turn = &mut *self.turn();
        if let Some(child) = turn.child.as_mut() {
            turn.stopped = true;
            // Un programme déjà terminé ne peut plus être tué : le tour s'achève de lui-même.
            child.kill().ok();
        }
    }
}
