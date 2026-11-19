//! Claude Code piloté en arrière-plan : chaque tour lance le programme `claude` dans le dossier
//! de l'espace de travail, lui écrit le message sur son entrée et lit son flux JSON ligne à ligne
//! (fiche 0032).

use std::ffi::OsStr;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;

use application::{ClaudeAccount, ClaudeCode, ClaudeError, ClaudeStatus, WorkspaceLocation};
use domain::claude::{ClaudeEvent, ClaudeModel, ConversationId, Effort, TurnSettings};

use crate::claude_stream::events_of;

/// Les seuls outils offerts à Claude : lire, chercher, créer et modifier des fichiers, lancer
/// des sous-agents ; ni commande système, ni web.
const TOOLS: &str = "Read,Write,Edit,Glob,Grep,Agent";

/// Les seules variables d'environnement transmises à `claude` : son dossier personnel, sa
/// connexion, ses programmes, la langue, les fichiers temporaires et le proxy du réseau. Toute
/// autre est retirée : ni clé d'API (c'est toujours l'abonnement de l'utilisateur qui sert), ni
/// réglage de Claude Code qui élargirait ses droits, ni accès hérité du Terminal (fiche 0032).
const KEPT_VARIABLES: [&str; 18] = [
    "HOME",
    "USER",
    "LOGNAME",
    "PATH",
    "SHELL",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LC_MESSAGES",
    "CLAUDE_CONFIG_DIR",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS",
];

/// Le nom du programme de Claude Code.
const PROGRAM: &str = "claude";

/// Les dossiers où l'installation de Claude Code range `claude`, partagés par tout le Mac.
const SHARED_FOLDERS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];

/// Les dossiers où l'installation de Claude Code range `claude`, dans le dossier personnel.
const HOME_FOLDERS: [&str; 2] = [".local/bin", ".claude/local"];

/// Ce que dit `claude auth status --json` : connecté ou non, et le compte. Jamais écrit dans le
/// journal (pas de forme de débogage).
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthStatus {
    logged_in: bool,
    email: Option<String>,
    org_name: Option<String>,
}

/// L'adresse de la page de connexion dans une ligne de `claude auth login`, s'il y en a une.
fn sign_in_address(line: &str) -> Option<&str> {
    let start = line.find("https://")?;
    line[start..].split_whitespace().next()
}

/// Le tour ou la connexion en cours : le programme lancé, et s'il a été arrêté. Un seul à la fois.
#[derive(Debug, Default)]
struct Turn {
    child: Option<Child>,
    stopped: bool,
}

/// `claude`, lancé avec les seules variables d'environnement gardées de l'application.
fn claude_command(program: &Path) -> Command {
    let mut command = Command::new(program);
    command.env_clear().envs(
        std::env::vars_os().filter(|(name, _)| KEPT_VARIABLES.iter().any(|kept| name == kept)),
    );
    command
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
        settings: TurnSettings,
        message: &str,
    ) -> Result<ChildStdout, ClaudeError> {
        if !Path::new(workspace.as_str()).is_dir() {
            return Err(ClaudeError::Failed(format!(
                "l'espace de travail {} est introuvable",
                workspace.as_str()
            )));
        }
        let (mut stdin, stdout) = self.launch(|command| {
            command
                .args(arguments(conversation, settings))
                .current_dir(workspace.as_str())
                .stderr(Stdio::null());
        })?;
        // Un programme qui s'arrête sans tout lire ne garde pas le message : sa fin, lue sur sa
        // sortie, dit ce qu'il en est.
        stdin.write_all(message.as_bytes()).ok();
        Ok(stdout)
    }

    /// Lance `claude`, réglé par `configure`, comme seul programme en cours (tour ou connexion),
    /// l'entrée et la sortie en tuyaux ; rend son entrée et sa sortie.
    fn launch(
        &self,
        configure: impl FnOnce(&mut Command),
    ) -> Result<(ChildStdin, ChildStdout), ClaudeError> {
        let mut turn = self.turn();
        if turn.child.is_some() {
            return Err(ClaudeError::Busy);
        }
        let program = self.program().ok_or(ClaudeError::Missing)?;
        let mut command = claude_command(program);
        command.stdin(Stdio::piped()).stdout(Stdio::piped());
        configure(&mut command);
        let mut child = command.spawn().map_err(|_| ClaudeError::Missing)?;
        let (Some(stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
            unreachable!("l'entrée et la sortie sont demandées en tuyaux")
        };
        *turn = Turn {
            child: Some(child),
            stopped: false,
        };
        Ok((stdin, stdout))
    }

    /// Attend la fin du programme en cours : rend s'il a été arrêté, sinon s'il a réussi.
    fn wait(&self) -> Result<bool, ClaudeError> {
        let mut turn = self.turn();
        let succeeded = turn
            .child
            .take()
            .is_some_and(|mut child| child.wait().is_ok_and(|status| status.success()));
        if turn.stopped {
            Err(ClaudeError::Stopped)
        } else {
            Ok(succeeded)
        }
    }

    /// Attend la fin du programme du tour et dit comment le tour s'est terminé.
    fn finish(&self, summarized: bool) -> Result<(), ClaudeError> {
        if self.wait()? || summarized {
            Ok(())
        } else {
            Err(ClaudeError::Failed("aucun bilan".to_owned()))
        }
    }
}

/// Envoie chaque ligne lue sur `output` à `lines`, sur un fil à part.
fn forward_lines(output: impl Read + Send + 'static, lines: mpsc::Sender<String>) {
    thread::spawn(move || {
        for line in BufReader::new(output).lines().map_while(Result::ok) {
            if lines.send(line).is_err() {
                break;
            }
        }
    });
}

