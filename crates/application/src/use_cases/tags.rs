//! Les étiquettes de l'espace de travail, et les notes qui portent l'une d'elles.

use domain::note::sorted;
use domain::tag::{file_retagged, file_tags, tag_counts, written_tags};
use domain::{NoteOrder, NotePath, NoteSummary};

use crate::{AppError, NoteIndex, NoteStore};

/// Les notes de tout l'espace de travail qui portent une étiquette : le filtre par étiquette.
#[derive(Debug)]
pub struct ListTaggedNotes<'a> {
    index: &'a dyn NoteIndex,
}

impl<'a> ListTaggedNotes<'a> {
    /// Le cas d'usage, branché sur l'index de l'espace de travail ouvert.
    #[must_use]
    pub fn new(index: &'a dyn NoteIndex) -> Self {
        Self { index }
    }

    /// Le résumé de chaque note qui porte l'étiquette `tag`, telle qu'écrite : les épinglées
    /// d'abord, puis les autres ; dans chaque groupe, selon `order`.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'index ne répond pas.
    pub fn execute(&self, tag: &str, order: NoteOrder) -> Result<Vec<NoteSummary>, AppError> {
        Ok(sorted(self.index.tagged(tag)?, order))
    }
}

/// La liste des étiquettes : chaque étiquette de l'espace de travail et son nombre de notes.
#[derive(Debug)]
pub struct ListTags<'a> {
    index: &'a dyn NoteIndex,
}

impl<'a> ListTags<'a> {
    /// Le cas d'usage, branché sur l'index de l'espace de travail ouvert.
    #[must_use]
    pub fn new(index: &'a dyn NoteIndex) -> Self {
        Self { index }
    }

    /// Chaque étiquette avec son nombre de notes, par ordre alphabétique.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'index ne répond pas.
    pub fn execute(&self) -> Result<Vec<(String, usize)>, AppError> {
        let notes = self.index.all_notes()?;
        Ok(tag_counts(notes.iter().map(NoteSummary::tags)))
    }
}

/// Les étiquettes d'un contenu, lues dans son fichier : le champ d'étiquettes les montre.
#[derive(Debug)]
pub struct ReadTags<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ReadTags<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Les étiquettes du fichier `path` : celles de l'en-tête d'une note, de la racine d'un canvas.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si le fichier n'existe pas, [`AppError::NoteUnreadable`] s'il
    /// n'est pas du texte UTF-8, [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, path: &NotePath) -> Result<Vec<String>, AppError> {
        let note = self.store.read(path)?;
        Ok(file_tags(path.name(), &note.content))
    }
}

