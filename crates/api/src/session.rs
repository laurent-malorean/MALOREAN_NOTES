//! L'espace de travail ouvert et les cas d'usage qu'on lui applique.

mod attachments;
mod claude;
mod export;
mod history;
mod index;
mod journal;
mod links;
mod quick_open;
mod recent_notes;
mod saving;
mod tags;
mod templates;
mod trash;
mod watching;
mod workspace;
mod writing;

use std::collections::BTreeSet;
use std::sync::{Arc, Mutex, PoisonError, RwLock};

use application::use_cases::{
    CreateFolder, CreateNote, ListFolders, ListNotes, MoveFolder, MoveNote, OpenedWorkspace,
    PinNote, ReadNote, RefreshIndex, RenameFolder, SearchNotes, SearchResult,
};
use application::{
    AppError, ClaudeCode, Clipboard, Clock, ExportStore, History, HistoryOpener, IndexOpener,
    IndexedStore, MemoryHistories, MemoryIndexes, NoteIndex, NoteStore, Preferences, StoredNote,
    VersionedStore, Watching, WorkspaceLocation, WorkspaceName, WorkspaceOpener, WorkspaceWatcher,
    WritingAssistant,
};

use domain::search::{ExcerptPart, SearchQuery};
use domain::title::displayed_title;
use domain::{Fingerprint, Folder, FolderName, NotePath, NoteSummary};

use crate::{
    ApiError, ExcerptPartItem, NoteContent, NoteListItem, NoteOrderItem, SavedNote,
    SearchResultItem, WorkspaceInfo,
};

/// Une ligne de la liste des notes.
fn list_item(note: &NoteSummary) -> NoteListItem {
    NoteListItem {
        path: note.path().to_path(),
        title: note.title().to_owned(),
        modified: note.modified().0,
        pinned: note.is_pinned(),
        tags: note.tags().to_vec(),
    }
}

/// État partagé par les commandes : les adaptateurs et l'espace de travail ouvert.
#[derive(Debug)]
pub struct Session {
    opener: Arc<dyn WorkspaceOpener>,
    preferences: Arc<dyn Preferences>,
    clock: Arc<dyn Clock>,
    indexes: Arc<dyn IndexOpener>,
    histories: Arc<dyn HistoryOpener>,
    workspace: RwLock<Option<OpenWorkspaceState>>,
    watcher: Option<Arc<dyn WorkspaceWatcher>>,
    watching: Mutex<Option<Box<dyn Watching>>>,
    exports: Option<Arc<dyn ExportStore>>,
    clipboard: Option<Arc<dyn Clipboard>>,
    assistant: Option<Arc<dyn WritingAssistant>>,
    claude: Option<Arc<dyn ClaudeCode>>,
}

/// L'espace de travail ouvert : où il est, ses notes, leur index et leur historique, qui suivent
/// chaque changement fait par l'application, et ses versions en attente.
#[derive(Debug, Clone)]
struct OpenWorkspaceState {
    name: WorkspaceName,
    location: WorkspaceLocation,
    store: Arc<dyn NoteStore>,
    index: Arc<dyn NoteIndex>,
    history: Arc<dyn History>,
    /// Les notes enregistrées par l'application depuis leur dernière version : une version en
    /// est gardée quand on quitte l'application.
    pending: Arc<Mutex<BTreeSet<NotePath>>>,
}

