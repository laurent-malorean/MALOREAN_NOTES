//! Carte mentale (fiche 0050) : en créer une, la lire, l'enregistrer.

use domain::mind_map::{MindMap, is_mind_map, new_mind_map};
use domain::mind_map_editing::RefusedMindMapEdit;
use domain::{Folder, NotePath};

use crate::use_cases::{CreateNote, KeepVersion};
use crate::{AppError, Clock, History, NoteStore};

/// Une nouvelle carte mentale, sans nœud, qui n'écrase aucune autre note.
#[derive(Debug)]
pub struct CreateMindMap<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateMindMap<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le chemin de la carte titrée `title` créée dans `folder`, sous le nom tiré de son titre.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si le dossier ne peut pas être lu ou écrit.
    pub fn execute(&self, folder: &Folder, title: &str) -> Result<NotePath, AppError> {
        CreateNote::new(self.store).with_content(folder, &new_mind_map(title))
    }
}

/// La carte mentale d'une note.
#[derive(Debug)]
pub struct ReadMindMap<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ReadMindMap<'a> {
    /// Le cas d'usage, branché sur le stockage de l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// La carte de la note `path`.
    ///
    /// # Errors
    ///
    /// [`AppError::NotAMindMap`] si la note n'en est pas une ; [`AppError::NoteNotFound`] si elle
    /// n'existe pas ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, path: &NotePath) -> Result<MindMap, AppError> {
        let content = self.store.read(path)?.content;
        if !is_mind_map(&content) {
            return Err(AppError::NotAMindMap);
        }
        Ok(MindMap::parse(&content))
    }
}

/// L'enregistrement d'une carte : sa liste et la place de ses nœuds racines, le reste du fichier
/// inchangé.
#[derive(Debug)]
pub struct SaveMindMap<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> SaveMindMap<'a> {
    /// Le cas d'usage, branché sur le stockage de l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Écrit `map` dans la note `path`.
    ///
    /// # Errors
    ///
    /// [`AppError::NotAMindMap`] si la note n'en est pas une ; [`AppError::NoteNotFound`] si elle
    /// n'existe pas ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, path: &NotePath, map: &MindMap) -> Result<(), AppError> {
        let original = self.store.read(path)?.content;
        if !is_mind_map(&original) {
            return Err(AppError::NotAMindMap);
        }
        self.store.write(path, &map.written_on(&original))?;
        Ok(())
    }
}

/// Ce qu'a donné un geste sur une carte : ce que le geste rend, et le texte écrit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EditedMindMap<T> {
    /// Ce que le geste rend (le chemin du nœud touché, le nombre de nœuds supprimés…).
    pub outcome: T,
    /// Le texte de la carte après le geste.
    pub content: String,
}

/// Un geste de l'interface sur une carte mentale (fiche 0080), joué avec les règles de
/// l'enregistrement d'une carte : la liste et `racines` réécrites, le reste du fichier inchangé,
/// la version d'avant gardée.
#[derive(Debug)]
pub struct EditMindMap<'a> {
    store: &'a dyn NoteStore,
    keeping: KeepVersion<'a>,
}

impl<'a> EditMindMap<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert, son historique et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, history: &'a dyn History, clock: &'a dyn Clock) -> Self {
        Self {
            store,
            keeping: KeepVersion::new(store, history, clock),
        }
    }

    /// Joue `gesture` sur la carte de la note `path` ; si le geste est refusé, rien n'est écrit.
    /// Le texte d'avant est d'abord gardé comme version (s'il diffère de la dernière).
    ///
    /// # Errors
    ///
    /// [`AppError::NotAMindMap`] si la note n'est pas une carte ; [`AppError::NoteNotFound`] si
    /// elle n'existe pas ; [`AppError::MindMapEditRefused`] si le geste est refusé ;
    /// [`AppError::StorageUnavailable`] si le stockage ou l'historique ne répond pas.
    pub fn execute<T>(
        &self,
        path: &NotePath,
        gesture: impl FnOnce(&mut MindMap) -> Result<T, RefusedMindMapEdit>,
    ) -> Result<EditedMindMap<T>, AppError> {
        let original = self.store.read(path)?.content;
        if !is_mind_map(&original) {
            return Err(AppError::NotAMindMap);
        }
        let mut map = MindMap::parse(&original);
        let outcome = gesture(&mut map)?;
        let content = map.written_on(&original);
        self.keeping.keep(path, &original)?;
        self.store.write(path, &content)?;
        Ok(EditedMindMap { outcome, content })
    }
}

#[cfg(test)]
mod tests {
    use domain::mind_map::MindNode;

    use super::*;
    use crate::testing::InMemoryNoteStore;

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    #[test]
    fn a_mind_map_is_created_under_the_name_of_its_title() {
        let store = InMemoryNoteStore::with_notes(&[("Idees/projet.md", "# Autre")]);
        let created = CreateMindMap::new(&store)
            .execute(&Folder::parse("Idees").unwrap(), "Projet")
            .unwrap();
        assert_eq!(created, path("Idees/projet-2.md"));
        assert_eq!(
            store.read(&created).unwrap().content,
            "---\ntype: carte-mentale\n---\n# Projet\n"
        );
    }

