//! Données échangées avec l'interface ; leurs types TypeScript sont générés par `cargo test`.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// La bibliothèque ouverte.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LibraryInfo {
    /// Le nom du dossier, affiché en tête de la liste.
    pub name: String,
    /// L'emplacement complet du dossier.
    pub path: String,
}

/// Une ligne de la liste des notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NoteListItem {
    /// Le chemin de la note depuis la bibliothèque : `dossier/nom.md`.
    pub path: String,
    /// Le titre affiché.
    pub title: String,
    /// Millisecondes depuis le 1er janvier 1970.
    #[ts(type = "number")]
    pub modified: u64,
}

/// Une note ouverte dans l'éditeur.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NoteContent {
    /// Le chemin de la note depuis la bibliothèque : `dossier/nom.md`.
    pub path: String,
    /// Le contenu Markdown complet.
    pub content: String,
}

/// Le chemin d'une note après enregistrement ou création.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SavedNote {
    /// Le chemin de la note, dont le nom a peut-être changé avec le titre.
    pub path: String,
}