impl Session {
    /// Une session sans espace de travail ouvert. Son index et son historique sont gardés en
    /// mémoire, le temps de la session, sauf si elle en reçoit d'autres
    /// ([`Session::with_indexes`], [`Session::with_histories`]).
    #[must_use]
    pub fn new(
        opener: Arc<dyn WorkspaceOpener>,
        preferences: Arc<dyn Preferences>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            opener,
            preferences,
            clock,
            indexes: Arc::new(MemoryIndexes),
            histories: Arc::new(MemoryHistories),
            workspace: RwLock::new(None),
            watcher: None,
            watching: Mutex::new(None),
            exports: None,
            clipboard: None,
            assistant: None,
            claude: None,
        }
    }

    /// Les notes du dossier reçu de la page (`""` pour la racine), la plus récente en premier.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; dossier invalide, aucun
    /// espace de travail ouvert, dossier illisible.
    pub fn list_notes(
        &self,
        folder: &str,
        order: NoteOrderItem,
    ) -> Result<Vec<NoteListItem>, ApiError> {
        let index = self.index()?;
        let notes = ListNotes::new(&*index).execute(&Folder::parse(folder)?, order.into())?;
        Ok(notes.iter().map(list_item).collect())
    }

    /// Les notes de tout l'espace de travail qui contiennent tous les mots de `query` ;
    /// aucune si `query` n'a pas de mot.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; aucun espace de travail
    /// ouvert, espace de travail illisible.
    pub fn search_notes(
        &self,
        query: &str,
        order: NoteOrderItem,
    ) -> Result<Vec<SearchResultItem>, ApiError> {
        let index = self.index()?;
        let Some(query) = SearchQuery::parse(query) else {
            return Ok(Vec::new());
        };
        let found = SearchNotes::new(&*index).execute(&query, order.into())?;
        Ok(found.into_iter().map(search_result_item).collect())
    }

    /// Le contenu d'une note, désignée par le chemin reçu de la page.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, note
    /// absente ou illisible, aucun espace de travail ouvert.
    pub fn read_note(&self, path: &str) -> Result<NoteContent, ApiError> {
        let store = self.store()?;
        Ok(note_content(
            ReadNote::new(&*store).execute(&NotePath::parse(path)?)?,
        ))
    }

    /// Déplace la note dans le dossier `into` (`""` pour la racine) ; rend son nouveau chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, note ou
    /// dossier absent, note illisible, nom pris, aucun espace de travail ouvert.
    pub fn move_note(&self, path: &str, into: &str) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let moved =
            MoveNote::new(&*store).execute(&NotePath::parse(path)?, &Folder::parse(into)?)?;
        Ok(SavedNote {
            path: moved.to_path(),
        })
    }

    /// Épingle une note en tête de liste, sans changer sa date ; rend son nouveau contenu.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, note absente
    /// ou illisible, stockage indisponible, aucun espace de travail ouvert.
    pub fn pin_note(&self, path: &str) -> Result<NoteContent, ApiError> {
        let store = self.store()?;
        Ok(note_content(
            PinNote::new(&*store).pin(&NotePath::parse(path)?)?,
        ))
    }

    /// Désépingle une note, sans changer sa date ; rend son nouveau contenu.
    ///
    /// # Errors
    ///
    /// Les mêmes que [`Session::pin_note`].
    pub fn unpin_note(&self, path: &str) -> Result<NoteContent, ApiError> {
        let store = self.store()?;
        Ok(note_content(
            PinNote::new(&*store).unpin(&NotePath::parse(path)?)?,
        ))
    }

    /// Crée une note vide, sans titre, dans le dossier reçu de la page.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; dossier invalide, stockage
    /// indisponible, aucun espace de travail ouvert.
    pub fn create_note(&self, folder: &str) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let created = CreateNote::new(&*store).execute(&Folder::parse(folder)?)?;
        Ok(SavedNote {
            path: created.to_path(),
        })
    }

    /// Les chemins de tous les dossiers de l'espace de travail, dans l'ordre de l'arbre.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; aucun espace de travail
    /// ouvert, espace de travail illisible.
    pub fn list_folders(&self) -> Result<Vec<String>, ApiError> {
        let store = self.store()?;
        let folders = ListFolders::new(&*store).execute()?;
        Ok(folders.iter().map(Folder::to_path).collect())
    }

    /// Crée le dossier `name` dans `parent` ; rend son chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom ou chemin invalide,
    /// dossier déjà existant, parent absent, aucun espace de travail ouvert.
    pub fn create_folder(&self, parent: &str, name: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        let created = CreateFolder::new(&*store)
            .execute(&Folder::parse(parent)?, FolderName::parse(name)?)?;
        Ok(created.to_path())
    }

    /// Renomme le dossier ; rend son nouveau chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom ou chemin invalide,
    /// racine, nom déjà pris, dossier absent, aucun espace de travail ouvert.
    pub fn rename_folder(&self, path: &str, name: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        let renamed =
            RenameFolder::new(&*store).execute(&Folder::parse(path)?, FolderName::parse(name)?)?;
        Ok(renamed.to_path())
    }

    /// Déplace le dossier dans `into` ; rend son nouveau chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, racine,
    /// déplacement dans lui-même, nom déjà pris, dossier absent, aucun espace de travail ouvert.
    pub fn move_folder(&self, path: &str, into: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        let moved =
            MoveFolder::new(&*store).execute(&Folder::parse(path)?, &Folder::parse(into)?)?;
        Ok(moved.to_path())
    }

    /// L'espace de travail ouvert devient celui de la session, après que les versions en attente
    /// du précédent ont été gardées ; son index est ouvert et mis à jour sur ses fichiers (seules
    /// les notes changées depuis la dernière fois sont relues), et son historique ouvert.
    fn keep(&self, opened: OpenedWorkspace) -> Result<WorkspaceInfo, ApiError> {
        self.keep_pending_versions();
        let info = workspace::workspace_info(&opened);
        let location = opened.workspace.location;
        let index = self.indexes.open(&location).map_err(AppError::from)?;
        let history = self.histories.open(&location).map_err(AppError::from)?;
        RefreshIndex::new(&*opened.store, &*index).execute()?;
        let versioned = Arc::new(VersionedStore::new(opened.store, Arc::clone(&history)));
        let state = OpenWorkspaceState {
            name: opened.workspace.name,
            location,
            store: Arc::new(IndexedStore::new(versioned, Arc::clone(&index))),
            index,
            history,
            pending: Arc::default(),
        };
        *self
            .workspace
            .write()
            .unwrap_or_else(PoisonError::into_inner) = Some(state);
        Ok(info)
    }

    /// L'espace de travail `name` s'appelle maintenant `kept` : s'il est ouvert, il garde ce nom.
    fn renamed(&self, name: &WorkspaceName, kept: &WorkspaceName) {
        let mut open = self
            .workspace
            .write()
            .unwrap_or_else(PoisonError::into_inner);
        if let Some(state) = open.as_mut().filter(|state| state.name.same_as(name)) {
            state.name = kept.clone();
        }
    }

    fn opened(&self) -> Result<OpenWorkspaceState, ApiError> {
        let workspace = self
            .workspace
            .read()
            .unwrap_or_else(PoisonError::into_inner);
        workspace
            .clone()
            .ok_or_else(|| AppError::NoWorkspaceOpen.into())
    }

    fn store(&self) -> Result<Arc<dyn NoteStore>, ApiError> {
        Ok(self.opened()?.store)
    }

    fn index(&self) -> Result<Arc<dyn NoteIndex>, ApiError> {
        Ok(self.opened()?.index)
    }
}

