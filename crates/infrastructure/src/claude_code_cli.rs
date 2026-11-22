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
use std::thread::{self, JoinHandle};

use application::{ClaudeAccount, ClaudeCode, ClaudeError, ClaudeStatus, ClaudeTurn};
use domain::app_tools::{APP_TOOLS_SERVER, AppTool, AppToolsKey};
use domain::claude::{
    ChangesAfterWeb, ClaudeEvent, ClaudeModel, ConversationId, Effort, TurnSettings,
};

use crate::claude_stream::StreamReader;
use crate::mcp_relay::RELAY_OPTION;
use crate::web_guard::WebGuard;

/// Les seuls outils offerts à Claude : lire, chercher, créer et modifier des fichiers, lancer
/// des sous-agents, chercher sur le web et lire des pages web ; aucune commande système.
const TOOLS: &str = "Read,Write,Edit,Glob,Grep,Agent,WebSearch,WebFetch";

/// Les outils permis d'office : sans cela, chercher sur le web et lire une page web demanderaient
/// une autorisation, que personne ne donne : sans personne pour répondre, `claude -p` refuse
/// d'office ce qui n'est pas permis (fichiers hors de l'espace de travail compris).
const ALLOWED_TOOLS: &str = "WebSearch,WebFetch";

/// Les options de `claude` dont l'application a besoin : si l'une manque à `claude --help`, ce
/// Claude Code est trop ancien et l'application le dit au lieu de le lancer pour rien.
const REQUIRED_OPTIONS: [&str; 13] = [
    "--output-format",
    "--verbose",
    "--resume",
    "--model",
    "--effort",
    "--tools",
    "--allowed-tools",
    "--permission-mode",
    "--strict-mcp-config",
    "--mcp-config",
    "--disable-slash-commands",
    "--setting-sources",
    "--settings",
];

/// Option facultative, passée seulement si Claude Code la connaît : suivre les textes des
/// sous-agents.
const FORWARD_SUBAGENT_TEXT: &str = "--forward-subagent-text";

/// Ce que dit `claude --help` ; rien si le programme ne répond pas ou ne liste aucune option (on
/// ne peut alors rien en conclure).
fn help_of(program: &Path) -> Option<String> {
    let output = claude_command(program)
        .arg("--help")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    let help = String::from_utf8_lossy(&output.stdout).into_owned();
    help.contains("--").then_some(help)
}

/// Les options nécessaires que ce `claude --help` ne connaît pas, dans l'ordre de la liste.
fn missing_options(help: &str) -> Vec<&'static str> {
    REQUIRED_OPTIONS
        .into_iter()
        .filter(|option| !help.contains(option))
        .collect()
}

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

/// Le relais des outils de l'application (fiche 0040) : le programme que Claude Code lance pour
/// les joindre, et la prise locale de l'application qu'il relie.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppToolsRelay {
    /// Le programme du relais : celui de l'application, lancé avec [`RELAY_OPTION`].
    pub program: PathBuf,
    /// La prise locale de l'application.
    pub socket: PathBuf,
}

impl AppToolsRelay {
    /// Les réglages de Claude Code qui lui donnent le seul serveur MCP de l'application, joint
    /// par le relais avec la clé du tour, pour `--mcp-config`.
    fn mcp_config(&self, key: &AppToolsKey) -> String {
        serde_json::json!({
            "mcpServers": {
                APP_TOOLS_SERVER: {
                    "command": self.program,
                    "args": [RELAY_OPTION, self.socket, key.as_str()],
                }
            }
        })
        .to_string()
    }
}

/// Les outils permis d'office quand les outils de l'application sont offerts : ceux du web et,
/// nommés un par un, tous ceux de l'application ; rien de plus.
fn allowed_tools_with_app_tools() -> String {
    AppTool::ALL
        .iter()
        .map(|tool| tool.full_name())
        .fold(ALLOWED_TOOLS.to_owned(), |allowed, tool| {
            format!("{allowed},{tool}")
        })
}

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
    /// Ce que le programme du tour dit sur sa sortie d'erreur, lu à part jusqu'à sa fin.
    reason: Option<JoinHandle<String>>,
}

/// Le nombre de dernières lignes de la sortie d'erreur gardées pour dire pourquoi un tour a échoué.
const REASON_LINES: usize = 3;

/// Lit `output` sur un fil à part ; rend ses dernières lignes, sur une seule ligne.
fn read_reason(output: impl Read + Send + 'static) -> JoinHandle<String> {
    thread::spawn(move || {
        let lines: Vec<String> = BufReader::new(output)
            .lines()
            .map_while(Result::ok)
            .map(|line| line.trim().to_owned())
            .filter(|line| !line.is_empty())
            .collect();
        lines[lines.len().saturating_sub(REASON_LINES)..].join(" ")
    })
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
    /// Le relais des outils de l'application, s'ils peuvent être offerts.
    relay: Option<AppToolsRelay>,
    turn: Mutex<Turn>,
}

impl ClaudeCodeCli {
    /// Claude Code lancé par le programme rangé à `program`.
    #[must_use]
    pub fn new(program: impl Into<PathBuf>) -> Self {
        Self {
            candidates: vec![program.into()],
            relay: None,
            turn: Mutex::default(),
        }
    }

