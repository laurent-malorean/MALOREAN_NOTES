//! Claude Code piloté en arrière-plan : chaque tour lance le programme `claude` dans le dossier
//! de l'espace de travail, lui écrit le message sur son entrée et lit son flux JSON ligne à ligne
//! (fiche 0032).

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::{Mutex, MutexGuard, PoisonError};

use application::{ClaudeCode, ClaudeError, WorkspaceLocation};
use domain::claude::{ClaudeEvent, ConversationId};

use crate::claude_stream::events_of;

/// Les seuls outils offerts à Claude : lire, chercher, créer et modifier des fichiers, lancer
/// des sous-agents ; ni commande système, ni web.
const TOOLS: &str = "Read,Write,Edit,Glob,Grep,Agent";

/// La clé d'une facturation à l'usage : retirée, pour que ce soit toujours l'abonnement de
/// l'utilisateur qui serve.
const API_KEY: &str = "ANTHROPIC_API_KEY";

/// Le tour en cours : le programme lancé, et s'il a été arrêté.
#[derive(Debug, Default)]
struct Turn {
    child: Option<Child>,
    stopped: bool,
}

/// Claude Code, par le programme `claude` installé sur le Mac.
#[derive(Debug)]
pub struct ClaudeCodeCli {
    program: PathBuf,
    turn: Mutex<Turn>,
}

impl ClaudeCodeCli {
    /// Claude Code lancé par le programme rangé à `program`.
    #[must_use]
    pub fn new(program: impl Into<PathBuf>) -> Self {
        Self {
            program: program.into(),
            turn: Mutex::default(),
        }
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
        let mut child = Command::new(&self.program)
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
