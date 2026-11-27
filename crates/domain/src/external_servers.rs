//! Les serveurs MCP extérieurs (fiche 0105) : ceux que Claude Code connaît sur ce Mac, autres que
//! celui de l'application, leur état, ceux que l'utilisateur a permis à Claude dans la colonne
//! Claude Code, et le nom d'un outil de l'un d'eux tel qu'on le montre.

use std::collections::BTreeSet;

/// Le début du nom d'un connecteur du compte claude.ai, que Claude Code donne à chacun
/// (« claude.ai Noota »).
pub const CONNECTOR_PREFIX: &str = "claude.ai ";

/// Le début du nom d'un serveur apporté par un plugin de Claude Code.
const PLUGIN_PREFIX: &str = "plugin:";

/// Le début du nom d'un outil d'un serveur MCP, chez Claude Code.
const TOOL_PREFIX: &str = "mcp__";

/// Ce que Claude Code met devant le nom d'un connecteur dans le nom de ses outils.
const CONNECTOR_TOOL_PREFIX: &str = "claude_ai_";

/// Le nom d'un serveur MCP extérieur, tel que Claude Code le donne : jamais vide, sans espace en
/// tête ni en queue, sur une seule ligne.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ServerName(String);

impl ServerName {
    /// Le nom `text`, nettoyé de ses espaces de tête et de queue ; rien s'il est vide ou s'il
    /// contient un caractère de contrôle (retour à la ligne compris).
    #[must_use]
    pub fn new(text: &str) -> Option<Self> {
        let name = text.trim();
        (!name.is_empty() && !name.chars().any(char::is_control)).then(|| Self(name.to_owned()))
    }

    /// Le nom tel que Claude Code le donne.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Est-ce un connecteur du compte claude.ai ?
    #[must_use]
    pub fn is_connector(&self) -> bool {
        self.0.starts_with(CONNECTOR_PREFIX)
    }

    /// Est-ce un serveur apporté par un plugin de Claude Code ? Il n'est jamais proposé.
    #[must_use]
    pub fn is_plugin(&self) -> bool {
        self.0.starts_with(PLUGIN_PREFIX)
    }

    /// Le nom montré : celui d'un connecteur sans le préfixe « claude.ai ».
    #[must_use]
    pub fn display(&self) -> &str {
        self.0
            .strip_prefix(CONNECTOR_PREFIX)
            .map_or(self.0.as_str(), str::trim_start)
    }

    /// Le début du nom des outils de ce serveur chez Claude Code (`mcp__claude_ai_Noota`) : chaque
    /// caractère hors lettres, chiffres, `_` et `-` devient `_` ; pour un connecteur, les `_` de
    /// suite n'en font qu'un et ceux du début et de la fin tombent.
    #[must_use]
    pub fn tool_prefix(&self) -> String {
        let replaced: String = self
            .0
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let normalized = if self.is_connector() {
            let mut collapsed = String::new();
            for c in replaced.chars() {
                if c != '_' || !collapsed.ends_with('_') {
                    collapsed.push(c);
                }
            }
            collapsed.trim_matches('_').to_owned()
        } else {
            replaced
        };
        format!("{TOOL_PREFIX}{normalized}")
    }
}

/// L'état d'un serveur, tel que Claude Code le dit quand l'application lit la liste.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ServerState {
    /// Le serveur répond.
    Connected,
    /// La connexion au service n'est pas faite.
    ToConnect,
    /// Le serveur ne répond pas.
    Failed,
    /// Un serveur permis que Claude Code ne connaît plus.
    NotFound,
}

/// Un serveur MCP extérieur que Claude Code connaît, avec son état.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalServer {
    /// Son nom.
    pub name: ServerName,
    /// Son état.
    pub state: ServerState,
}

/// Une ligne de la liste montrée à l'utilisateur : un serveur, et s'il est permis.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListedServer {
    /// Le serveur, avec son état.
    pub server: ExternalServer,
    /// L'utilisateur l'a coché.
    pub allowed: bool,
}

/// La liste montrée à l'utilisateur : les serveurs que Claude Code connaît, sans ceux des
/// plugins, triés par nom montré (sans tenir compte de la casse), chacun permis ou non ; puis,
/// parmi les serveurs `allowed`, ceux que Claude Code ne connaît plus, « introuvables », qui
/// restent dans la liste, cochés, jusqu'à ce que l'utilisateur les décoche.
#[must_use]
pub fn listed_servers(known: Vec<ExternalServer>, allowed: &[ServerName]) -> Vec<ListedServer> {
    let mut seen = BTreeSet::new();
    let mut listed: Vec<ListedServer> = known
        .into_iter()
        .filter(|server| !server.name.is_plugin() && seen.insert(server.name.clone()))
        .map(|server| ListedServer {
            allowed: allowed.contains(&server.name),
            server,
        })
        .collect();
    listed.extend(
        allowed
            .iter()
            .filter(|name| !name.is_plugin() && !seen.contains(*name))
            .map(|name| ListedServer {
                server: ExternalServer {
                    name: name.clone(),
                    state: ServerState::NotFound,
                },
                allowed: true,
            }),
    );
    listed.sort_by_cached_key(|line| {
        (
            line.server.name.display().to_lowercase(),
            line.server.name.clone(),
        )
    });
    listed
}

/// Les connecteurs de `known` que l'utilisateur n'a pas permis : ceux que Claude ne doit pas voir.
#[must_use]
pub fn hidden_connectors(known: &[ServerName], allowed: &[ServerName]) -> Vec<ServerName> {
    known
        .iter()
        .filter(|name| name.is_connector() && !allowed.contains(name))
        .cloned()
        .collect()
}

/// Le nom montré d'une action de Claude sur un outil d'un serveur MCP extérieur : le serveur, un
/// point médian, puis l'outil (« Noota · search_records »). Rien si `tool` n'est pas le nom d'un
/// outil de serveur MCP (`mcp__serveur__outil`).
#[must_use]
pub fn external_tool_label(tool: &str) -> Option<String> {
    let (server, name) = tool.strip_prefix(TOOL_PREFIX)?.split_once("__")?;
    if server.is_empty() || name.is_empty() {
        return None;
    }
    let server = server
        .strip_prefix(CONNECTOR_TOOL_PREFIX)
        .map_or_else(|| server.to_owned(), |named| named.replace('_', " "));
    Some(format!("{server} · {name}"))
}

#[cfg(test)]
#[path = "external_servers_tests.rs"]
mod tests;