fn search_result_item(result: SearchResult) -> SearchResultItem {
    let excerpt = result
        .excerpt
        .parts()
        .iter()
        .map(|part| match part {
            ExcerptPart::Text(text) => ExcerptPartItem {
                text: text.clone(),
                matched: false,
            },
            ExcerptPart::Match(text) => ExcerptPartItem {
                text: text.clone(),
                matched: true,
            },
        })
        .collect();
    SearchResultItem {
        path: result.path.to_path(),
        title: result.title,
        folder: result.path.folder().to_path(),
        modified: result.modified.0,
        excerpt,
    }
}

fn note_content(note: StoredNote) -> NoteContent {
    NoteContent {
        path: note.path.to_path(),
        fingerprint: Fingerprint::of(&note.content).as_str().to_owned(),
        title: displayed_title(&note.content),
        content: note.content,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;

    const RECENT: NoteOrderItem = NoteOrderItem::Modified;

    fn session_with(notes: &[(&str, &str)]) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
        Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        )
    }

    fn opened(notes: &[(&str, &str)]) -> Session {
        let session = session_with(notes);
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        session
    }

    #[test]
    fn nothing_works_before_a_workspace_is_open() {
        let session = session_with(&[]);
        assert_eq!(
            session.list_notes("", RECENT).unwrap_err().message,
            "aucun espace de travail n'est ouvert"
        );
    }

    #[test]
    fn notes_are_listed_with_their_title() {
        let session = opened(&[("a.md", "# Alpha")]);
        let notes = session.list_notes("", RECENT).unwrap();
        assert_eq!(notes[0].path, "a.md");
        assert_eq!(notes[0].title, "Alpha");
        assert!(notes[0].tags.is_empty());
    }

    #[test]
    fn notes_are_listed_in_the_chosen_order() {
        let session = opened(&[("a.md", "# alpha\npain"), ("b.md", "# Bêta\npain")]);
        let notes = session.list_notes("", NoteOrderItem::Title).unwrap();
        let paths: Vec<_> = notes.iter().map(|n| n.path.as_str()).collect();
        assert_eq!(paths, ["a.md", "b.md"]);
        let found = session.search_notes("pain", NoteOrderItem::Title).unwrap();
        assert_eq!(found[0].path, "a.md");
    }

    #[test]
    fn notes_are_listed_with_their_tags() {
        let session = opened(&[("a.md", "---\ntags: [perso]\n---\n# Alpha")]);
        assert_eq!(session.list_notes("", RECENT).unwrap()[0].tags, ["perso"]);
    }

    #[test]
    fn a_pinned_note_is_listed_first_and_marked() {
        let session = opened(&[("a.md", "# Alpha"), ("b.md", "# Bêta")]);
        let pinned = session.pin_note("a.md").unwrap();
        assert_eq!(pinned.path, "a.md");
        assert_eq!(pinned.content, "---\npinned: true\n---\n# Alpha");
        let notes = session.list_notes("", RECENT).unwrap();
        assert_eq!(notes[0].path, "a.md");
        assert!(notes[0].pinned);
        assert!(!notes[1].pinned);
    }

    #[test]
    fn an_unpinned_note_loses_its_mark() {
        let session = opened(&[("a.md", "---\npinned: true\n---\n# Alpha")]);
        assert_eq!(session.unpin_note("a.md").unwrap().content, "# Alpha");
        assert!(!session.list_notes("", RECENT).unwrap()[0].pinned);
    }

    #[test]
    fn pinning_a_note_with_a_bad_path_is_refused() {
        let session = opened(&[]);
        assert!(session.pin_note("../x.md").is_err());
        assert!(session.unpin_note("../x.md").is_err());
    }

    #[test]
    fn created_note_is_untitled() {
        let session = opened(&[]);
        assert_eq!(session.create_note("").unwrap().path, "sans-titre.md");
    }

    #[test]
    fn folders_are_created_renamed_moved_and_listed() {
        let session = opened(&[("Travail/a.md", "# A")]);
        assert_eq!(
            session.create_folder("Travail", "Projets").unwrap(),
            "Travail/Projets"
        );
        assert_eq!(session.create_folder("", "Perso").unwrap(), "Perso");
        assert_eq!(
            session
                .rename_folder("Travail/Projets", "Chantiers")
                .unwrap(),
            "Travail/Chantiers"
        );
        assert_eq!(
            session.move_folder("Travail", "Perso").unwrap(),
            "Perso/Travail"
        );
        assert_eq!(
            session.list_folders().unwrap(),
            ["Perso", "Perso/Travail", "Perso/Travail/Chantiers"]
        );
        assert_eq!(
            session.list_notes("Perso/Travail", RECENT).unwrap()[0].title,
            "A"
        );
    }

    #[test]
    fn invalid_folder_names_from_the_page_are_refused() {
        let session = opened(&[]);
        assert_eq!(
            session.create_folder("", ".cache").unwrap_err().message,
            "nom de dossier invalide : « .cache »"
        );
        assert_eq!(
            session.list_notes("../x", RECENT).unwrap_err().message,
            "nom de dossier invalide : « ../x »"
        );
    }

    #[test]
    fn notes_are_searched_in_every_folder_with_an_excerpt() {
        let session = opened(&[
            ("a.md", "# Alpha\ndu pain"),
            ("Travail/b.md", "# Bêta\nlait"),
        ]);
        let results = session.search_notes("PAIN", RECENT).unwrap();
        assert_eq!(
            results,
            [SearchResultItem {
                path: "a.md".into(),
                title: "Alpha".into(),
                folder: String::new(),
                modified: results[0].modified,
                excerpt: vec![
                    ExcerptPartItem {
                        text: "# Alpha du ".into(),
                        matched: false
                    },
                    ExcerptPartItem {
                        text: "pain".into(),
                        matched: true
                    },
                ],
            }]
        );
        assert_eq!(
            session.search_notes("lait", RECENT).unwrap()[0].folder,
            "Travail"
        );
    }

    #[test]
    fn a_search_without_words_finds_nothing() {
        let session = opened(&[("a.md", "# Alpha")]);
        assert!(session.search_notes("   ", RECENT).unwrap().is_empty());
    }

    #[test]
    fn searching_needs_an_open_workspace() {
        let session = session_with(&[]);
        assert!(session.search_notes("pain", RECENT).is_err());
    }

    #[test]
    fn invalid_names_from_the_page_are_refused() {
        let session = opened(&[]);
        let error = session.read_note("../../etc/passwd").unwrap_err();
        assert_eq!(error.message, "nom de note invalide : « ../../etc/passwd »");
    }
}
