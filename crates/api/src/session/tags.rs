//! Les étiquettes de la bibliothèque ouverte, vues depuis la page.

use application::use_cases::{ListTaggedNotes, ListTags};

use super::{Session, list_item};
use crate::{ApiError, NoteListItem, NoteOrderItem, TagItem};

impl Session {
    /// Les notes de toute la bibliothèque qui portent l'étiquette `tag` : les épinglées
    /// d'abord, puis la plus récemment modifiée en premier.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; bibliothèque illisible, aucune
    /// bibliothèque ouverte.
    pub fn list_tagged_notes(
        &self,
        tag: &str,
        order: NoteOrderItem,
    ) -> Result<Vec<NoteListItem>, ApiError> {
        let store = self.store()?;
        let notes = ListTaggedNotes::new(&*store).execute(tag, order.into())?;
        Ok(notes.iter().map(list_item).collect())
    }

    /// Chaque étiquette de la bibliothèque et son nombre de notes, par ordre alphabétique.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; bibliothèque illisible, aucune
    /// bibliothèque ouverte.
    pub fn list_tags(&self) -> Result<Vec<TagItem>, ApiError> {
        let store = self.store()?;
        Ok(ListTags::new(&*store)
            .execute()?
            .into_iter()
            .map(|(name, count)| TagItem { name, count })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::LibraryLocation;
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
    fn tagged_notes_and_tags_come_from_the_whole_library() {
        let session = session(&[
            ("a.md", "---\ntags: [perso]\n---\n# Alpha"),
            ("Travail/b.md", "---\ntags: [perso, travail]\n---\n# Bêta"),
            ("c.md", "# Gamma"),
        ]);
        assert!(
            session
                .list_tagged_notes("perso", NoteOrderItem::Modified)
                .is_err()
        );
        assert!(session.list_tags().is_err());
        session
            .open_library(LibraryLocation::new("/Users/moi/Notes").unwrap())
            .unwrap();
        let tagged = session
            .list_tagged_notes("perso", NoteOrderItem::Title)
            .unwrap();
        let paths: Vec<_> = tagged.iter().map(|n| n.path.as_str()).collect();
        assert_eq!(paths, ["a.md", "Travail/b.md"]);
        assert_eq!(tagged[1].tags, ["perso", "travail"]);
        assert_eq!(tagged[1].title, "Bêta");
        assert_eq!(
            session.list_tags().unwrap(),
            [
                TagItem {
                    name: "perso".into(),
                    count: 2
                },
                TagItem {
                    name: "travail".into(),
                    count: 1
                },
            ]
        );
    }
}
