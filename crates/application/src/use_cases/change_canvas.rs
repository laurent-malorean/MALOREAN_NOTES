//! Changer un canvas pour une IA (fiche 0079) : le canvas est lu, le geste lui est appliqué, la
//! version d'avant est gardée dans l'historique, puis il est enregistré par le cas d'usage de
//! l'interface (`SaveCanvas` : écriture comme Obsidian, fusion si le fichier a changé entre-temps).

use domain::canvas::Canvas;
use domain::canvas_edit::CanvasEditError;
use domain::{AttachmentName, Folder, NotePath};

use crate::use_cases::{KeepVersion, ReadCanvas, SaveCanvas, SavedCanvas};
use crate::{AppError, Clock, History, NoteStore, StoreError};

/// Ce qu'a donné un changement : le canvas enregistré, et ce que le geste a rendu.
#[derive(Debug)]
pub struct ChangedCanvas<T> {
    /// Le canvas tel qu'il est maintenant dans le fichier, et son texte.
    pub saved: SavedCanvas,
    /// Ce que le geste a rendu (l'identifiant d'une carte neuve, par exemple).
    pub outcome: T,
}

/// Change un canvas.
#[derive(Debug)]
pub struct ChangeCanvas<'a> {
    store: &'a dyn NoteStore,
    keeping: KeepVersion<'a>,
}

impl<'a> ChangeCanvas<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert, son historique et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, history: &'a dyn History, clock: &'a dyn Clock) -> Self {
        Self {
            store,
            keeping: KeepVersion::new(store, history, clock),
        }
    }

    /// Applique `gesture` au canvas du fichier `path` et l'enregistre. Le texte d'avant est
    /// d'abord gardé comme version (on revient en arrière avec la restauration d'une version) ;
    /// rien n'est écrit, ni gardé, si le geste est refusé ou ne change rien.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACanvas`] si le fichier n'est pas un `.canvas` ;
    /// [`AppError::InvalidCanvas`] si son contenu n'est pas valide ;
    /// [`AppError::CanvasEditRefused`] si le geste est refusé ; [`AppError::NoteNotFound`] s'il
    /// n'existe pas ; [`AppError::StorageUnavailable`] si le stockage ou l'historique ne répond
    /// pas.
    pub fn execute<T>(
        &self,
        path: &NotePath,
        gesture: impl FnOnce(&mut Canvas) -> Result<T, CanvasEditError>,
    ) -> Result<ChangedCanvas<T>, AppError> {
        let (mut canvas, text) = ReadCanvas::new(self.store).execute(path)?;
        let outcome = gesture(&mut canvas)?;
        if canvas.to_text() != text {
            self.keeping.keep(path, &text)?;
        }
        let saved = SaveCanvas::new(self.store).execute(path, &text, &canvas)?;
        Ok(ChangedCanvas { saved, outcome })
    }

    /// Le fichier `file` (chemin depuis la racine de l'espace) existe : une note, un canvas, une
    /// image ou un PDF, ce que l'interface permet de poser dans une carte de fichier.
    ///
    /// # Errors
    ///
    /// [`AppError::CanvasEditRefused`] si le fichier est absent ou d'un type que l'outil ne pose
    /// pas ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn ensure_file(&self, file: &str) -> Result<(), AppError> {
        let file = file.trim();
        let absent = || {
            AppError::from(CanvasEditError(format!(
                "le fichier « {file} » n'existe pas dans l'espace de travail : donnez son chemin \
                 depuis la racine de l'espace (`Dossier/note.md`)"
            )))
        };
        if let Ok(note) = NotePath::parse(file) {
            return match self.store.names(note.folder()) {
                Ok(names) if names.contains(note.name()) => Ok(()),
                Ok(_) | Err(StoreError::FolderNotFound(_)) => Err(absent()),
                Err(error) => Err(error.into()),
            };
        }
        let (folder, name) = file.rsplit_once('/').unwrap_or(("", file));
        let (Ok(folder), Some(name)) = (Folder::parse(folder), AttachmentName::existing(name))
        else {
            return Err(CanvasEditError(format!(
                "« {file} » n'est pas un fichier qu'une carte peut montrer : une note (`.md`), un \
                 canvas (`.canvas`), une image ou un PDF de l'espace de travail"
            ))
            .into());
        };
        match self.store.read_file(&folder, &name) {
            Ok(_) => Ok(()),
            Err(StoreError::AttachmentNotFound(_) | StoreError::FolderNotFound(_)) => Err(absent()),
            Err(error) => Err(error.into()),
        }
    }
}

#[cfg(test)]
#[path = "change_canvas_tests.rs"]
mod tests;
