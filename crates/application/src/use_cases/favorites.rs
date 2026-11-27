//! Les favoris (fiche 0102) : mettre un contenu en favori ou l'en retirer (ce que fait l'étoile),
//! annuler un retrait, savoir si un contenu est en favori, lister les favoris. Tout passe par
//! la note des favoris, une note ordinaire : une ligne `- [[lien]]` ajoutée à sa fin ou retirée,
//! avec les règles de l'écriture d'une note (le texte d'avant est gardé en version, l'index suit,
//! et l'écran qui montre la note voit le fichier changer comme pour tout changement fait par
//! une IA).

use domain::favorites::{
    RemovedLine, favorites_of, is_favorite, with_favorite, with_lines_back, without_favorite,
};
use domain::favorites_note::can_be_favorite;
use domain::links::LinkIndex;
use domain::{ContentType, NotePath, NoteSummary};

use crate::use_cases::{FavoritesNote, KeepVersion, ListAllNotes, ManageFavoritesNote};
use crate::{AppError, Clock, History, NoteIndex, NoteStore, Preferences, WorkspaceName};

/// Un contenu en favori, tel que la liste le montre.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FavoriteContent {
    /// Le dossier et le nom de fichier du contenu.
    pub path: NotePath,
    /// Son titre affiché.
    pub title: String,
    /// Son type de contenu, que la liste montre par une icône.
    pub content_type: ContentType,
}

/// La note des favoris et les contenus en favori, dans l'ordre de la note.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FavoritesList {
    /// La note des favoris.
    pub note: FavoritesNote,
    /// Les contenus en favori, dans l'ordre de la note, chacun une fois.
    pub contents: Vec<FavoriteContent>,
}

/// Met des contenus en favori, les retire, et lit les favoris.
#[derive(Debug)]
pub struct Favorites<'a> {
    choice: ManageFavoritesNote<'a>,
    store: &'a dyn NoteStore,
    index: &'a dyn NoteIndex,
    keeping: KeepVersion<'a>,
}

impl<'a> Favorites<'a> {
    /// Le cas d'usage, branché sur l'espace de travail `workspace`, ses notes, son index, son
    /// historique, ses préférences et l'horloge.
    #[must_use]
    pub fn new(
        preferences: &'a dyn Preferences,
        workspace: &'a WorkspaceName,
        store: &'a dyn NoteStore,
        index: &'a dyn NoteIndex,
        history: &'a dyn History,
        clock: &'a dyn Clock,
    ) -> Self {
        Self {
            choice: ManageFavoritesNote::new(preferences, workspace, store),
            store,
            index,
            keeping: KeepVersion::new(store, history, clock),
        }
    }

    /// Ce que les liens de l'espace de travail désignent, et le résumé de chaque contenu.
    fn links(&self) -> Result<(LinkIndex, Vec<NoteSummary>), AppError> {
        let notes = ListAllNotes::new(self.index).execute()?;
        let links = LinkIndex::new(
            notes
                .iter()
                .map(|note| (note.path().clone(), note.title().to_owned())),
        );
        Ok((links, notes))
    }

    fn chosen(&self) -> Result<FavoritesNote, AppError> {
        self.choice.current()?.ok_or(AppError::NoFavoritesNote)
    }

    /// Garde le texte d'avant en version, puis écrit `next` dans la note des favoris.
    fn write(&self, note: &NotePath, current: &str, next: &str) -> Result<(), AppError> {
        self.keeping.keep(note, current)?;
        Ok(self.store.write(note, next)?)
    }

    /// Le contenu `content` est-il en favori ? Faux sans note des favoris, et pour la note des
    /// favoris elle-même.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteUnreadable`] si la note des favoris n'est pas du texte UTF-8,
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn is_favorite(&self, content: &NotePath) -> Result<bool, AppError> {
        let Some(note) = self.choice.current()?.filter(|note| note.path != *content) else {
            return Ok(false);
        };
        let text = self.store.read(&note.path)?.content;
        Ok(is_favorite(&text, &self.links()?.0, content))
    }