    /// Le même Claude Code, qui offre les outils de l'application aux tours qui portent une clé,
    /// par le relais `relay`.
    #[must_use]
    pub fn with_app_tools(mut self, relay: AppToolsRelay) -> Self {
        self.relay = Some(relay);
        self
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
            relay: None,
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

    /// Lance le programme pour un tour et lui donne `message` ; rend sa sortie, et le garde-fou
    /// du web du tour, à garder jusqu'à sa fin (aucun si l'utilisateur a autorisé les
    /// modifications pour ce tour).
    fn start(
        &self,
        ClaudeTurn {
            workspace,
            conversation,
            settings,
            tools,
        }: ClaudeTurn<'_>,
        message: &str,
    ) -> Result<(ChildStdout, Option<WebGuard>), ClaudeError> {
        if !Path::new(workspace.as_str()).is_dir() {
            return Err(ClaudeError::Failed(format!(
                "l'espace de travail {} est introuvable",
                workspace.as_str()
            )));
        }
        // Ce que ce Claude Code connaît : trop ancien, il le dit ; sinon les textes des sous-agents
        // ne sont suivis que s'il sait le faire.
        let help = self.program().and_then(help_of);
        if let Some(help) = &help
            && let missing @ [_, ..] = missing_options(help).as_slice()
        {
            return Err(ClaudeError::Failed(format!(
                "Claude Code ne connaît pas {} : mettez-le à jour (« claude update » dans le Terminal)",
                missing.join(", ")
            )));
        }
        let forward_subagent_text = help.is_some_and(|help| help.contains(FORWARD_SUBAGENT_TEXT));
        let guard = match settings.changes_after_web {
            ChangesAfterWeb::HeldBack => Some(WebGuard::new().map_err(|_| {
                ClaudeError::Failed("le garde-fou du web n'a pas pu être posé".to_owned())
            })?),
            ChangesAfterWeb::Allowed => None,
        };
        let hooks = guard.as_ref().map(WebGuard::settings);
        let mcp = self
            .relay
            .as_ref()
            .zip(tools)
            .map(|(relay, key)| relay.mcp_config(key));
        let (mut stdin, stdout) = self.launch(|command| {
            command
                .args(arguments(
                    conversation,
                    settings,
                    mcp.as_deref(),
                    hooks.as_deref(),
                    forward_subagent_text,
                ))
                .current_dir(workspace.as_str())
                .stderr(Stdio::piped());
        })?;
        let errors = self
            .turn()
            .child
            .as_mut()
            .and_then(|child| child.stderr.take());
        self.turn().reason = errors.map(read_reason);
        // Un programme qui s'arrête sans tout lire ne garde pas le message : sa fin, lue sur sa
        // sortie, dit ce qu'il en est.
        stdin.write_all(message.as_bytes()).ok();
        Ok((stdout, guard))
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
            reason: None,
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
        let succeeded = self.wait()?;
        let reason = self
            .turn()
            .reason
            .take()
            .and_then(|reading| reading.join().ok())
            .filter(|reason| !reason.is_empty());
        if succeeded || summarized {
            Ok(())
        } else {
            Err(ClaudeError::Failed(
                reason.unwrap_or_else(|| "aucun bilan".to_owned()),
            ))
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
/// autorisations de Claude, le seul serveur MCP de l'application (`mcp`) s'il est offert, et les
/// crochets du garde-fou du web (`hooks`) s'il y en a un.
fn arguments(
    conversation: Option<&ConversationId>,
    settings: TurnSettings,
    mcp: Option<&str>,
    hooks: Option<&str>,
    forward_subagent_text: bool,
) -> Vec<String> {
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
    let allowed = mcp.map(|_| allowed_tools_with_app_tools());
    arguments.extend([
        "--tools",
        TOOLS,
        "--allowed-tools",
        allowed.as_deref().unwrap_or(ALLOWED_TOOLS),
        "--permission-mode",
        "acceptEdits",
        "--strict-mcp-config",
    ]);
    if let Some(mcp) = mcp {
        arguments.extend(["--mcp-config", mcp]);
    }
    // Aucun réglage du dossier ni de l'utilisateur : un `.claude/settings.json` posé parmi les
    // notes (crochets, permissions plus larges) ne doit rien changer ; `--settings` s'applique.
    arguments.extend(["--disable-slash-commands", "--setting-sources", ""]);
    if forward_subagent_text {
        arguments.push(FORWARD_SUBAGENT_TEXT);
    }
    if let Some(hooks) = hooks {
        arguments.extend(["--settings", hooks]);
    }
    arguments.into_iter().map(str::to_owned).collect()
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
            }) => match help_of(program).map(|help| missing_options(&help)) {
                Some(missing) if !missing.is_empty() => {
                    ClaudeStatus::Incompatible(missing.join(", "))
                }
                _ => ClaudeStatus::Ready(ClaudeAccount {
                    email,
                    organization: org_name,
                }),
            },
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
        turn: ClaudeTurn<'_>,
        message: &str,
        on_event: &mut dyn FnMut(ClaudeEvent),
    ) -> Result<(), ClaudeError> {
        // Le garde-fou vit jusqu'à la fin du tour : son dossier est effacé avec lui.
        let (stdout, _guard) = self.start(turn, message)?;
        let mut summarized = false;
        let mut reader = StreamReader::default();
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            for event in reader.events_of(&line) {
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
#[path = "claude_code_cli_tests.rs"]
mod tests;
