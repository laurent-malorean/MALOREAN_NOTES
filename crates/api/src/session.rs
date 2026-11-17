//! La bibliothèque ouverte et les cas d'usage qu'on lui applique.

mod attachments;
mod links;
mod quick_open;
mod saving;
mod trash;
mod watching;

use std::path::Path;
use std::sync::{Arc, Mutex, PoisonError, RwLock};

use application::use_cases::{
    CreateFolder, CreateNote, ListFolders, ListNotes, MoveFolder, MoveNote, OpenLibrary, PinNote,
    ReadNote, RenameFolder, ReopenLastLibrary, SearchNotes, SearchResult,
};
use application::{
    AppError, Clock, LibraryLocation, LibraryOpener, LibraryWatcher, NoteStore, Preferences,
    StoredNote, Watching,
};

use domain::search::{ExcerptPart, SearchQuery};
use domain::title::displayed_title;
use domain::{Fingerprint, Folder, FolderName, NotePath};

use crate::{
    ApiError, ExcerptPartItem, LibraryInfo, NoteContent, NoteListItem, SavedNote, SearchResultItem,
};

/// État partagé par les commandes : les adaptateurs et la bibliothèque ouverte.
#[derive(Debug)]
pub struct Session {
    opener: Arc<dyn LibraryOpener>,
    preferences: Arc<dyn Preferences>,
    clock: Arc<dyn Clock>,
    library: RwLock<Option<OpenLibraryState>>,
    watcher: Option<Arc<dyn LibraryWatcher>>,
    watching: Mutex<Option<Box<dyn Watching>>>,
}

/// La bibliothèque ouverte : où elle est, et ses notes.
#[derive(Debug, Clone)]
struct OpenLibraryState {
    location: LibraryLocation,
    store: Arc<dyn NoteStore>,
}

