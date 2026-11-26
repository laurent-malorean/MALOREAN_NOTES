//! Les outils de l'application offerts à Claude pendant un tour de la colonne Claude Code
//! (fiche 0040) : chaque tour a sa clé, que le relais présente ; une demande sans la clé du tour
//! en cours est refusée. Les outils passent par les cas d'usage, comme l'interface, et
//! n'agissent que dans l'espace de travail du tour, désigné par son nom.

mod canvas;
mod canvas_changing;
mod catalog;
mod catalog_mind_map;
mod changing;
mod connection;
mod crm;
mod crm_budget;
mod crm_changing;
mod folders;
mod mcp;
mod meaning;
mod mind_map;
mod reading;
mod screen;
mod workspaces;

pub(super) use connection::Connection;
pub use screen::AppScreen;
pub(super) use screen::View;

use std::hash::{BuildHasher, Hasher, RandomState};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{MutexGuard, PoisonError};

use application::WorkspaceName;
use domain::app_tools::{AppTool, AppToolsKey};
use serde_json::Value;

use workspaces::Aim;

use super::Session;

/// L'espace de travail que vise un outil appelé sans le paramètre `workspace`.
#[derive(Debug, Clone)]
pub(super) enum Fallback {
    /// Celui du tour de la colonne Claude Code, qui doit encore être ouvert.
    Turn(WorkspaceName),
    /// Celui qui est ouvert chez l'utilisateur à l'instant de l'appel, s'il est autorisé pour les
    /// IA (une IA branchée, fiche 0074).
    Opened,
}

/// Ce que les outils visent : l'espace de travail par défaut, désigné par son nom.
#[derive(Debug, Clone)]
pub(super) struct ToolsScope {
    fallback: Fallback,
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

/// Le texte d'un argument que l'outil exige, vide permis : la racine d'un espace de travail est
/// le chemin vide, et un nom vide reçoit le message de l'interface.
fn given<'a>(arguments: &'a Value, field: &str) -> Result<&'a str, String> {
    arguments[field]
        .as_str()
        .ok_or_else(|| format!("il manque « {field} »"))
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

    /// Ouvre les outils de l'application pour un tour dans l'espace de travail `workspace` ; rien
    /// si un tour les tient déjà (le tour sera refusé).
    pub(super) fn open_tools(&self, workspace: WorkspaceName) -> Option<OpenTools<'_>> {
        let mut turn = self.tools_turn();
        if turn.is_some() {
            return None;
        }
        let key = new_key();
        *turn = Some(ToolsTurn {
            key: key.clone(),
            scope: ToolsScope {
                fallback: Fallback::Turn(workspace),
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

    /// Joue un outil, dans l'espace de travail que vise l'appel (fiche 0074) : celui que nomme
    /// `workspace` s'il est autorisé pour les IA, sinon celui par défaut du tour ou de l'IA.
    fn call_tool(&self, scope: &ToolsScope, tool: AppTool, arguments: &Value) -> mcp::ToolOutcome {
        if !tool.aims_at_a_workspace() {
            return self.tool_list_workspaces();
        }
        match self.aim_of(scope, arguments)? {
            Aim::Opened => self.play_tool(tool, arguments),
            Aim::Elsewhere(name) => {
                if tool.uses_screen() {
                    return Err(format!(
                        "« {} » parle de l'écran de l'utilisateur : il ne vise que l'espace de \
                         travail ouvert chez lui",
                        tool.name()
                    ));
                }
                self.in_background_workspace(&name, || self.play_tool(tool, arguments))
            }
        }
    }

    /// Joue un outil dans l'espace de travail que `Session::opened` désigne en ce moment.
    fn play_tool(&self, tool: AppTool, arguments: &Value) -> mcp::ToolOutcome {
        if tool.changes_a_crm() {
            return self.call_crm_tool(tool, arguments);
        }
        if tool.changes_notes() {
            return self.call_changing_tool(tool, arguments);
        }
        match tool {
            AppTool::SearchNotes => self.tool_search_notes(arguments),
            AppTool::SearchByMeaning => self.tool_search_by_meaning(arguments),
            AppTool::ListTags => written(&self.list_tags().map_err(|e| e.message)?),
            AppTool::ListFolders => self.tool_list_folders(),
            AppTool::LinkingNotes => self.tool_linking_notes(arguments),
            AppTool::ReadNote => self.tool_read_note(arguments),
            AppTool::ReadMindMap => self.tool_read_mind_map(arguments),
            AppTool::ReadCanvas => self.tool_read_canvas(arguments),
            AppTool::ReadCrm => self.tool_read_crm(arguments),
            AppTool::ListTemplates => self.tool_list_templates(),
            AppTool::ViewedNote => self.tool_viewed_note(),
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
mod canvas_catalog_tests;

#[cfg(test)]
mod canvas_changing_tests;

#[cfg(test)]
mod canvas_creating_tests;

#[cfg(test)]
mod canvas_reading_tests;

#[cfg(test)]
mod canvas_tags_tests;

#[cfg(test)]
mod changing_tests;

#[cfg(test)]
mod crm_actions_tests;

#[cfg(test)]
mod crm_catalog_tests;

#[cfg(test)]
mod crm_limits_tests;

#[cfg(test)]
mod crm_moving_tests;

#[cfg(test)]
mod crm_reading_tests;

#[cfg(test)]
mod crm_records_tests;

#[cfg(test)]
mod crm_tags_tests;

#[cfg(test)]
mod crm_trash_tests;

#[cfg(test)]
mod crm_tests;

#[cfg(test)]
mod folders_tests;

#[cfg(test)]
mod reading_tests;

#[cfg(test)]
mod replacing_tests;

#[cfg(test)]
mod screen_tests;

#[cfg(test)]
mod search_matches_tests;

#[cfg(test)]
mod templates_tests;

#[cfg(test)]
mod meaning_tests;

#[cfg(test)]
mod notebook_creating_tests;

#[cfg(test)]
mod mind_map_editing_tests;

#[cfg(test)]
mod mind_map_moving_tests;

#[cfg(test)]
mod mind_map_tests;

#[cfg(test)]
mod mind_map_text_tests;

#[cfg(test)]
mod workspaces_tests;
