//! La note des favoris de l'espace de travail (fiche 0102) : la lire, la choisir, la créer, ne plus
//! en avoir. Le choix est gardé dans les préférences, avec l'espace de travail, jamais dans son
//! dossier ; la note se retrouve par son chemin (le suivre est le travail de [`crate::FavoritesStore`]).

use domain::title::displayed_title_of_note;
use domain::{ContentType, Folder, NotePath};

use crate::use_cases::CreateNote;
use crate::{AppError, NoteStore, Preferences, StoreError, StoredNote, WorkspaceName};

/// La note des favoris choisie pour un espace de travail.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FavoritesNote {
    /// Le dossier et le nom de fichier de la note.
    pub path: NotePath,
    /// Son titre affiché.
    pub title: String,
}

impl FavoritesNote {
    fn of(note: &StoredNote) -> Self {
        Self {
            title: displayed_title_of_note(&note.content, note.path.name()),
            path: note.path.clone(),
        }
    }
}

/// Choisit, crée et retire la note des favoris d'un espace de travail.
#[derive(Debug)]
pub struct ManageFavoritesNote<'a> {
    preferences: &'a dyn Preferences,
    workspace: &'a WorkspaceName,
    store: &'a dyn NoteStore,
}

impl<'a> ManageFavoritesNote<'a> {
    /// Le cas d'usage, branché sur les préférences et les notes de l'espace de travail `workspace`.
    #[must_use]
    pub fn new(
        preferences: &'a dyn Preferences,
        workspace: &'a WorkspaceName,
        store: &'a dyn NoteStore,
    ) -> Self {
        Self {
            preferences,
            workspace,
            store,
        }
    }

    /// La note des favoris choisie ; rien s'il n'y en a pas, ou si elle a disparu du disque (le
    /// choix reste gardé : la note retrouvée à son chemin redevient la note des favoris).
    ///
    /// # Errors
    ///
    /// [`AppError::NoteUnreadable`] si la note n'est pas du texte UTF-8,
    /// [`AppError::StorageUnavailable`] si les préférences ou le stockage ne répondent pas.
    pub fn current(&self) -> Result<Option<FavoritesNote>, AppError> {
        let workspaces = self.preferences.workspaces()?;
        let Some(path) = workspaces.favorites_note(self.workspace) else {
            return Ok(None);
        };
        match self.store.read(path) {
            Ok(note) => Ok(Some(FavoritesNote::of(&note))),
            Err(StoreError::NotFound(_)) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    /// Choisit la note `note` comme note des favoris.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si elle n'existe pas, [`AppError::NotAFavoritesNote`] si ce n'est
    /// pas une note simple (cahier de recherche, carte mentale, canvas, CRM, fiche),
    /// [`AppError::NoteUnreadable`] si elle n'est pas du texte UTF-8,
    /// [`AppError::StorageUnavailable`] si les préférences ne peuvent pas être lues ou écrites.
    pub fn choose(&self, note: &NotePath) -> Result<FavoritesNote, AppError> {
        let stored = self.store.read(note)?;
        if ContentType::of_file(note.name(), &stored.content) != ContentType::Note {
            return Err(AppError::NotAFavoritesNote);
        }
        self.keep(Some(note.clone()))?;
        Ok(FavoritesNote::of(&stored))
    }

    /// Crée la note des favoris titrée `title` dans `folder` (son nom de fichier suit son titre,
    /// avec le premier suffixe libre si ce nom est pris) et la choisit.
    ///
    /// # Errors
    ///
    /// [`AppError::EmptyTitle`] si le titre est vide, [`AppError::FolderNotFound`] si le dossier
    /// n'existe pas, [`AppError::StorageUnavailable`] si le stockage ou les préférences ne
    /// répondent pas.
    pub fn create(&self, title: &str, folder: &Folder) -> Result<FavoritesNote, AppError> {
        let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
        if title.is_empty() {
            return Err(AppError::EmptyTitle);
        }
        let note = CreateNote::new(self.store).with_content(folder, &format!("# {title}\n"))?;
        self.choose(&note)
    }

    /// Ne plus utiliser de note des favoris ; la note n'est pas supprimée.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si les préférences ne peuvent pas être lues ou écrites.
    pub fn stop_using(&self) -> Result<(), AppError> {
        self.keep(None)
    }

    fn keep(&self, note: Option<NotePath>) -> Result<(), AppError> {
        let next = self
            .preferences
            .workspaces()?
            .choosing_favorites_note(self.workspace, note)?;
        Ok(self.preferences.save_workspaces(&next)?)
    }
}