impl Session {
    /// Une session sans bibliothèque ouverte.
    #[must_use]
    pub fn new(
        opener: Arc<dyn LibraryOpener>,
        preferences: Arc<dyn Preferences>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            opener,
            preferences,
            clock,
            library: RwLock::new(None),
            watcher: None,
            watching: Mutex::new(None),
        }
    }

    /// Rouvre la dernière bibliothèque ; rien au premier lancement.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; préférences illisibles,
    /// bibliothèque introuvable.
    pub fn reopen_last_library(&self) -> Result<Option<LibraryInfo>, ApiError> {
        let reopened = ReopenLastLibrary::new(&*self.opener, &*self.preferences).execute()?;
        Ok(reopened.map(|opened| self.keep(&opened.location, opened.store)))
    }

    /// Ouvre la bibliothèque choisie et s'en souvient.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; dossier introuvable,
    /// préférences impossibles à écrire.
    pub fn open_library(&self, location: LibraryLocation) -> Result<LibraryInfo, ApiError> {
        let store = OpenLibrary::new(&*self.opener, &*self.preferences).execute(&location)?;
        Ok(self.keep(&location, store))
    }

    /// Ouvre le dossier choisi dans la fenêtre de choix ; rien si l'utilisateur a annulé.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom de dossier illisible,
    /// emplacement vide, dossier introuvable, préférences impossibles à écrire.
    pub fn open_chosen_folder(
        &self,
        folder: Option<&Path>,
    ) -> Result<Option<LibraryInfo>, ApiError> {
        let Some(folder) = folder else {
            return Ok(None);
        };
        let location = folder
            .to_str()
            .ok_or_else(|| ApiError::unreadable_folder_name(folder))?;
        self.open_library(LibraryLocation::new(location)?).map(Some)
    }

    /// Les notes du dossier reçu de la page (`""` pour la racine), la plus récente en premier.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; dossier invalide, aucune
    /// bibliothèque ouverte, dossier illisible.
    pub fn list_notes(&self, folder: &str) -> Result<Vec<NoteListItem>, ApiError> {
        let store = self.store()?;
        let notes = ListNotes::new(&*store).execute(&Folder::parse(folder)?)?;
        Ok(notes
            .into_iter()
            .map(|n| NoteListItem {
                path: n.path().to_path(),
                title: n.title().to_owned(),
                modified: n.modified().0,
                pinned: n.is_pinned(),
            })
            .collect())
    }

    /// Les notes de toute la bibliothèque qui contiennent tous les mots de `query` ;
    /// aucune si `query` n'a pas de mot.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; aucune bibliothèque
    /// ouverte, bibliothèque illisible.
    pub fn search_notes(&self, query: &str) -> Result<Vec<SearchResultItem>, ApiError> {
        let store = self.store()?;
        let Some(query) = SearchQuery::parse(query) else {
            return Ok(Vec::new());
        };
        let found = SearchNotes::new(&*store).execute(&query)?;
        Ok(found.into_iter().map(search_result_item).collect())
    }

    /// Le contenu d'une note, désignée par le chemin reçu de la page.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, note
    /// absente ou illisible, aucune bibliothèque ouverte.
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
    /// dossier absent, note illisible, nom pris, aucune bibliothèque ouverte.
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
    /// ou illisible, stockage indisponible, aucune bibliothèque ouverte.
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
    /// indisponible, aucune bibliothèque ouverte.
    pub fn create_note(&self, folder: &str) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let created = CreateNote::new(&*store).execute(&Folder::parse(folder)?)?;
        Ok(SavedNote {
            path: created.to_path(),
        })
    }

    /// Les chemins de tous les dossiers de la bibliothèque, dans l'ordre de l'arbre.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; aucune bibliothèque
    /// ouverte, bibliothèque illisible.
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
    /// dossier déjà existant, parent absent, aucune bibliothèque ouverte.
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
    /// racine, nom déjà pris, dossier absent, aucune bibliothèque ouverte.
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
    /// déplacement dans lui-même, nom déjà pris, dossier absent, aucune bibliothèque ouverte.
    pub fn move_folder(&self, path: &str, into: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        let moved =
            MoveFolder::new(&*store).execute(&Folder::parse(path)?, &Folder::parse(into)?)?;
        Ok(moved.to_path())
    }

    fn keep(&self, location: &LibraryLocation, store: Arc<dyn NoteStore>) -> LibraryInfo {
        let opened = OpenLibraryState {
            location: location.clone(),
            store,
        };
        *self.library.write().unwrap_or_else(PoisonError::into_inner) = Some(opened);
        library_info(location)
    }

    fn opened(&self) -> Result<OpenLibraryState, ApiError> {
        let library = self.library.read().unwrap_or_else(PoisonError::into_inner);
        library
            .clone()
            .ok_or_else(|| AppError::NoLibraryOpen.into())
    }

    fn store(&self) -> Result<Arc<dyn NoteStore>, ApiError> {
        Ok(self.opened()?.store)
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

fn library_info(location: &LibraryLocation) -> LibraryInfo {
    let path = location.as_str().to_owned();
    let name = Path::new(&path)
        .file_name()
        .map_or_else(|| path.clone(), |n| n.to_string_lossy().into_owned());
    LibraryInfo { name, path }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};
    use application::{LibraryLocation, Preferences};

    use std::path::Path;

    use super::*;

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
        session
            .open_library(LibraryLocation::new("/Users/moi/Notes").unwrap())
            .unwrap();
        session
    }

    #[test]
    fn nothing_works_before_a_library_is_open() {
        let session = session_with(&[]);
        assert_eq!(
            session.list_notes("").unwrap_err().message,
            "aucune bibliothèque n'est ouverte"
        );
    }

    #[test]
    fn opening_a_library_tells_its_name() {
        let session = session_with(&[]);
        let info = session
            .open_library(LibraryLocation::new("/Users/moi/Notes").unwrap())
            .unwrap();
        assert_eq!(info.name, "Notes");
        assert_eq!(info.path, "/Users/moi/Notes");
    }

    #[test]
    fn cancelling_the_folder_picker_opens_nothing() {
        let session = session_with(&[]);
        assert_eq!(session.open_chosen_folder(None).unwrap(), None);
        assert!(session.list_notes("").is_err());
    }

    #[test]
    fn the_chosen_folder_becomes_the_open_library() {
        let session = session_with(&[]);
        let info = session
            .open_chosen_folder(Some(Path::new("/Users/moi/Notes")))
            .unwrap();
        assert_eq!(info.map(|i| i.name), Some("Notes".into()));
    }

    #[test]
    fn a_folder_name_that_is_not_text_is_refused() {
        use std::ffi::OsStr;
        use std::os::unix::ffi::OsStrExt;
        let session = session_with(&[]);
        let folder = Path::new(OsStr::from_bytes(b"/Users/moi/\xff"));
        let error = session.open_chosen_folder(Some(folder)).unwrap_err();
        assert_eq!(
            error.message,
            "le nom du dossier « /Users/moi/\u{FFFD} » est illisible"
        );
    }

    #[test]
    fn an_empty_folder_path_is_refused() {
        let session = session_with(&[]);
        let error = session.open_chosen_folder(Some(Path::new(""))).unwrap_err();
        assert_eq!(error.message, "l'emplacement de la bibliothèque est vide");
    }

    #[test]
    fn last_library_is_reopened() {
        let preferences = FakePreferences::default();
        preferences
            .remember_library(&LibraryLocation::new("/Users/moi/Notes").unwrap())
            .unwrap();
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
        let session = Session::new(
            Arc::new(opener),
            Arc::new(preferences),
            Arc::new(FixedClock::default()),
        );
        assert_eq!(
            session.reopen_last_library().unwrap().map(|i| i.name),
            Some("Notes".into())
        );
        assert!(session.list_notes("").is_ok());
    }

    #[test]
    fn notes_are_listed_with_their_title() {
        let session = opened(&[("a.md", "# Alpha")]);
        let notes = session.list_notes("").unwrap();
        assert_eq!(notes[0].path, "a.md");
        assert_eq!(notes[0].title, "Alpha");
    }

    #[test]
    fn a_pinned_note_is_listed_first_and_marked() {
        let session = opened(&[("a.md", "# Alpha"), ("b.md", "# Bêta")]);
        let pinned = session.pin_note("a.md").unwrap();
        assert_eq!(pinned.path, "a.md");
        assert_eq!(pinned.content, "---\npinned: true\n---\n# Alpha");
        let notes = session.list_notes("").unwrap();
        assert_eq!(notes[0].path, "a.md");
        assert!(notes[0].pinned);
        assert!(!notes[1].pinned);
    }

    #[test]
    fn an_unpinned_note_loses_its_mark() {
        let session = opened(&[("a.md", "---\npinned: true\n---\n# Alpha")]);
        assert_eq!(session.unpin_note("a.md").unwrap().content, "# Alpha");
        assert!(!session.list_notes("").unwrap()[0].pinned);
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
        assert_eq!(session.list_notes("Perso/Travail").unwrap()[0].title, "A");
    }

    #[test]
    fn invalid_folder_names_from_the_page_are_refused() {
        let session = opened(&[]);
        assert_eq!(
            session.create_folder("", ".cache").unwrap_err().message,
            "nom de dossier invalide : « .cache »"
        );
        assert_eq!(
            session.list_notes("../x").unwrap_err().message,
            "nom de dossier invalide : « ../x »"
        );
    }

    #[test]
    fn notes_are_searched_in_every_folder_with_an_excerpt() {
        let session = opened(&[
            ("a.md", "# Alpha\ndu pain"),
            ("Travail/b.md", "# Bêta\nlait"),
        ]);
        let results = session.search_notes("PAIN").unwrap();
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
        assert_eq!(session.search_notes("lait").unwrap()[0].folder, "Travail");
    }

    #[test]
    fn a_search_without_words_finds_nothing() {
        let session = opened(&[("a.md", "# Alpha")]);
        assert!(session.search_notes("   ").unwrap().is_empty());
    }

    #[test]
    fn searching_needs_an_open_library() {
        let session = session_with(&[]);
        assert!(session.search_notes("pain").is_err());
    }

    #[test]
    fn invalid_names_from_the_page_are_refused() {
        let session = opened(&[]);
        let error = session.read_note("../../etc/passwd").unwrap_err();
        assert_eq!(error.message, "nom de note invalide : « ../../etc/passwd »");
    }
}
