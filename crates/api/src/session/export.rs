//! Les exports d'une note de l'espace de travail ouvert, vus depuis l'interface.

use std::path::Path;
use std::sync::Arc;

use application::use_cases::ExportMarkdown;
use application::{AppError, Clipboard, ExportStore};
use domain::NotePath;
use domain::export::{ExportDestination, export_file_name};

use super::Session;
use crate::{ApiError, ExportFile, ExportFormatItem};

impl Session {
    /// La même session, qui peut écrire les exports.
    #[must_use]
    pub fn with_exports(mut self, exports: Arc<dyn ExportStore>) -> Self {
        self.exports = Some(exports);
        self
    }

    /// Le nom proposé dans la fenêtre d'enregistrement pour exporter la note titrée `title`.
    #[must_use]
    pub fn export_file_name(&self, title: &str, format: ExportFormatItem) -> String {
        export_file_name(title, format.into())
    }

    /// Le dossier, dans l'espace de travail ouvert, où se trouve la note `path` : celui que la
    /// fenêtre d'enregistrement propose en premier.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] si le chemin est invalide ou si aucun espace de travail n'est ouvert.
    pub fn note_folder_location(&self, path: &str) -> Result<String, ApiError> {
        let note = NotePath::parse(path)?;
        let root = self.opened()?.location;
        let folder = note.folder().to_path();
        Ok(if folder.is_empty() {
            root.as_str().to_owned()
        } else {
            format!("{}/{folder}", root.as_str().trim_end_matches('/'))
        })
    }

    /// Le fichier exporté choisi dans la fenêtre d'enregistrement, et son dossier ; rien si
    /// l'utilisateur a annulé.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] si l'emplacement choisi n'est pas un texte lisible ou pas un fichier.
    pub fn chosen_export(&self, file: Option<&Path>) -> Result<Option<ExportFile>, ApiError> {
        let Some(file) = file else {
            return Ok(None);
        };
        let path = file
            .to_str()
            .ok_or_else(|| ApiError::unreadable_folder_name(file))?;
        let destination = ExportDestination::parse(path)?;
        Ok(Some(ExportFile {
            path: destination.location().to_owned(),
            folder: destination.folder().to_owned(),
        }))
    }

    /// Exporte la note `path` en Markdown au fichier `destination`, avec ses pièces jointes.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin ou emplacement invalide,
    /// note absente ou illisible, fichier impossible à écrire, aucun espace de travail ouvert.
    pub fn export_markdown(&self, path: &str, destination: &str) -> Result<(), ApiError> {
        let store = self.store()?;
        let exports = self
            .exports
            .as_deref()
            .ok_or_else(ApiError::exports_unavailable)?;
        let destination = ExportDestination::parse(destination)?;
        ExportMarkdown::new(&*store, exports).execute(&NotePath::parse(path)?, &destination)?;
        Ok(())
    }

    /// Écrit l'image d'une carte mentale (octets PNG) au fichier `destination`.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : emplacement invalide, fichier
    /// impossible à écrire, export indisponible.
    pub fn export_image(&self, destination: &str, bytes: &[u8]) -> Result<(), ApiError> {
        let exports = self
            .exports
            .as_deref()
            .ok_or_else(ApiError::exports_unavailable)?;
        let destination = ExportDestination::parse(destination)?;
        exports
            .write_image(&destination, bytes)
            .map_err(AppError::from)?;
        Ok(())
    }

    /// La même session, qui peut copier dans le presse-papiers.
    #[must_use]
    pub fn with_clipboard(mut self, clipboard: Arc<dyn Clipboard>) -> Self {
        self.clipboard = Some(clipboard);
        self
    }

    /// Pose une note copiée dans le presse-papiers, en texte mis en forme `html` et en texte
    /// brut `text` à la fois.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : presse-papiers absent ou qui refuse.
    pub fn copy_rich_text(&self, html: &str, text: &str) -> Result<(), ApiError> {
        self.clipboard()?
            .copy_rich_text(html, text)
            .map_err(AppError::from)?;
        Ok(())
    }

    /// Pose le texte Markdown `text` d'une note dans le presse-papiers, en texte brut seul.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : presse-papiers absent ou qui refuse.
    pub fn copy_plain_text(&self, text: &str) -> Result<(), ApiError> {
        self.clipboard()?
            .copy_plain_text(text)
            .map_err(AppError::from)?;
        Ok(())
    }

