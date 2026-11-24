//! Les canvas de l'espace de travail ouvert, vus depuis l'interface (fiche 0052).

use application::use_cases::{CreateCanvas, ReadCanvas, SaveCanvas};
use domain::canvas::Canvas;
use domain::{Folder, NotePath};

use super::Session;
use crate::{ApiError, CanvasFileItem, CanvasItem, SavedNote};

impl Session {
    /// Crée dans `folder` un canvas nommé `title` ; rend son chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; dossier invalide, stockage
    /// indisponible, aucun espace de travail ouvert.
    pub fn create_canvas(&self, folder: &str, title: &str) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let created = CreateCanvas::new(&*store).execute(&Folder::parse(folder)?, title)?;
        Ok(SavedNote {
            path: created.to_path(),
        })
    }

    /// Le canvas du fichier `path` et son texte.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; fichier qui n'est pas un canvas valide,
    /// chemin invalide, stockage indisponible, aucun espace de travail ouvert.
    pub fn read_canvas(&self, path: &str) -> Result<CanvasFileItem, ApiError> {
        let store = self.store()?;
        let (canvas, text) = ReadCanvas::new(&*store).execute(&NotePath::parse(path)?)?;
        Ok(CanvasFileItem {
            canvas: canvas.into(),
            text,
        })
    }

    /// Enregistre `canvas` dans le fichier `path`, fait à partir du texte `base` ; rend le canvas
    /// tel qu'il est maintenant dans le fichier et son texte.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; canvas refusé, fichier qui n'est pas
    /// un canvas valide, chemin invalide, stockage indisponible, aucun espace de travail ouvert.
    pub fn save_canvas(
        &self,
        path: &str,
        base: &str,
        canvas: CanvasItem,
    ) -> Result<CanvasFileItem, ApiError> {
        let store = self.store()?;
        let mine = Canvas::try_from(canvas).map_err(application::AppError::from)?;
        let saved = SaveCanvas::new(&*store).execute(&NotePath::parse(path)?, base, &mine)?;
        Ok(CanvasFileItem {
            canvas: saved.canvas.into(),
            text: saved.text,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;

    fn session(notes: &[(&str, &str)]) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
        Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        )
    }

    #[test]
    fn a_canvas_is_created_read_and_saved() {
        let session = session(&[("Idees/note.md", "# Note")]);
        assert!(session.create_canvas("", "Projet").is_err());
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        let created = session.create_canvas("Idees", "Projet").unwrap();
        assert_eq!(created.path, "Idees/projet.canvas");
        let read = session.read_canvas(&created.path).unwrap();
        assert!(read.canvas.cards.is_empty());
        let mut canvas = read.canvas;
        canvas.cards.push(crate::CanvasCardItem {
            id: "a3f9c2d41b7e8056".into(),
            kind: "text".into(),
            text: Some("Bonjour".into()),
            file: None,
            subpath: None,
            url: None,
            label: None,
            background: None,
            background_style: None,
            x: 0.0,
            y: 0.0,
            width: 250.0,
            height: 60.0,
            color: None,
            palette: Some("rouge".into()),
            extra: vec![],
        });
        let saved = session
            .save_canvas(&created.path, &read.text, canvas)
            .unwrap();
        assert!(
            saved
                .text
                .contains(r#""text":"Bonjour","x":0,"y":0,"width":250,"height":60,"color":"1""#)
        );
        let again = session.read_canvas(&created.path).unwrap();
        assert_eq!(again.text, saved.text);
        assert_eq!(again.canvas.cards[0].palette.as_deref(), Some("rouge"));
    }

    #[test]
    fn a_file_that_is_not_a_canvas_is_refused_with_a_readable_message() {
        let session = session(&[("note.md", "# Note"), ("mauvais.canvas", "{")]);
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        assert_eq!(
            session.read_canvas("note.md").unwrap_err().message,
            "ce fichier n'est pas un canvas"
        );
        assert!(
            session
                .read_canvas("mauvais.canvas")
                .unwrap_err()
                .message
                .starts_with("ce fichier n'est pas un canvas valide")
        );
        assert!(session.read_canvas("../x.canvas").is_err());
        assert!(session.create_canvas("../x", "T").is_err());
        let bad = crate::CanvasItem {
            cards: vec![],
            arrows: vec![crate::CanvasArrowItem {
                id: "e".into(),
                from: "a".into(),
                from_side: "middle".into(),
                from_end: "none".into(),
                to: "a".into(),
                to_side: "top".into(),
                to_end: "arrow".into(),
                color: None,
                palette: None,
                label: None,
                extra: vec![],
            }],
            extra: vec![],
        };
        assert!(session.save_canvas("mauvais.canvas", "{", bad).is_err());
    }
}
