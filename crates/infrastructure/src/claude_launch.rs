//! Les arguments de `claude` pour un tour (fiches 0032, 0040 et 0105) : flux JSON, conversation
//! continuée, modèle et niveau d'effort, autorisations de Claude, serveurs MCP qu'il reçoit, crochets
//! du garde-fou du web.

use domain::app_tools::AppTool;
use domain::claude::{ClaudeModel, ConversationId, Effort, TurnSettings};

use crate::claude_server_access::ServerAccess;

/// Les seuls outils offerts à Claude : lire, chercher, créer et modifier des fichiers, lancer
/// des sous-agents, chercher sur le web et lire des pages web ; aucune commande système.
pub(crate) const TOOLS: &str = "Read,Write,Edit,Glob,Grep,Agent,WebSearch,WebFetch";

/// L'outil de plus offert quand des serveurs MCP extérieurs sont permis : les connecteurs arrivent
/// quelques secondes après le début du tour, et Claude va chercher leurs outils par lui une fois
/// prêts (sans lui, il répondait qu'ils n'existaient pas : fiche 0105).
pub(crate) const TOOL_SEARCH: &str = "ToolSearch";

/// Les outils permis d'office : sans cela, chercher sur le web et lire une page web demanderaient
/// une autorisation, que personne ne donne : sans personne pour répondre, `claude -p` refuse
/// d'office ce qui n'est pas permis (fichiers hors de l'espace de travail compris).
pub(crate) const ALLOWED_TOOLS: &str = "WebSearch,WebFetch";

/// Option facultative, passée seulement si Claude Code la connaît : suivre les textes des
/// sous-agents.
pub(crate) const FORWARD_SUBAGENT_TEXT: &str = "--forward-subagent-text";

/// Les outils permis d'office quand les outils de l'application sont offerts : ceux du web et,
/// nommés un par un, tous ceux de l'application ; rien de plus.
pub(crate) fn allowed_tools_with_app_tools() -> String {
    AppTool::ALL
        .iter()
        .map(|tool| tool.full_name())
        .fold(ALLOWED_TOOLS.to_owned(), |allowed, tool| {
            format!("{allowed},{tool}")
        })
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

/// Ce qu'il faut pour écrire les arguments d'un tour : flux JSON, conversation continuée, modèle
/// et niveau d'effort choisis, autorisations de Claude, les serveurs MCP qu'il reçoit (celui de
/// l'application et les serveurs ajoutés par l'utilisateur, décrits dans `mcp`) et les crochets
/// du garde-fou du web (`hooks`) s'il y en a un.
pub(crate) struct Launch<'a> {
    pub(crate) conversation: Option<&'a ConversationId>,
    pub(crate) settings: TurnSettings,
    /// Les réglages `--mcp-config` : les serveurs que l'application passe elle-même.
    pub(crate) mcp: Option<String>,
    /// Les outils de l'application sont offerts, et permis d'office un par un.
    pub(crate) app_tools: bool,
    pub(crate) hooks: Option<String>,
    pub(crate) forward_subagent_text: bool,
    /// Les serveurs MCP extérieurs permis, ouverts ou cachés.
    pub(crate) access: &'a ServerAccess,
}

/// Les arguments d'un tour (voir [`Launch`]).
pub(crate) fn arguments(launch: &Launch<'_>) -> Vec<String> {
    let mut arguments: Vec<String> = ["-p", "--output-format", "stream-json", "--verbose"]
        .map(str::to_owned)
        .to_vec();
    arguments.extend(conversation_arguments(launch));
    arguments.extend(permission_arguments(launch));
    arguments.extend(server_arguments(launch));
    // Aucun réglage du dossier ni de l'utilisateur : un `.claude/settings.json` posé parmi les
    // notes (crochets, permissions plus larges) ne doit rien changer ; `--settings` s'applique.
    arguments.extend(["--disable-slash-commands", "--setting-sources", ""].map(str::to_owned));
    if launch.forward_subagent_text {
        arguments.push(FORWARD_SUBAGENT_TEXT.to_owned());
    }
    if let Some(hooks) = &launch.hooks {
        arguments.extend(["--settings".to_owned(), hooks.clone()]);
    }
    arguments
}

/// La conversation continuée, le modèle et le niveau d'effort choisis.
fn conversation_arguments(launch: &Launch<'_>) -> Vec<String> {
    let mut arguments = Vec::new();
    if let Some(conversation) = launch.conversation {
        arguments.extend(["--resume", conversation.as_str()]);
    }
    if let Some(model) = launch.settings.model {
        arguments.extend(["--model", model_alias(model)]);
    }
    if let Some(effort) = launch.settings.effort {
        arguments.extend(["--effort", effort_level(effort)]);
    }
    arguments.into_iter().map(str::to_owned).collect()
}

/// Les outils offerts à Claude, ceux qu'il peut lancer sans rien demander, et le mode de
/// permission.
fn permission_arguments(launch: &Launch<'_>) -> Vec<String> {
    let access = launch.access;
    let tools = if access.opens_any() {
        format!("{TOOLS},{TOOL_SEARCH}")
    } else {
        TOOLS.to_owned()
    };
    let base = if launch.app_tools {
        allowed_tools_with_app_tools()
    } else {
        ALLOWED_TOOLS.to_owned()
    };
    let allowed = access
        .prefixes
        .iter()
        .fold(base, |allowed, prefix| format!("{allowed},{prefix}"));
    vec![
        "--tools".to_owned(),
        tools,
        "--allowed-tools".to_owned(),
        allowed,
        "--permission-mode".to_owned(),
        "acceptEdits".to_owned(),
    ]
}

/// Les serveurs MCP que Claude reçoit : seuls ceux que l'application passe elle-même, sauf si un
/// connecteur est permis (les connecteurs arrivent d'eux-mêmes, et ceux qui ne sont pas permis sont
/// cachés ; ils ne sont de toute façon pas permis d'office : leur appel est refusé).
fn server_arguments(launch: &Launch<'_>) -> Vec<String> {
    let access = launch.access;
    let mut arguments = Vec::new();
    if !access.connector {
        arguments.push("--strict-mcp-config".to_owned());
    }
    if let Some(mcp) = &launch.mcp {
        arguments.extend(["--mcp-config".to_owned(), mcp.clone()]);
    }
    if !access.hidden.is_empty() {
        arguments.extend(["--disallowed-tools".to_owned(), access.hidden.join(",")]);
    }
    if access.opens_any() {
        arguments.extend(["--append-system-prompt".to_owned(), access.instructions()]);
    }
    arguments
}

#[cfg(test)]
#[path = "claude_launch_tests.rs"]
mod tests;
