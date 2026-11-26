//! Les outils de dossier de l'application (fiche 0078) : l'arbre des dossiers, renommer, déplacer
//! et jeter un dossier. Ils appellent les mêmes méthodes de la session que les commandes de
//! l'interface : mêmes règles, mêmes messages. Le garde-fou du web retient ceux qui changent.

use domain::app_tools::AppTool;
use serde::Serialize;
use serde_json::{Value, json};

use super::{given, written};
use crate::session::Session;

/// Les chemins des dossiers d'un espace de travail, dans l'ordre de l'arbre.
#[derive(Debug, Serialize)]
struct FolderTree {
    folders: Vec<String>,
}

/// Un dossier renommé ou déplacé : son nouveau chemin.
#[derive(Debug, Serialize)]
struct Placed {
    path: String,
}

impl Session {
    /// Les chemins de tous les dossiers de l'espace de travail, la racine non comprise.
    pub(super) fn tool_list_folders(&self) -> Result<String, String> {
        let folders = self.list_folders().map_err(|error| error.message)?;
        written(&FolderTree { folders })
    }

    /// Joue un outil de dossier qui change quelque chose.
    pub(super) fn call_folder_tool(
        &self,
        tool: AppTool,
        arguments: &Value,
    ) -> Result<String, String> {
        let path = given(arguments, "path")?;
        match tool {
            AppTool::RenameFolder => {
                let name = given(arguments, "name")?;
                let path = self.rename_folder(path, name).map_err(|e| e.message)?;
                written(&Placed { path })
            }
            AppTool::MoveFolder => {
                let into = given(arguments, "folder")?;
                let path = self.move_folder(path, into).map_err(|e| e.message)?;
                written(&Placed { path })
            }
            AppTool::TrashFolder => {
                let trashed = self.trash_folder(path).map_err(|e| e.message)?;
                written(&json!({ "trashed": trashed }))
            }
            _ => unreachable!("un outil qui n'est pas de dossier est joué à part"),
        }
    }
}