/// Change les étiquettes d'un contenu, sans toucher au reste du fichier.
#[derive(Debug)]
pub struct ChangeTags<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ChangeTags<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le fichier `path` porte `tags` pour étiquettes : nettoyées, sans doublon (majuscules et
    /// accents ignorés) ; le fichier n'est réécrit que si elles changent, et son nom ne change
    /// jamais. Rend les étiquettes écrites.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si le fichier n'existe pas, [`AppError::NoteUnreadable`] s'il
    /// n'est pas du texte UTF-8, [`AppError::InvalidCanvas`] si c'est un canvas invalide (rien
    /// n'est écrit), [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, path: &NotePath, tags: &[String]) -> Result<Vec<String>, AppError> {
        let written = written_tags(tags);
        let current = self.store.read(path)?.content;
        let content = file_retagged(path.name(), &current, &written)?;
        if content != current {
            self.store.write(path, &content)?;
        }
        Ok(file_tags(path.name(), &content))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::MemoryIndex;
    use crate::testing::{InMemoryNoteStore, indexed};

    fn workspace() -> MemoryIndex {
        indexed(&InMemoryNoteStore::with_notes(&[
            ("a.md", "---\ntags: [perso]\n---\n# Alpha"),
            (
                "Travail/b.md",
                "---\ntags: [perso, travail]\npinned: true\n---\n# Bêta",
            ),
            ("Travail/Archives/c.md", "---\ntags: [perso]\n---\n# Gamma"),
            ("d.md", "# Delta"),
        ]))
    }

    #[test]
    fn notes_of_every_folder_carrying_the_tag_are_listed_pinned_first() {
        let store = workspace();
        let notes = ListTaggedNotes::new(&store)
            .execute("perso", NoteOrder::Modified)
            .unwrap();
        let paths: Vec<_> = notes.iter().map(|n| n.path().to_path()).collect();
        assert_eq!(paths, ["Travail/b.md", "Travail/Archives/c.md", "a.md"]);
        assert!(
            ListTaggedNotes::new(&store)
                .execute("Perso", NoteOrder::Modified)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn notes_carrying_the_tag_follow_the_chosen_order() {
        let store = workspace();
        let notes = ListTaggedNotes::new(&store)
            .execute("perso", NoteOrder::Title)
            .unwrap();
        let titles: Vec<_> = notes.iter().map(NoteSummary::title).collect();
        assert_eq!(titles, ["Bêta", "Alpha", "Gamma"]);
    }

    #[test]
    fn every_tag_comes_with_its_number_of_notes() {
        let store = workspace();
        assert_eq!(
            ListTags::new(&store).execute().unwrap(),
            [("perso".to_owned(), 3), ("travail".to_owned(), 1)]
        );
    }

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn words(tags: &[&str]) -> Vec<String> {
        tags.iter().map(|tag| (*tag).to_owned()).collect()
    }

    #[test]
    fn the_tags_of_a_content_are_read_from_its_file() {
        let store = InMemoryNoteStore::with_notes(&[
            ("a.md", "---\ntags: [perso, loisirs]\n---\n# Alpha"),
            ("b.md", "# Bêta"),
            (
                "c.canvas",
                "{\"nodes\":[],\"edges\":[],\"tags\":[\"idées\"]}",
            ),
        ]);
        let read = ReadTags::new(&store);
        assert_eq!(read.execute(&path("a.md")).unwrap(), ["perso", "loisirs"]);
        assert!(read.execute(&path("b.md")).unwrap().is_empty());
        assert_eq!(read.execute(&path("c.canvas")).unwrap(), ["idées"]);
        assert_eq!(
            read.execute(&path("absente.md")).unwrap_err(),
            AppError::NoteNotFound(path("absente.md"))
        );
    }

    #[test]
    fn changing_the_tags_rewrites_only_the_tags_of_the_header() {
        let store = InMemoryNoteStore::with_notes(&[(
            "a.md",
            "---\npinned: true\ntags: [perso]\nautre: 1\n---\n# Alpha\nTexte",
        )]);
        let written = ChangeTags::new(&store)
            .execute(
                &path("a.md"),
                &words(&["perso", " #Été ", "a,b", "ete", "voyage"]),
            )
            .unwrap();
        assert_eq!(written, ["perso", "Été", "voyage"]);
        assert_eq!(
            store.read(&path("a.md")).unwrap().content,
            "---\npinned: true\ntags: [perso, Été, voyage]\nautre: 1\n---\n# Alpha\nTexte"
        );
    }

    #[test]
    fn removing_every_tag_removes_the_key_and_adding_one_creates_the_header() {
        let store = InMemoryNoteStore::with_notes(&[
            ("a.md", "---\ntags: [perso]\n---\n# Alpha"),
            ("b.md", "# Bêta"),
        ]);
        let change = ChangeTags::new(&store);
        assert!(change.execute(&path("a.md"), &[]).unwrap().is_empty());
        assert_eq!(store.read(&path("a.md")).unwrap().content, "# Alpha");
        change.execute(&path("b.md"), &words(&["neuf"])).unwrap();
        assert_eq!(
            store.read(&path("b.md")).unwrap().content,
            "---\ntags: [neuf]\n---\n# Bêta"
        );
    }

    #[test]
    fn a_canvas_is_tagged_at_its_root_and_an_invalid_one_is_left_alone() {
        let text = "{\"nodes\":[],\"edges\":[],\"malorean\":{\"a\":1}}";
        let store =
            InMemoryNoteStore::with_notes(&[("c.canvas", text), ("d.canvas", "pas du JSON")]);
        let change = ChangeTags::new(&store);
        assert_eq!(
            change
                .execute(&path("c.canvas"), &words(&["idées"]))
                .unwrap(),
            ["idées"]
        );
        assert_eq!(
            store.read(&path("c.canvas")).unwrap().content,
            "{\n\t\"nodes\":[],\n\t\"edges\":[],\n\t\"malorean\":{\"a\":1},\n\t\"tags\":[\"idées\"]\n}"
        );
        assert!(matches!(
            change.execute(&path("d.canvas"), &words(&["a"])),
            Err(AppError::InvalidCanvas(_))
        ));
        assert_eq!(
            store.read(&path("d.canvas")).unwrap().content,
            "pas du JSON"
        );
    }

    #[test]
    fn a_file_whose_tags_do_not_change_is_not_written_again() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "---\ntags: [perso]\n---\n# Alpha")]);
        let before = store.read(&path("a.md")).unwrap().modified;
        ChangeTags::new(&store)
            .execute(&path("a.md"), &words(&["perso"]))
            .unwrap();
        assert_eq!(store.read(&path("a.md")).unwrap().modified, before);
        // Une liste de la même forme écrite autrement est réécrite, elle.
        ChangeTags::new(&store)
            .execute(&path("a.md"), &words(&["perso", "voyage"]))
            .unwrap();
        assert_ne!(store.read(&path("a.md")).unwrap().modified, before);
    }

    #[test]
    fn changing_the_tags_of_an_absent_file_is_refused() {
        let store = InMemoryNoteStore::default();
        assert_eq!(
            ChangeTags::new(&store)
                .execute(&path("a.md"), &words(&["a"]))
                .unwrap_err(),
            AppError::NoteNotFound(path("a.md"))
        );
    }
}