    fn clipboard(&self) -> Result<&dyn Clipboard, ApiError> {
        self.clipboard
            .as_deref()
            .ok_or_else(ApiError::clipboard_unavailable)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{
        FakeOpener, FakePreferences, FixedClock, InMemoryExportStore, InMemoryNoteStore,
    };

    use super::*;

    fn opened(notes: &[(&str, &str)]) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
        let session = Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        session
    }

    #[test]
    fn the_dialog_opens_in_the_folder_of_the_note() {
        let session = opened(&[]);
        assert_eq!(
            session
                .note_folder_location("projets/2026/carte.md")
                .unwrap(),
            "/Users/moi/Notes/projets/2026"
        );
        assert_eq!(
            session.note_folder_location("carte.md").unwrap(),
            "/Users/moi/Notes"
        );
        assert!(session.note_folder_location("../x.md").is_err());
        assert!(
            Session::new(
                Arc::new(FakeOpener::new(Arc::new(
                    InMemoryNoteStore::with_notes(&[])
                ))),
                Arc::new(FakePreferences::default()),
                Arc::new(FixedClock::default()),
            )
            .note_folder_location("carte.md")
            .is_err()
        );
    }

    #[test]
    fn the_proposed_name_follows_the_title_and_the_format() {
        let session = opened(&[]);
        assert_eq!(
            session.export_file_name("Lundi : bilan", ExportFormatItem::Pdf),
            "Lundi - bilan.pdf"
        );
    }

    #[test]
    fn the_chosen_file_comes_back_with_its_folder() {
        let session = opened(&[]);
        assert_eq!(session.chosen_export(None).unwrap(), None);
        assert_eq!(
            session
                .chosen_export(Some(Path::new("/Users/moi/Documents/Lundi.pdf")))
                .unwrap(),
            Some(ExportFile {
                path: "/Users/moi/Documents/Lundi.pdf".into(),
                folder: "/Users/moi/Documents".into(),
            })
        );
        assert_eq!(
            session
                .chosen_export(Some(Path::new("Lundi.pdf")))
                .unwrap_err()
                .message,
            "emplacement d'export invalide : « Lundi.pdf »"
        );
    }

    #[test]
    fn a_note_is_exported_with_its_text_as_it_is() {
        let exports = Arc::new(InMemoryExportStore::default());
        let session = opened(&[("a.md", "# A\ntexte")]).with_exports(Arc::clone(&exports) as _);
        session
            .export_markdown("a.md", "/Users/moi/Documents/A.md")
            .unwrap();
        assert_eq!(
            exports.file("/Users/moi/Documents/A.md"),
            Some(b"# A\ntexte".to_vec())
        );
    }

    #[test]
    fn an_image_is_exported_as_it_is() {
        let exports = Arc::new(InMemoryExportStore::default());
        let session = opened(&[]).with_exports(Arc::clone(&exports) as _);
        session
            .export_image("/Users/moi/Documents/Carte.png", b"\x89PNG")
            .unwrap();
        assert_eq!(
            exports.file("/Users/moi/Documents/Carte.png"),
            Some(b"\x89PNG".to_vec())
        );
    }

    #[test]
    fn an_image_refusal_reaches_the_interface_as_a_message() {
        assert_eq!(
            opened(&[])
                .export_image("/Carte.png", b"x")
                .unwrap_err()
                .message,
            "l'export n'est pas disponible"
        );
        let session = opened(&[]).with_exports(Arc::new(InMemoryExportStore::default()) as _);
        assert_eq!(
            session.export_image("Carte.png", b"x").unwrap_err().message,
            "emplacement d'export invalide : « Carte.png »"
        );
    }

    #[test]
    fn refusals_reach_the_interface_as_messages() {
        let without_exports = opened(&[("a.md", "# A")]);
        assert_eq!(
            without_exports
                .export_markdown("a.md", "/A.md")
                .unwrap_err()
                .message,
            "l'export n'est pas disponible"
        );
        let session =
            opened(&[("a.md", "# A")]).with_exports(Arc::new(InMemoryExportStore::default()) as _);
        assert_eq!(
            session.export_markdown("a.md", "A.md").unwrap_err().message,
            "emplacement d'export invalide : « A.md »"
        );
        assert_eq!(
            session
                .export_markdown("x.md", "/A.md")
                .unwrap_err()
                .message,
            "la note « x.md » n'existe pas"
        );
    }
}
