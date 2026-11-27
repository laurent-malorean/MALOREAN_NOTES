//! Ce que les serveurs MCP extérieurs permis changent à un tour de Claude Code (fiche 0105), et la
//! lecture de `claude mcp` qui le décide. `claude mcp` est interrogé depuis le dossier personnel,
//! avec l'environnement réduit de la fiche 0032, jamais depuis l'espace de travail.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::thread;

use application::ClaudeError;
use domain::external_servers::{ExternalServer, ServerName, hidden_connectors};
use serde_json::Value;

use crate::claude_code_cli::claude_command;
use crate::claude_servers::{parse_description, parse_list};

/// Les réglages de Claude Code qui lui donnent ces serveurs MCP, par nom, pour `--mcp-config`.
pub(crate) fn mcp_config(servers: Vec<(String, Value)>) -> String {
    serde_json::json!({ "mcpServers": servers.into_iter().collect::<serde_json::Map<_, _>>() })
        .to_string()
}

/// Ce que les serveurs MCP extérieurs permis changent à un tour (fiche 0105) : ceux que Claude
/// reçoit et peut appeler sans rien demander, ceux qu'il ne doit pas voir. Les descriptions qu'il
/// porte peuvent contenir des jetons : pas de forme de débogage.
#[derive(Default)]
pub(crate) struct ServerAccess {
    /// Les serveurs ajoutés par l'utilisateur à son Claude Code, que l'application passe elle-même
    /// à Claude Code : leur nom et leur description.
    pub(crate) described: Vec<(String, Value)>,
    /// Le début du nom des outils de chaque serveur permis (`mcp__claude_ai_Noota`) : tous leurs
    /// outils sont permis d'office, et ceux du web au sens du garde-fou.
    pub(crate) prefixes: Vec<String>,
    /// Le début du nom des outils de chaque connecteur que Claude ne doit pas voir.
    pub(crate) hidden: Vec<String>,
    /// Les noms montrés des serveurs permis, pour le dire à Claude.
    pub(crate) names: Vec<String>,
    /// Un connecteur est permis : les connecteurs arrivent d'eux-mêmes, sans le blocage des autres
    /// serveurs.
    pub(crate) connector: bool,
}

impl ServerAccess {
    /// Des serveurs extérieurs sont ouverts à Claude pendant ce tour.
    pub(crate) fn opens_any(&self) -> bool {
        !self.prefixes.is_empty()
    }

    /// Ce que Claude lit en plus de ses consignes : quels services lui sont ouverts, et comment
    /// trouver leurs outils.
    pub(crate) fn instructions(&self) -> String {
        format!(
            "Des services extérieurs sont ouverts à cette conversation : {}. Leurs outils se \
             connectent quelques secondes après le début de la réponse : si vous ne les voyez pas \
             encore, cherchez-les avec l'outil ToolSearch (par le nom du service) avant de \
             répondre qu'ils n'existent pas.",
            self.names.join(", ")
        )
    }

    /// Ce que les serveurs permis `allowed` changent à un tour : un connecteur permis arrive de
    /// lui-même, et ceux qui ne le sont pas sont cachés (`known` donne les noms que Claude Code
    /// connaît, lus seulement si un connecteur est permis) ; un serveur ajouté par l'utilisateur est
    /// décrit par `claude mcp get`, lu maintenant, et passé par l'application. Un serveur que Claude
    /// Code ne décrit plus n'est pas ouvert.
    pub(crate) fn open(
        program: &Path,
        allowed: &[ServerName],
        known: impl FnOnce() -> Vec<ServerName>,
    ) -> Self {
        let mut access = Self::default();
        if allowed.is_empty() {
            return access;
        }
        let (connectors, added): (Vec<&ServerName>, Vec<&ServerName>) =
            allowed.iter().partition(|name| name.is_connector());
        access.connector = !connectors.is_empty();
        if access.connector {
            access.hidden = hidden_connectors(&known(), allowed)
                .iter()
                .map(ServerName::tool_prefix)
                .collect();
        }
        for name in connectors {
            access.prefixes.push(name.tool_prefix());
            access.names.push(name.display().to_owned());
        }
        let descriptions: Vec<Option<Value>> = thread::scope(|scope| {
            let readings: Vec<_> = added
                .iter()
                .map(|name| {
                    scope.spawn(|| {
                        mcp_output(program, &["get", name.as_str()])
                            .filter(|(_, succeeded)| *succeeded)
                            .and_then(|(output, _)| parse_description(&output))
                    })
                })
                .collect();
            readings
                .into_iter()
                .map(|reading| reading.join().ok().flatten())
                .collect()
        });
        for (name, description) in added.into_iter().zip(descriptions) {
            if let Some(description) = description {
                access.prefixes.push(name.tool_prefix());
                access.names.push(name.display().to_owned());
                access
                    .described
                    .push((name.as_str().to_owned(), description));
            }
        }
        access
    }
}

/// Le dossier d'où l'on interroge `claude mcp` : le dossier personnel, jamais l'espace de
/// travail, dont un `.mcp.json` ne doit rien changer à la liste.
fn neutral_folder() -> PathBuf {
    std::env::var_os("HOME").map_or_else(std::env::temp_dir, PathBuf::from)
}

/// `claude mcp` avec `arguments`, interrogé depuis le dossier neutre ; sa sortie et sa réussite.
fn mcp_output(program: &Path, arguments: &[&str]) -> Option<(String, bool)> {
    let output = claude_command(program)
        .arg("mcp")
        .args(arguments)
        .current_dir(neutral_folder())
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    Some((
        String::from_utf8_lossy(&output.stdout).into_owned(),
        output.status.success(),
    ))
}

/// Les serveurs que dit `claude mcp list` (le programme `program`), dans son ordre.
///
/// # Errors
///
/// [`ClaudeError::Missing`] si `claude` ne peut pas être lancé, [`ClaudeError::Failed`] s'il sort en
/// erreur sans avoir dit aucun serveur.
pub(crate) fn list_servers(program: &Path) -> Result<Vec<ExternalServer>, ClaudeError> {
    let (output, succeeded) = mcp_output(program, &["list"]).ok_or(ClaudeError::Missing)?;
    let servers = parse_list(&output);
    if servers.is_empty() && !succeeded {
        return Err(ClaudeError::Failed(
            "« claude mcp list » n'a pas répondu".to_owned(),
        ));
    }
    Ok(servers)
}
