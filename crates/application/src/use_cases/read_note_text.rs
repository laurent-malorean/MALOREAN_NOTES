//! Lire le texte d'une note simple, en-tête et corps séparés (fiche 0076) : l'outil `read_note`
//! que les IA utilisent pour recopier à l'identique le texte à remplacer de `replace_in_note`.

use domain::reading::{ReadableNote, readable};
use domain::{ContentType, NotePath};

use crate::{AppError, NoteStore};

/// Lit le texte d'une note simple.
#[derive(Debug)]
pub struct ReadNoteText<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ReadNoteText<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le texte de la note, son en-tête à part du corps ; le corps est coupé (et le résultat le
    /// dit) s'il passe [`domain::reading::MAX_READ_CHARACTERS`] caractères. Rien n'est écrit.
    ///
    /// # Errors
    ///
    /// [`AppError::ReadingRefused`] si la note n'est pas une note simple (cahier de recherche,
    /// carte mentale, canvas, CRM) ; [`AppError::NoteNotFound`] si elle n'existe pas ;
    /// [`AppError::NoteUnreadable`] si elle n'est pas du texte UTF-8 ;
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, note: &NotePath) -> Result<ReadableNote, AppError> {
        let content = self.store.read(note)?.content;
        let kind = ContentType::of_file(note.name(), &content);
        Ok(readable(kind, &content)?)
    }
}

#[cfg(test)]
mod tests {
    use domain::reading::RefusedReading;

    use super::*;
    use crate::testing::InMemoryNoteStore;

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn read(notes: &[(&str, &str)], note: &str) -> Result<ReadableNote, AppError> {
        let store = InMemoryNoteStore::with_notes(notes);
        ReadNoteText::new(&store).execute(&path(note))
    }

    #[test]
    fn a_simple_note_is_read_with_its_header_apart() {
        let read = read(
            &[("Travail/a.md", "---\ntags: [x]\n---\n# Alpha\ntexte")],
            "Travail/a.md",
        )
        .unwrap();
        assert_eq!(read.header, "---\ntags: [x]\n---\n");
        assert_eq!(read.body, "# Alpha\ntexte");
        assert!(!read.truncated);
    }

    #[test]
    fn a_note_whose_header_declares_an_unknown_type_is_a_simple_note() {
        let read = read(&[("a.md", "---\ntype: kanban\n---\n# A")], "a.md").unwrap();
        assert_eq!(read.body, "# A");
    }

    #[test]
    fn a_research_notebook_a_mind_map_and_a_crm_are_refused() {
        for (header, kind) in [
            ("cahier-de-recherche", ContentType::ResearchNotebook),
            ("carte-mentale", ContentType::MindMap),
            ("crm", ContentType::Crm),
            ("crm-action", ContentType::CrmAction),
        ] {
            let content = format!("---\ntype: {header}\n---\n# T");
            assert_eq!(
                read(&[("a.md", &content)], "a.md"),
                Err(AppError::ReadingRefused(RefusedReading::NotANote(kind)))
            );
        }
    }

    #[test]
    fn a_canvas_is_refused() {
        assert_eq!(
            read(&[("a.canvas", "{}")], "a.canvas"),
            Err(AppError::ReadingRefused(RefusedReading::NotANote(
                ContentType::Canvas
            )))
        );
    }

    #[test]
    fn a_missing_note_is_reported() {
        assert_eq!(read(&[], "x.md"), Err(AppError::NoteNotFound(path("x.md"))));
    }
}
