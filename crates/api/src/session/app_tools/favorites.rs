//! Les outils des favoris (fiche 0102) : mettre un contenu en favori, l'en retirer et lire les
//! favoris, comme l'étoile de l'écran. L'IA désigne le contenu par son chemin ; la note des
//! favoris est celle que l'utilisateur a choisie pour l'espace visé, jamais un choix de l'IA.

use serde::Serialize;
use serde_json::{Value, json};

use super::{required, written};
use crate::session::Session;

/// Un contenu en favori, tel que `list_favorites` le rend.
#[derive(Debug, Serialize)]
struct Favorite {
    path: String,
    title: String,
    #[serde(rename = "type")]
    content_type: &'static str,
}

impl Session {
    /// Met le contenu `path` en favori : une ligne `- [[lien]]` à la fin de la note des favoris.
    pub(super) fn tool_add_favorite(&self, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        self.add_favorite(path).map_err(|error| error.message)?;
        written(&json!({ "path": path, "favorite": true }))
    }

    /// Retire le contenu `path` des favoris : toutes les lignes de la note des favoris qui le
    /// désignent.
    pub(super) fn tool_remove_favorite(&self, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        let removed = self.remove_favorite(path).map_err(|error| error.message)?;
        written(&json!({ "path": path, "favorite": false, "removed_lines": removed.len() }))
    }

    /// La note des favoris (son chemin) et les contenus en favori, dans l'ordre de la note.
    pub(super) fn tool_list_favorites(&self) -> Result<String, String> {
        let list = self.list_favorites().map_err(|error| error.message)?;
        let favorites: Vec<Favorite> = list
            .contents
            .into_iter()
            .map(|content| Favorite {
                path: content.path.to_path(),
                title: content.title,
                content_type: content.content_type.name(),
            })
            .collect();
        written(&json!({
            "note": { "path": list.note.path.to_path(), "title": list.note.title },
            "favorites": favorites,
        }))
    }
}