/// Le nom que Claude Code donne au dernier modèle de chaque famille (`--model`).
const fn model_alias(model: ClaudeModel) -> &'static str {
    match model {
        ClaudeModel::Haiku => "haiku",
        ClaudeModel::Sonnet => "sonnet",
        ClaudeModel::Opus => "opus",
        ClaudeModel::Fable => "fable",
    }
}

/// Le nom que Claude Code donne à chaque niveau d'effort (`--effort`).
const fn effort_level(effort: Effort) -> &'static str {
    match effort {
        Effort::Low => "low",
        Effort::Medium => "medium",
        Effort::High => "high",
        Effort::ExtraHigh => "xhigh",
        Effort::Max => "max",
    }
}

/// Les arguments d'un tour : flux JSON, conversation continuée, modèle et niveau d'effort choisis,
/// autorisations de Claude.
fn arguments(conversation: Option<&ConversationId>, settings: TurnSettings) -> Vec<&str> {
    let mut arguments = vec!["-p", "--output-format", "stream-json", "--verbose"];
    if let Some(conversation) = conversation {
        arguments.extend(["--resume", conversation.as_str()]);
    }
    if let Some(model) = settings.model {
        arguments.extend(["--model", model_alias(model)]);
    }
    if let Some(effort) = settings.effort {
        arguments.extend(["--effort", effort_level(effort)]);
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
        let Ok(output) = claude_command(program)
            .args(["auth", "status", "--json"])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
        else {
            return ClaudeStatus::Missing;
        };
        // Pas connecté, `claude` sort en erreur mais le dit quand même : seule sa réponse compte.
        match serde_json::from_slice::<AuthStatus>(&output.stdout) {
            Ok(AuthStatus {
                logged_in: true,
                email,
                org_name,
            }) => ClaudeStatus::Ready(ClaudeAccount {
                email,
                organization: org_name,
            }),
            Ok(_) => ClaudeStatus::LoggedOut,
            Err(_) => ClaudeStatus::Failed,
        }
    }

    fn log_out(&self) -> Result<(), ClaudeError> {
        let (stdin, stdout) = self.launch(|command| {
            command.args(["auth", "logout"]).stderr(Stdio::null());
        })?;
        drop(stdin);
        // Ce qu'il écrit n'est pas lu : seule sa fin compte.
        std::io::copy(&mut BufReader::new(stdout), &mut std::io::sink()).ok();
        if self.wait()? {
            Ok(())
        } else {
            Err(ClaudeError::LogoutFailed)
        }
    }

    fn log_in(&self, on_address: &mut dyn FnMut(&str)) -> Result<(), ClaudeError> {
        // Toujours l'abonnement Claude, jamais une facturation à l'usage (`--console`).
        let (stdin, stdout) = self.launch(|command| {
            command
                .args(["auth", "login", "--claudeai"])
                .stderr(Stdio::piped());
        })?;
        let stderr = self
            .turn()
            .child
            .as_mut()
            .and_then(|child| child.stderr.take());
        let (lines, received) = mpsc::channel();
        if let Some(stderr) = stderr {
            forward_lines(stderr, lines.clone());
        }
        forward_lines(stdout, lines);
        for line in received {
            if let Some(address) = sign_in_address(&line) {
                on_address(address);
            }
        }
        // L'entrée reste ouverte jusqu'à la fin : fermée, `claude` cesserait d'attendre le
        // navigateur (« Input ended before a code was pasted »).
        drop(stdin);
        if self.wait()? {
            Ok(())
        } else {
            Err(ClaudeError::LoginFailed)
        }
    }

    fn send(
        &self,
        workspace: &WorkspaceLocation,
        conversation: Option<&ConversationId>,
        settings: TurnSettings,
        message: &str,
        on_event: &mut dyn FnMut(ClaudeEvent),
    ) -> Result<(), ClaudeError> {
        let stdout = self.start(workspace, conversation, settings, message)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sign_in_address_is_read_from_the_line_that_holds_it() {
        assert_eq!(
            sign_in_address("If the browser didn't open, visit: https://claude.ai/oauth?a=1 "),
            Some("https://claude.ai/oauth?a=1")
        );
        assert_eq!(
            sign_in_address("Sign in at: https://claude.ai/x"),
            Some("https://claude.ai/x")
        );
        assert_eq!(sign_in_address("Opening browser to sign in…"), None);
    }

    fn chosen(model: Option<ClaudeModel>, effort: Option<Effort>) -> Vec<String> {
        let settings = TurnSettings { model, effort };
        let arguments = arguments(None, settings);
        arguments[4..arguments.len() - 10]
            .iter()
            .map(ToString::to_string)
            .collect()
    }

    #[test]
    fn nothing_chosen_passes_neither_model_nor_effort() {
        assert!(chosen(None, None).is_empty());
    }

    #[test]
    fn each_model_is_passed_by_its_claude_code_alias() {
        for (model, alias) in [
            (ClaudeModel::Haiku, "haiku"),
            (ClaudeModel::Sonnet, "sonnet"),
            (ClaudeModel::Opus, "opus"),
            (ClaudeModel::Fable, "fable"),
        ] {
            assert_eq!(chosen(Some(model), None), ["--model", alias]);
        }
    }

    #[test]
    fn each_effort_is_passed_by_its_claude_code_level() {
        for (effort, level) in [
            (Effort::Low, "low"),
            (Effort::Medium, "medium"),
            (Effort::High, "high"),
            (Effort::ExtraHigh, "xhigh"),
            (Effort::Max, "max"),
        ] {
            assert_eq!(chosen(None, Some(effort)), ["--effort", level]);
        }
    }
}
