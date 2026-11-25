//! Les outils de l'application offerts à Claude pendant un tour de la colonne Claude Code
//! (fiche 0040) : chaque tour a sa clé, que le relais présente ; une demande sans la clé du tour
//! en cours est refusée. Les outils passent par les cas d'usage, comme l'interface, et
//! n'agissent que dans l'espace de travail du tour, désigné par son nom.

mod catalog;
mod changing;
mod connection;
mod mcp;
mod meaning;
mod reading;
mod screen;

pub(super) use connection::Connection;
pub use screen::AppScreen;
pub(super) use screen::View;

use std::hash::{BuildHasher, Hasher, RandomState};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{MutexGuard, PoisonError};

use application::WorkspaceName;
use domain::Folder;
use domain::app_tools::{AppTool, AppToolsKey};
use serde_json::Value;

use super::Session;

/// Ce que les outils visent : un espace de travail, désigné par son nom, et le dossier des
/// modèles que l'interface a choisi, s'il l'a fait.
#[derive(Debug, Clone)]
pub(super) struct ToolsScope {
    workspace: WorkspaceName,
    templates: Option<Folder>,
}

/// Ce que les outils savent du tour en cours : sa clé, et ce qu'il vise.
#[derive(Debug, Clone)]
pub(super) struct ToolsTurn {
    key: AppToolsKey,
    scope: ToolsScope,
}

/// Les outils ouverts pour un tour ; lâchés à la fin du tour, ils se referment.
pub(super) struct OpenTools<'a> {
    session: &'a Session,
    key: AppToolsKey,
}

impl OpenTools<'_> {
    /// La clé du tour, à donner à Claude Code.
    pub(super) const fn key(&self) -> &AppToolsKey {
        &self.key
    }
}

impl Drop for OpenTools<'_> {
    fn drop(&mut self) {
        *self.session.tools_turn() = None;
    }
}

/// Ce que l'application répond à une demande sans la clé du tour en cours.
const TURN_KEY_REFUSED: &str = "clé refusée : les outils de MALOREAN Notes ne servent que pendant \
     un tour de la colonne Claude Code";

/// Les clés déjà tirées : chacune hache un nombre différent.
static KEYS_DRAWN: AtomicU64 = AtomicU64::new(0);

/// Une clé neuve, que personne ne peut deviner : 128 bits tirés de clés de hachage choisies au
/// hasard par le système pour ce programme.
fn new_key() -> AppToolsKey {
    let part = || {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u64(KEYS_DRAWN.fetch_add(1, Ordering::Relaxed));
        hasher.finish()
    };
    let key = format!("{:016x}{:016x}", part(), part());
    AppToolsKey::new(key).unwrap_or_else(|| unreachable!("une clé de 32 chiffres n'est pas vide"))
}

/// Le texte d'un argument que l'outil exige.
fn required<'a>(arguments: &'a Value, field: &str) -> Result<&'a str, String> {
    optional(arguments, field).ok_or_else(|| format!("il manque « {field} »"))
}

/// Le texte d'un argument que l'outil n'exige pas, s'il est donné et non vide.
fn optional<'a>(arguments: &'a Value, field: &str) -> Option<&'a str> {
    arguments[field]
        .as_str()
        .filter(|text| !text.trim().is_empty())
}

/// Ce que rend un outil, écrit pour Claude.
fn written(value: &impl serde::Serialize) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| error.to_string())
}

impl Session {
    fn tools_turn(&self) -> MutexGuard<'_, Option<ToolsTurn>> {
        self.tools_turn
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    /// Ouvre les outils de l'application pour un tour dans l'espace de travail `workspace`, avec
    /// le dossier des modèles `templates` ; rien si un tour les tient déjà (le tour sera refusé).
    pub(super) fn open_tools(
        &self,
        workspace: WorkspaceName,
        templates: Option<Folder>,
    ) -> Option<OpenTools<'_>> {
        let mut turn = self.tools_turn();
        if turn.is_some() {
            return None;
        }
        let key = new_key();
        *turn = Some(ToolsTurn {
            key: key.clone(),
            scope: ToolsScope {
                workspace,
                templates,
            },
        });
        Some(OpenTools { session: self, key })
    }

    /// La réponse à une ligne du protocole MCP reçue avec la clé `key`, s'il en faut une : les
    /// outils ne répondent qu'à la clé du tour en cours.
    #[must_use]
    pub fn answer_app_tools(&self, key: &str, line: &str) -> Option<String> {
        let turn = self
            .tools_turn()
            .clone()
            .filter(|turn| turn.key.as_str() == key);
        match turn {
            Some(turn) => mcp::answer(line, None, |tool, arguments| {
                self.call_tool(&turn.scope, tool, arguments)
            }),
            None => mcp::answer(line, Some(TURN_KEY_REFUSED), |_, _| {
                unreachable!("demande refusée")
            }),
        }
    }

    /// Joue un outil, dans l'espace de travail du tour seulement.
    fn call_tool(&self, scope: &ToolsScope, tool: AppTool, arguments: &Value) -> mcp::ToolOutcome {
        let opened = self.opened().map_err(|error| error.message)?;
        if !opened.name.same_as(&scope.workspace) {
            return Err(format!(
                "l'espace de travail « {} » de ce tour n'est plus ouvert : rien n'a été fait",
                scope.workspace.as_str()
            ));
        }
        if tool.changes_notes() {
            return self.call_changing_tool(scope, tool, arguments);
        }
        match tool {
            AppTool::SearchNotes => self.tool_search_notes(arguments),
            AppTool::SearchByMeaning => self.tool_search_by_meaning(arguments),
            AppTool::ListTags => written(&self.list_tags().map_err(|e| e.message)?),
            AppTool::LinkingNotes => self.tool_linking_notes(arguments),
            AppTool::ListTemplates => self.tool_list_templates(scope),
            AppTool::ViewedNote => self.tool_viewed_note(scope),
            AppTool::ShowNote => self.tool_show_note(arguments),
            AppTool::ListVersions => {
                let path = required(arguments, "path")?;
                written(&self.list_versions(path).map_err(|e| e.message)?)
            }
            AppTool::ReadVersion => {
                let (path, version) = (
                    required(arguments, "path")?,
                    required(arguments, "version")?,
                );
                self.read_version(path, version).map_err(|e| e.message)
            }
            _ => unreachable!("un outil qui change une note est joué à part"),
        }
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod changing_tests;

#[cfg(test)]
mod crm_tests;

#[cfg(test)]
mod screen_tests;

#[cfg(test)]
mod meaning_tests;
