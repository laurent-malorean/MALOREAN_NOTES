//! Suivre les liens entre notes : ouvrir la note qu'un `[[titre]]` désigne, et trouver les
//! notes qui pointent vers une note.

use domain::links::{links_to, same_title};
use domain::title::displayed_title;
use domain::{Folder, Modified, NotePath};

use crate::{AppError, NoteStore, StoredNote};

/// Une note dont un lien désigne la note ouverte.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkingNote {
    /// Le dossier et le nom de fichier de la note.
    pub path: NotePath,
    /// Le titre affiché.
    pub title: String,
    /// La date de dernière modification.
    pub modified: Modified,
}

/// Les liens entre les notes de l'espace de travail.
///
/// Comme la recherche, chaque demande relit toutes les notes (fiche de décision 0016).
#[derive(Debug)]
pub struct NoteLinks<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> NoteLinks<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Toutes les notes, la plus récemment modifiée en premier.
    fn all_notes(&self) -> Result<Vec<StoredNote>, AppError> {
        let mut notes = Vec::new();
        for folder in std::iter::once(Folder::root()).chain(self.store.folders()?) {
            notes.extend(self.store.list(&folder)?);
        }
        // Tri stable : à date égale, l'ordre des dossiers est gardé.
        notes.sort_by_key(|note| std::cmp::Reverse(note.modified));
        Ok(notes)
    }

    /// La note désignée par `[[title]]` : celle qui porte ce titre ; la plus récente si
    /// plusieurs le portent ; aucune si aucune ne le porte.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'espace de travail ne peut pas être lue.
    pub fn resolve(&self, title: &str) -> Result<Option<NotePath>, AppError> {
        Ok(self
            .all_notes()?
            .into_iter()
            .find(|note| same_title(&displayed_title(&note.content), title))
            .map(|note| note.path))
    }

    /// Les liens entrants de la note `path` : les autres notes dont un lien désigne son titre,
    /// la plus récente en premier.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si la note n'existe pas, [`AppError::StorageUnavailable`]
    /// si l'espace de travail ne peut pas être lue.
    pub fn backlinks(&self, path: &NotePath) -> Result<Vec<LinkingNote>, AppError> {
        let title = displayed_title(&self.store.read(path)?.content);
        Ok(self
            .all_notes()?
            .into_iter()
            .filter(|note| note.path != *path && links_to(&note.content, &title))
            .map(|note| LinkingNote {
                title: displayed_title(&note.content),
                path: note.path,
                modified: note.modified,
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn resolved(store: &InMemoryNoteStore, title: &str) -> Option<String> {
        NoteLinks::new(store)
            .resolve(title)
            .unwrap()
            .map(|p| p.to_path())
    }

    fn backlinks(store: &InMemoryNoteStore, note: &str) -> Vec<String> {
        NoteLinks::new(store)
            .backlinks(&path(note))
            .unwrap()
            .into_iter()
            .map(|n| format!("{} | {}", n.path.to_path(), n.title))
            .collect()
    }

    #[test]
    fn a_link_leads_to_the_note_with_that_title_in_any_folder() {
        let store = InMemoryNoteStore::with_notes(&[
            ("a.md", "# Agenda"),
            ("Cuisine/crepes.md", "# Recette de crêpes\nfarine"),
        ]);
        assert_eq!(
            resolved(&store, "recette de crepes").as_deref(),
            Some("Cuisine/crepes.md")
        );
    }

    #[test]
    fn the_most_recent_note_wins_when_several_share_the_title() {
        let store =
            InMemoryNoteStore::with_notes(&[("a.md", "# Courses"), ("Vieux/b.md", "# Courses")]);
        assert_eq!(resolved(&store, "Courses").as_deref(), Some("Vieux/b.md"));
    }

    #[test]
    fn a_link_to_a_missing_title_leads_nowhere() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "# Agenda")]);
        assert_eq!(resolved(&store, "Courses"), None);
    }

    #[test]
    fn backlinks_are_the_other_notes_linking_to_the_title_most_recent_first() {
        let store = InMemoryNoteStore::with_notes(&[
            ("courses.md", "# Courses\n[[Courses]] elle-même"),
            ("a.md", "# Lundi\nacheter, voir [[courses]]"),
            ("Travail/b.md", "# Réunion\nrien à voir avec Courses"),
            ("Travail/c.md", "# Mardi\n[[Courses|la liste]]"),
        ]);
        assert_eq!(
            backlinks(&store, "courses.md"),
            ["Travail/c.md | Mardi", "a.md | Lundi"]
        );
    }

    #[test]
    fn backlinks_of_a_missing_note_are_refused() {
        let store = InMemoryNoteStore::with_notes(&[]);
        assert!(matches!(
            NoteLinks::new(&store).backlinks(&path("absente.md")),
            Err(AppError::NoteNotFound(_))
        ));
    }
}
