//! Les espaces de travail pour les IA (fiche 0074) : lister ceux que l'utilisateur a autorisés,
//! choisir celui d'un outil par le paramètre `workspace`, ouvrir en arrière-plan celui qui n'est
//! pas l'espace ouvert. Une IA ne voit que des noms, jamais des chemins.

use application::WorkspaceName;
use application::use_cases::ManageWorkspaces;
use serde::Serialize;
use serde_json::Value;

use super::{Fallback, ToolsScope, mcp, optional, written};
use crate::ApiError;
use crate::session::{Session, redirect};

/// Ce que dit la liste quand aucun espace n'est autorisé.
const NONE_ALLOWED: &str = "aucun espace de travail n'est autorisé pour les IA : l'utilisateur \
     doit en cocher un dans les Réglages de MALOREAN Notes, onglet « Brancher une IA »";

/// Ce que dit l'appel quand aucun espace n'est ouvert chez l'utilisateur et que l'IA n'en nomme
/// pas.
const NONE_OPEN: &str = "aucun espace de travail n'est ouvert chez l'utilisateur : nommez-en un \
     avec le paramètre « workspace » (voir `list_workspaces`)";

/// L'espace de travail sur lequel un appel d'outil agit.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Aim {
    /// L'espace ouvert chez l'utilisateur.
    Opened,
    /// Un autre espace autorisé, que l'application ouvre en arrière-plan le temps de l'appel.
    Elsewhere(WorkspaceName),
}

/// Un espace autorisé, tel que l'IA le lit : son nom, et s'il est ouvert chez l'utilisateur.
#[derive(Debug, Serialize)]
struct ListedWorkspace {
    name: String,
    open: bool,
}

/// Ce que rend `list_workspaces`.
#[derive(Debug, Serialize)]
struct WorkspaceList {
    workspaces: Vec<ListedWorkspace>,
    /// Pourquoi la liste est vide, et que faire.
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<&'static str>,
}

fn said(error: impl Into<ApiError>) -> String {
    error.into().message
}

impl Session {
    fn manage_workspaces(&self) -> ManageWorkspaces<'_> {
        ManageWorkspaces::new(&*self.opener, &*self.preferences)
    }

    /// Les espaces de travail autorisés pour les IA, avec celui qui est ouvert.
    pub(super) fn tool_list_workspaces(&self) -> Result<String, String> {
        let workspaces = self.manage_workspaces().list().map_err(said)?;
        let opened = self.opened().ok().map(|opened| opened.name);
        let workspaces: Vec<ListedWorkspace> = workspaces
            .allowed()
            .iter()
            .map(|workspace| ListedWorkspace {
                name: workspace.name.as_str().to_owned(),
                open: opened
                    .as_ref()
                    .is_some_and(|opened| opened.same_as(&workspace.name)),
            })
            .collect();
        let message = workspaces.is_empty().then_some(NONE_ALLOWED);
        written(&WorkspaceList {
            workspaces,
            message,
        })
    }

    /// L'espace de travail que vise l'appel : celui que nomme `workspace`, qui doit être autorisé
    /// pour les IA (la colonne Claude Code peut aussi nommer celui de son tour) ; sans lui, celui
    /// du tour de la colonne, qui doit être encore ouvert, ou l'espace ouvert chez l'utilisateur
    /// pour une IA branchée, s'il est autorisé. L'autorisation est relue à chaque appel.
    pub(super) fn aim_of(&self, scope: &ToolsScope, arguments: &Value) -> Result<Aim, String> {
        let opened = self.opened().ok().map(|opened| opened.name);
        let named = optional(arguments, "workspace")
            .map(WorkspaceName::new)
            .transpose()
            .map_err(said)?;
        let wanted = match (&scope.fallback, named) {
            (Fallback::Turn(turn), named) if named.as_ref().is_none_or(|n| n.same_as(turn)) => {
                return Self::turn_workspace_is_open(turn, opened.as_ref());
            }
            (_, Some(named)) => named,
            (_, None) => opened.clone().ok_or_else(|| NONE_OPEN.to_owned())?,
        };
        let workspaces = self.manage_workspaces().list().map_err(said)?;
        let allowed = workspaces.allowed_named(&wanted).map_err(said)?;
        let is_open = opened
            .as_ref()
            .is_some_and(|opened| opened.same_as(&allowed.name));
        Ok(if is_open {
            Aim::Opened
        } else {
            Aim::Elsewhere(allowed.name.clone())
        })
    }

    /// L'espace du tour de la colonne Claude Code est-il encore celui qui est ouvert ?
    fn turn_workspace_is_open(
        turn: &WorkspaceName,
        opened: Option<&WorkspaceName>,
    ) -> Result<Aim, String> {
        match opened {
            Some(opened) if opened.same_as(turn) => Ok(Aim::Opened),
            Some(_) => Err(format!(
                "l'espace de travail « {} » de ce tour n'est plus ouvert : rien n'a été fait",
                turn.as_str()
            )),
            None => Err(said(application::AppError::NoWorkspaceOpen)),
        }
    }

    /// Joue `call` dans l'espace de travail autorisé `name`, ouvert en arrière-plan : l'espace
    /// ouvert de l'utilisateur, son écran et ses préférences ne changent pas. Un espace qui n'est
    /// plus autorisé, ou dont le dossier a disparu, est une erreur : rien n'est joué.
    pub(super) fn in_background_workspace(
        &self,
        name: &WorkspaceName,
        call: impl FnOnce() -> mcp::ToolOutcome,
    ) -> mcp::ToolOutcome {
        let opened = self
            .manage_workspaces()
            .open_in_background(name)
            .map_err(said)?;
        let state = self.open_state(opened).map_err(|error| error.message)?;
        redirect::run(state, call)
    }
}
