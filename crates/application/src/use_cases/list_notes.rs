//! Lister les notes de l'espace de travail.

use domain::note::{sort_by_recent, sorted};
use domain::{Folder, NoteOrder, NoteSummary};

use crate::{AppError, NoteIndex, StoredNote};

/// Les notes d'un dossier, dans l'ordre du tri de la liste, les épinglées d'abord.
#[derive(Debug)]
pub struct ListNotes<'a> {
    index: &'a dyn NoteIndex,
}

impl<'a> ListNotes<'a> {
    /// Le cas d'usage, branché sur l'index de l'espace de travail ouvert.
    #[must_use]
    pub fn new(index: &'a dyn NoteIndex) -> Self {
        Self { index }
    }

    /// Le résumé de chaque note du dossier : les épinglées d'abord, puis les autres ;
    /// dans chaque groupe, selon `order`.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'index ne répond pas.
    pub fn execute(&self, folder: &Folder, order: NoteOrder) -> Result<Vec<NoteSummary>, AppError> {
        Ok(sorted(self.index.notes_in(folder)?, order))
    }
}

/// Les notes de tout l'espace de travail, pour l'ouverture rapide.
#[derive(Debug)]
pub struct ListAllNotes<'a> {
    index: &'a dyn NoteIndex,
}

impl<'a> ListAllNotes<'a> {
    /// Le cas d'usage, branché sur l'index de l'espace de travail ouvert.
    #[must_use]
    pub fn new(index: &'a dyn NoteIndex) -> Self {
        Self { index }
    }

    /// Le résumé de chaque note de chaque dossier, la plus récemment modifiée en premier.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'index ne répond pas.
    pub fn execute(&self) -> Result<Vec<NoteSummary>, AppError> {
        Ok(sort_by_recent(self.index.all_notes()?))
    }
}

/// Le résumé d'une note gardée, tel que l'affiche la liste.
pub(crate) fn summary(note: StoredNote) -> NoteSummary {
    NoteSummary::new(note.path, &note.content, note.modified)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::NoteStore;
    use crate::testing::{InMemoryNoteStore, indexed};
    use domain::NotePath;

    #[test]
    fn notes_are_listed_by_title_most_recent_first() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "# Alpha"), ("b.md", "texte")]);
        let notes = ListNotes::new(&indexed(&store))
            .execute(&Folder::root(), NoteOrder::Modified)
            .unwrap();
        let titles: Vec<_> = notes.iter().map(|n| n.title()).collect();
        assert_eq!(titles, ["Sans titre", "Alpha"]);
    }

    #[test]
    fn pinned_notes_are_listed_first() {
        let store = InMemoryNoteStore::with_notes(&[
            ("a.md", "---\npinned: true\n---\n# Alpha"),
            ("b.md", "# Bêta"),
        ]);
        let notes = ListNotes::new(&indexed(&store))
            .execute(&Folder::root(), NoteOrder::Modified)
            .unwrap();
        let titles: Vec<_> = notes.iter().map(|n| n.title()).collect();
        assert_eq!(titles, ["Alpha", "Bêta"]);
    }

    #[test]
    fn notes_are_listed_in_the_chosen_order() {
        let store = InMemoryNoteStore::with_notes(&[("b.md", "# Bêta"), ("a.md", "# alpha")]);
        store
            .write(&NotePath::parse("b.md").unwrap(), "# Bêta !")
            .unwrap();
        let titles = |order| {
            let notes = ListNotes::new(&indexed(&store))
                .execute(&Folder::root(), order)
                .unwrap();
            notes
                .iter()
                .map(|n| n.title().to_owned())
                .collect::<Vec<_>>()
        };
        assert_eq!(titles(NoteOrder::Modified), ["Bêta !", "alpha"]);
        assert_eq!(titles(NoteOrder::Title), ["alpha", "Bêta !"]);
    }

    #[test]
    fn every_note_of_every_folder_is_listed_most_recent_first() {
        let store = InMemoryNoteStore::with_notes(&[
            ("a.md", "---\npinned: true\n---\n# Alpha"),
            ("Travail/b.md", "# Bêta"),
            ("Travail/Archives/c.md", "# Gamma"),
        ]);
        let notes = ListAllNotes::new(&indexed(&store)).execute().unwrap();
        let paths: Vec<_> = notes.iter().map(|n| n.path().to_path()).collect();
        assert_eq!(paths, ["Travail/Archives/c.md", "Travail/b.md", "a.md"]);
    }
}
