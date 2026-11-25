//! Les étiquettes de l'espace de travail ouvert, vues depuis l'interface.

use application::use_cases::{ChangeTags, ListTaggedNotes, ListTags, ReadTags};
use domain::NotePath;

use super::{Session, list_item};
use crate::{ApiError, NoteListItem, NoteOrderItem, TagItem};

impl Session {
    /// Les notes de tout l'espace de travail qui portent l'étiquette `tag` : les épinglées
    /// d'abord, puis la plus récemment modifiée en premier.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; espace de travail illisible, aucun
    /// espace de travail ouvert.
    pub fn list_tagged_notes(
        &self,
        tag: &str,
        order: NoteOrderItem,
    ) -> Result<Vec<NoteListItem>, ApiError> {
        let index = self.index()?;
        let notes = ListTaggedNotes::new(&*index).execute(tag, order.into())?;
        Ok(notes.iter().map(list_item).collect())
    }

    /// Chaque étiquette de l'espace de travail et son nombre de notes, par ordre alphabétique.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; espace de travail illisible, aucun
    /// espace de travail ouvert.
    pub fn list_tags(&self) -> Result<Vec<TagItem>, ApiError> {
        let index = self.index()?;
        Ok(ListTags::new(&*index)
            .execute()?
            .into_iter()
            .map(|(name, count)| TagItem { name, count })
            .collect())
    }

    /// Les étiquettes du contenu `path` (une note, un cahier, une carte, un canvas, une fiche du
    /// CRM), lues dans son fichier : l'en-tête, ou la racine d'un canvas.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, fichier absent ou
    /// illisible, aucun espace de travail ouvert.
    pub fn note_tags(&self, path: &str) -> Result<Vec<String>, ApiError> {
        let store = self.store()?;
        Ok(ReadTags::new(&*store).execute(&NotePath::parse(path)?)?)
    }

    /// Donne ces étiquettes au contenu `path`, le reste du fichier inchangé ; rend celles qui sont
    /// écrites (nettoyées, sans doublon).
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, fichier absent ou
    /// illisible, canvas invalide, aucun espace de travail ouvert.
    pub fn change_note_tags(&self, path: &str, tags: &[String]) -> Result<Vec<String>, ApiError> {
        let store = self.store()?;
        Ok(ChangeTags::new(&*store).execute(&NotePath::parse(path)?, tags)?)
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
    fn tagged_notes_and_tags_come_from_the_whole_workspace() {
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
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
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

    #[test]
    fn the_tags_of_a_content_are_read_and_changed_in_its_file_and_in_the_index() {
        let session = session(&[("a.md", "---\ntags: [perso]\n---\n# Alpha")]);
        assert!(session.note_tags("a.md").is_err());
        assert!(session.change_note_tags("a.md", &[]).is_err());
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        assert_eq!(session.note_tags("a.md").unwrap(), ["perso"]);
        let tags = ["perso".to_owned(), "voyage".to_owned()];
        assert_eq!(session.change_note_tags("a.md", &tags).unwrap(), tags);
        let written = session.read_note("a.md").unwrap().content;
        assert_eq!(written, "---\ntags: [perso, voyage]\n---\n# Alpha");
        let listed = session.list_tags().unwrap();
        let names: Vec<_> = listed.into_iter().map(|tag| tag.name).collect();
        assert_eq!(names, ["perso", "voyage"]);
    }

    #[test]
    fn the_tags_of_a_canvas_are_those_of_its_root_and_a_bad_path_is_refused() {
        let session = session(&[("c.canvas", "{\"nodes\":[],\"edges\":[]}")]);
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        let tags = ["idées".to_owned()];
        assert_eq!(session.change_note_tags("c.canvas", &tags).unwrap(), tags);
        assert_eq!(session.note_tags("c.canvas").unwrap(), tags);
        assert!(
            !session
                .note_tags("../dehors.md")
                .unwrap_err()
                .message
                .is_empty()
        );
        assert!(session.note_tags("absente.md").is_err());
    }
}
