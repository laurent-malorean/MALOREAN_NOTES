//! Exporter une note hors de l'espace de travail.

use domain::NotePath;
use domain::export::{ExportDestination, exported_markdown};

use crate::{AppError, ExportStore, ExportedAttachment, NoteStore, StoreError};

/// Écrit une note dans un fichier Markdown choisi par l'utilisateur, avec ses pièces jointes.
#[derive(Debug)]
pub struct ExportMarkdown<'a> {
    store: &'a dyn NoteStore,
    exports: &'a dyn ExportStore,
}

impl<'a> ExportMarkdown<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'écriture des exports.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, exports: &'a dyn ExportStore) -> Self {
        Self { store, exports }
    }

    /// Écrit au fichier exporté le fichier de la note tel quel, en-tête compris ; ses pièces
    /// jointes sont copiées à côté, et les liens vers elles suivent la copie.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si la note n'existe pas, [`AppError::NoteUnreadable`] si elle
    /// n'est pas du texte UTF-8, [`AppError::StorageUnavailable`] si une pièce jointe ne peut
    /// pas être lue ou un fichier exporté écrit.
    pub fn execute(
        &self,
        note: &NotePath,
        destination: &ExportDestination,
    ) -> Result<(), AppError> {
        let stored = self.store.read(note)?;
        let attachments = self
            .store
            .attachment_names(note)?
            .into_iter()
            .map(|name| {
                let bytes = self.store.read_attachment(note, &name)?;
                Ok(ExportedAttachment { name, bytes })
            })
            .collect::<Result<Vec<_>, StoreError>>()?;
        let text = exported_markdown(&stored.content, note.name(), destination);
        Ok(self
            .exports
            .write_markdown(destination, &text, &attachments)?)
    }
}

#[cfg(test)]
mod tests {
    use domain::AttachmentName;

    use super::*;
    use crate::testing::{InMemoryExportStore, InMemoryNoteStore};

    fn note(path: &str) -> NotePath {
        NotePath::parse(path).unwrap()
    }

    fn destination(location: &str) -> ExportDestination {
        ExportDestination::parse(location).unwrap()
    }

    #[test]
    fn the_note_file_is_written_as_it_is() {
        let store = InMemoryNoteStore::with_notes(&[("a/b.md", "---\npinned: true\n---\n# B")]);
        let exports = InMemoryExportStore::default();
        ExportMarkdown::new(&store, &exports)
            .execute(&note("a/b.md"), &destination("/Docs/B.md"))
            .unwrap();
        assert_eq!(
            exports.file("/Docs/B.md"),
            Some(b"---\npinned: true\n---\n# B".to_vec())
        );
    }

    #[test]
    fn attachments_are_copied_next_to_the_exported_file_and_followed_by_their_links() {
        let store = InMemoryNoteStore::with_notes(&[("v.md", "# V\n![](v.assets/a.png)")]);
        let image = AttachmentName::existing("a.png").unwrap();
        store
            .write_attachment(&note("v.md"), &image, b"PNG")
            .unwrap();
        let exports = InMemoryExportStore::default();
        ExportMarkdown::new(&store, &exports)
            .execute(&note("v.md"), &destination("/Docs/Voyage.md"))
            .unwrap();
        assert_eq!(
            exports.file("/Docs/Voyage.md"),
            Some(b"# V\n![](Voyage.assets/a.png)".to_vec())
        );
        assert_eq!(
            exports.file("/Docs/Voyage.assets/a.png"),
            Some(b"PNG".to_vec())
        );
    }

    #[test]
    fn a_missing_note_is_not_exported() {
        let store = InMemoryNoteStore::default();
        let exports = InMemoryExportStore::default();
        assert_eq!(
            ExportMarkdown::new(&store, &exports).execute(&note("x.md"), &destination("/x.md")),
            Err(AppError::NoteNotFound(note("x.md")))
        );
        assert_eq!(exports.file("/x.md"), None);
    }
}