    /// Met le contenu `content` en favori : une ligne `- [[lien]]` à la fin de la note des
    /// favoris, avec le lien que donne le menu des liens. Déjà en favori : rien ne change.
    ///
    /// # Errors
    ///
    /// [`AppError::NoFavoritesNote`] s'il n'y a pas de note des favoris,
    /// [`AppError::FavoritesNoteIsNoFavorite`] pour la note des favoris elle-même,
    /// [`AppError::NoteNotFound`] si le contenu n'existe pas, [`AppError::FicheHasNoStar`] pour une
    /// fiche du CRM, [`AppError::NoteUnreadable`] si une note n'est pas du texte UTF-8,
    /// [`AppError::StorageUnavailable`] si le stockage ou l'historique ne répond pas.
    pub fn add(&self, content: &NotePath) -> Result<(), AppError> {
        let note = self.chosen()?;
        if note.path == *content {
            return Err(AppError::FavoritesNoteIsNoFavorite);
        }
        let stored = self.store.read(content)?;
        if !can_be_favorite(ContentType::of_file(content.name(), &stored.content)) {
            return Err(AppError::FicheHasNoStar);
        }
        let text = self.store.read(&note.path)?.content;
        let (links, _) = self.links()?;
        if is_favorite(&text, &links, content) {
            return Ok(());
        }
        let link = links
            .written(content)
            .ok_or_else(|| AppError::NoteNotFound(content.clone()))?;
        self.write(&note.path, &text, &with_favorite(&text, &link))
    }

    /// Retire des favoris le contenu `content` : toutes les lignes de la note des favoris qui le
    /// désignent (doublons compris) sont retirées, sans confirmation. Rend ces lignes, avec leur
    /// place, de quoi les remettre ([`Favorites::restore`]) ; aucune s'il n'était pas en favori,
    /// et rien n'est alors écrit.
    ///
    /// # Errors
    ///
    /// [`AppError::NoFavoritesNote`] s'il n'y a pas de note des favoris,
    /// [`AppError::NoteUnreadable`] si elle n'est pas du texte UTF-8,
    /// [`AppError::StorageUnavailable`] si le stockage ou l'historique ne répond pas.
    pub fn remove(&self, content: &NotePath) -> Result<Vec<RemovedLine>, AppError> {
        let note = self.chosen()?;
        let text = self.store.read(&note.path)?.content;
        let removal = without_favorite(&text, &self.links()?.0, content);
        if !removal.removed.is_empty() {
            self.write(&note.path, &text, &removal.text)?;
        }
        Ok(removal.removed)
    }

    /// Remet à leur place les lignes que [`Favorites::remove`] a retirées. Rien n'est écrit s'il
    /// n'y en a aucune.
    ///
    /// # Errors
    ///
    /// [`AppError::NoFavoritesNote`] s'il n'y a pas de note des favoris,
    /// [`AppError::NoteUnreadable`] si elle n'est pas du texte UTF-8,
    /// [`AppError::StorageUnavailable`] si le stockage ou l'historique ne répond pas.
    pub fn restore(&self, removed: &[RemovedLine]) -> Result<(), AppError> {
        let note = self.chosen()?;
        if removed.is_empty() {
            return Ok(());
        }
        let text = self.store.read(&note.path)?.content;
        self.write(&note.path, &text, &with_lines_back(&text, removed))
    }

    /// La note des favoris et les contenus en favori, dans l'ordre de la note.
    ///
    /// # Errors
    ///
    /// [`AppError::NoFavoritesNote`] s'il n'y a pas de note des favoris,
    /// [`AppError::NoteUnreadable`] si elle n'est pas du texte UTF-8,
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn list(&self) -> Result<FavoritesList, AppError> {
        let note = self.chosen()?;
        let text = self.store.read(&note.path)?.content;
        let (links, notes) = self.links()?;
        let contents = favorites_of(&text, &links)
            .into_iter()
            .filter_map(|path| {
                let summary = notes.iter().find(|summary| *summary.path() == path)?;
                Some(FavoriteContent {
                    title: summary.title().to_owned(),
                    content_type: summary.content_type(),
                    path,
                })
            })
            .collect();
        Ok(FavoritesList { note, contents })
    }
}

#[cfg(test)]
#[path = "favorites_tests.rs"]
mod tests;