    #[test]
    fn a_map_is_read_and_saved_keeping_the_title_and_other_properties() {
        let text = "---\ntype: carte-mentale\ntags: [a]\n---\n# Projet\n\n- A\n";
        let store = InMemoryNoteStore::with_notes(&[("p.md", text)]);
        let mut map = ReadMindMap::new(&store).execute(&path("p.md")).unwrap();
        map.roots[0].children.push(MindNode {
            title: "B".into(),
            ..MindNode::default()
        });
        SaveMindMap::new(&store)
            .execute(&path("p.md"), &map)
            .unwrap();
        assert_eq!(
            store.read(&path("p.md")).unwrap().content,
            "---\ntype: carte-mentale\ntags: [a]\nracines: [{x: 0, y: 0}]\n---\n# Projet\n\n- A\n  - B\n"
        );
    }

    #[test]
    fn a_note_that_is_not_a_mind_map_is_neither_read_nor_written() {
        let store = InMemoryNoteStore::with_notes(&[("n.md", "# Note\n\n- A\n")]);
        assert!(matches!(
            ReadMindMap::new(&store).execute(&path("n.md")),
            Err(AppError::NotAMindMap)
        ));
        assert!(matches!(
            SaveMindMap::new(&store).execute(&path("n.md"), &MindMap::default()),
            Err(AppError::NotAMindMap)
        ));
        assert_eq!(
            store.read(&path("n.md")).unwrap().content,
            "# Note\n\n- A\n"
        );
        assert!(matches!(
            ReadMindMap::new(&store).execute(&path("absente.md")),
            Err(AppError::NoteNotFound(_))
        ));
    }
    mod editing {
        use domain::Moment;
        use domain::mind_map_editing::new_node;

        use super::*;
        use crate::MemoryHistory;
        use crate::testing::FixedClock;

        const TEXT: &str =
            "---\ntype: carte-mentale\ntags: [a]\nautre: x\n---\n# Projet\n\n- A\n  - A1\n";

        fn clock() -> FixedClock {
            FixedClock::at(Moment::new(2026, 11, 26, 14, 30).unwrap())
        }

        fn add_to_a(
            store: &InMemoryNoteStore,
            history: &MemoryHistory,
            title: &str,
        ) -> Result<EditedMindMap<domain::mind_map::NodePath>, AppError> {
            EditMindMap::new(store, history, &clock()).execute(&path("p.md"), |map| {
                map.add_child(&domain::mind_map::NodePath(vec![0]), new_node(title, "")?)
            })
        }

        #[test]
        fn a_gesture_is_written_with_the_rules_of_the_saving_of_a_map() {
            let store = InMemoryNoteStore::with_notes(&[("p.md", TEXT)]);
            let history = MemoryHistory::default();
            let edited = add_to_a(&store, &history, "A2").unwrap();
            let expected = "---\ntype: carte-mentale\ntags: [a]\nautre: x\nracines: [{x: 0, y: 0}]\n---\n# Projet\n\n- A\n  - A1\n  - A2\n";
            assert_eq!(edited.outcome.to_string(), "0.1");
            assert_eq!(edited.content, expected);
            assert_eq!(store.read(&path("p.md")).unwrap().content, expected);
        }

        #[test]
        fn the_text_before_the_gesture_is_kept_as_a_version() {
            let store = InMemoryNoteStore::with_notes(&[("p.md", TEXT)]);
            let history = MemoryHistory::default();
            add_to_a(&store, &history, "A2").unwrap();
            let versions = history.versions(&path("p.md")).unwrap();
            assert_eq!(versions.len(), 1);
            assert_eq!(
                history.read_version(&path("p.md"), &versions[0]).unwrap(),
                TEXT
            );
        }

        #[test]
        fn a_refused_gesture_writes_nothing_and_keeps_no_version() {
            let store = InMemoryNoteStore::with_notes(&[("p.md", TEXT)]);
            let history = MemoryHistory::default();
            let error = add_to_a(&store, &history, " ").unwrap_err();
            assert!(matches!(
                error,
                AppError::MindMapEditRefused(RefusedMindMapEdit::EmptyTitle)
            ));
            assert_eq!(
                error.to_string(),
                "le titre d'un nœud ne peut pas être vide ; rien n'a été changé"
            );
            assert_eq!(store.read(&path("p.md")).unwrap().content, TEXT);
            assert!(history.versions(&path("p.md")).unwrap().is_empty());
        }

        #[test]
        fn a_note_that_is_not_a_mind_map_or_is_missing_is_refused() {
            let store = InMemoryNoteStore::with_notes(&[("p.md", "# Note\n\n- A\n")]);
            let history = MemoryHistory::default();
            assert!(matches!(
                add_to_a(&store, &history, "X"),
                Err(AppError::NotAMindMap)
            ));
            assert_eq!(
                store.read(&path("p.md")).unwrap().content,
                "# Note\n\n- A\n"
            );
            assert!(history.versions(&path("p.md")).unwrap().is_empty());
            let result = EditMindMap::new(&store, &history, &clock())
                .execute(&path("absente.md"), |_| Ok(()));
            assert!(matches!(result, Err(AppError::NoteNotFound(_))));
        }
    }
}
