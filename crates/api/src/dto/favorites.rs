//! Les favoris vus de l'interface (fiche 0102) : la note des favoris, et les lignes qu'un retrait a
//! ôtées, à remettre si l'utilisateur annule.

use application::use_cases::FavoritesNote;
use domain::favorites::RemovedLine;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// La note des favoris de l'espace de travail ouvert.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FavoritesNoteItem {
    /// Son chemin depuis l'espace de travail : `dossier/nom.md`.
    pub path: String,
    /// Son titre affiché.
    pub title: String,
}

impl From<FavoritesNote> for FavoritesNoteItem {
    fn from(note: FavoritesNote) -> Self {
        Self {
            path: note.path.to_path(),
            title: note.title,
        }
    }
}

/// Une ligne retirée de la note des favoris, avec sa place : `restore_favorites` la remet à
/// l'identique.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RemovedLineItem {
    /// Le rang de la ligne dans la note (depuis 0, en-tête non compté), avant le retrait.
    #[ts(type = "number")]
    pub index: usize,
    /// La ligne telle qu'elle était écrite, fin de ligne comprise.
    pub text: String,
}

impl From<RemovedLine> for RemovedLineItem {
    fn from(line: RemovedLine) -> Self {
        Self {
            index: line.index,
            text: line.text,
        }
    }
}

impl From<RemovedLineItem> for RemovedLine {
    fn from(line: RemovedLineItem) -> Self {
        Self {
            index: line.index,
            text: line.text,
        }
    }
}
