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
    /// La note est épinglée en tête de liste.
    pub pinned: bool,
}

/// Une note trouvée par la recherche.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchResultItem {
    /// Le chemin de la note depuis la bibliothèque : `dossier/nom.md`.
    pub path: String,
    /// Le titre affiché.
    pub title: String,
    /// Le dossier de la note : `""` pour la racine.
    pub folder: String,
    /// Millisecondes depuis le 1er janvier 1970.
    #[ts(type = "number")]
    pub modified: u64,
    /// L'extrait, en morceaux : les mots trouvés sont marqués.
    pub excerpt: Vec<ExcerptPartItem>,
}

/// Un morceau d'extrait.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ExcerptPartItem {
    /// Le texte du morceau, tel qu'il est écrit dans la note.
    pub text: String,
    /// Vrai si c'est un mot cherché, à mettre en évidence.
    pub matched: bool,
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
    /// L'empreinte de ce contenu, à renvoyer à l'enregistrement : si le fichier a changé
    /// ailleurs entre-temps, sa version est gardée dans une copie de conflit.
    pub fingerprint: String,
}

/// Ce qu'a donné l'enregistrement d'une note.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SaveResult {
    /// Le chemin de la note, dont le nom a peut-être changé avec le titre.
    pub path: String,
    /// L'empreinte de ce qui vient d'être écrit, à renvoyer au prochain enregistrement.
    pub fingerprint: String,
    /// Le chemin de la copie de conflit qui garde la version trouvée sur le disque,
    /// si la note avait changé hors de l'application.
    pub conflict_copy: Option<String>,
}

/// Changement fait dans la bibliothèque hors de l'application, annoncé à la page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LibraryChanged {
    /// Les chemins des notes créées, modifiées, supprimées ou renommées ; vide si seuls
    /// des dossiers ont changé.
    pub notes: Vec<String>,
}

/// Le chemin d'une note après enregistrement ou création.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SavedNote {
    /// Le chemin de la note, dont le nom a peut-être changé avec le titre.
    pub path: String,
}

/// Une note de la bibliothèque, proposée par l'ouverture rapide.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LibraryNoteItem {
    /// Le chemin de la note depuis la bibliothèque : `dossier/nom.md`.
    pub path: String,
    /// Le titre affiché.
    pub title: String,
    /// Le dossier de la note : `""` pour la racine.
    pub folder: String,
}

/// Une note dont un lien désigne la note ouverte (lien entrant).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LinkingNoteItem {
    /// Le chemin de la note depuis la bibliothèque : `dossier/nom.md`.
    pub path: String,
    /// Le titre affiché.
    pub title: String,
    /// Le dossier de la note : `""` pour la racine.
    pub folder: String,
}

/// Une note de la corbeille.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TrashedNoteItem {
    /// Son chemin dans la corbeille, qui est son chemin d'origine : `dossier/nom.md`.
    pub path: String,
    /// Le titre affiché.
    pub title: String,
}

/// Ce que contient la corbeille.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TrashInfo {
    /// Les dossiers de la corbeille, chacun suivi des siens.
    pub folders: Vec<String>,
    /// Les notes de la corbeille, triées par chemin.
    pub notes: Vec<TrashedNoteItem>,
}

/// Une pièce jointe ajoutée à une note.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AttachedFile {
    /// Le lien Markdown à insérer dans la note, là où le fichier a été collé ou glissé.
    pub markdown: String,
}
