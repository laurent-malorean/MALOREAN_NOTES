//! Les exports d'une note de l'espace de travail ouvert, vus depuis la page.

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
    fn refusals_reach_the_page_as_messages() {
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
