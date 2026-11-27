//! Les favoris de l'espace de travail ouvert, vus depuis l'interface et les outils (fiche 0102).

use application::use_cases::{Favorites, FavoritesList, ManageFavoritesNote};
use domain::favorites::RemovedLine;
use domain::{Folder, NotePath};

use super::{OpenWorkspaceState, Session};
use crate::{ApiError, FavoritesNoteItem, RemovedLineItem};

impl Session {
    fn favorites_of<'a>(&'a self, opened: &'a OpenWorkspaceState) -> Favorites<'a> {
        Favorites::new(
            &*self.preferences,
            &opened.name,
            &*opened.store,
            &*opened.index,
            &*opened.history,
            &*self.clock,
        )
    }

    fn favorites_note_of<'a>(&'a self, opened: &'a OpenWorkspaceState) -> ManageFavoritesNote<'a> {
        ManageFavoritesNote::new(&*self.preferences, &opened.name, &*opened.store)
    }

    /// Ce que l'écriture dans la note des favoris laisse derrière elle, comme toute note
    /// enregistrée par l'application : une version à garder en quittant, le sens à recalculer.
    fn favorites_written(&self, opened: &OpenWorkspaceState) -> Result<(), ApiError> {
        if let Some(note) = self.favorites_note_of(opened).current()? {
            self.saved_since_version(&note.path, &note.path)?;
        }
        self.worker.request();
        Ok(())
    }

    /// La note des favoris de l'espace de travail ouvert ; rien s'il n'en a pas (choisie, ou
    /// disparue du disque).
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; préférences ou stockage illisibles,
    /// aucun espace de travail ouvert.
    pub fn favorites_note(&self) -> Result<Option<FavoritesNoteItem>, ApiError> {
        let opened = self.opened()?;
        Ok(self
            .favorites_note_of(&opened)
            .current()?
            .map(FavoritesNoteItem::from))
    }

    /// Choisit la note `path` comme note des favoris de l'espace de travail ouvert.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, note absente ou qui
    /// n'est pas une note simple, préférences impossibles à écrire, aucun espace de travail
    /// ouvert.
    pub fn choose_favorites_note(&self, path: &str) -> Result<FavoritesNoteItem, ApiError> {
        let opened = self.opened()?;
        let chosen = self
            .favorites_note_of(&opened)
            .choose(&NotePath::parse(path)?)?;
        Ok(chosen.into())
    }

    /// Crée la note des favoris titrée `title` dans `folder` (`""` pour la racine) et la choisit.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; titre vide, dossier invalide ou
    /// absent, stockage ou préférences impossibles à écrire, aucun espace de travail ouvert.
    pub fn create_favorites_note(
        &self,
        title: &str,
        folder: &str,
    ) -> Result<FavoritesNoteItem, ApiError> {
        let opened = self.opened()?;
        let created = self
            .favorites_note_of(&opened)
            .create(title, &Folder::parse(folder)?)?;
        self.worker.request();
        Ok(created.into())
    }

    /// L'espace de travail ouvert n'a plus de note des favoris ; la note n'est pas supprimée.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; préférences impossibles à écrire,
    /// aucun espace de travail ouvert.
    pub fn stop_using_favorites_note(&self) -> Result<(), ApiError> {
        let opened = self.opened()?;
        Ok(self.favorites_note_of(&opened).stop_using()?)
    }

    /// Le contenu `path` est-il en favori ? Faux sans note des favoris.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, stockage illisible,
    /// aucun espace de travail ouvert.
    pub fn is_favorite(&self, path: &str) -> Result<bool, ApiError> {
        let opened = self.opened()?;
        Ok(self
            .favorites_of(&opened)
            .is_favorite(&NotePath::parse(path)?)?)
    }

    /// Met le contenu `path` en favori : une ligne `- [[lien]]` à la fin de la note des favoris.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, pas de note des
    /// favoris, contenu absent, fiche de CRM, la note des favoris elle-même, stockage
    /// indisponible, aucun espace de travail ouvert.
    pub fn add_favorite(&self, path: &str) -> Result<(), ApiError> {
        let opened = self.opened()?;
        self.favorites_of(&opened).add(&NotePath::parse(path)?)?;
        self.favorites_written(&opened)
    }

    /// Retire des favoris le contenu `path`, sans confirmation. Rend les lignes retirées, avec
    /// leur place, pour `restore_favorites` ; aucune s'il n'était pas en favori.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, pas de note des
    /// favoris, stockage indisponible, aucun espace de travail ouvert.
    pub fn remove_favorite(&self, path: &str) -> Result<Vec<RemovedLineItem>, ApiError> {
        let opened = self.opened()?;
        let removed = self.favorites_of(&opened).remove(&NotePath::parse(path)?)?;
        self.favorites_written(&opened)?;
        Ok(removed.into_iter().map(RemovedLineItem::from).collect())
    }

    /// Remet à leur place les lignes qu'un retrait a ôtées (le bouton « Annuler »).
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; pas de note des favoris, stockage
    /// indisponible, aucun espace de travail ouvert.
    pub fn restore_favorites(&self, removed: Vec<RemovedLineItem>) -> Result<(), ApiError> {
        let opened = self.opened()?;
        let removed: Vec<RemovedLine> = removed.into_iter().map(RemovedLine::from).collect();
        self.favorites_of(&opened).restore(&removed)?;
        self.favorites_written(&opened)
    }

    /// La note des favoris et ses contenus en favori, dans l'ordre de la note.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; pas de note des favoris, stockage
    /// illisible, aucun espace de travail ouvert.
    pub fn list_favorites(&self) -> Result<FavoritesList, ApiError> {
        let opened = self.opened()?;
        Ok(self.favorites_of(&opened).list()?)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;

    fn session() -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(&[
            ("favoris.md", "# Favoris\n"),
            ("courses.md", "# Courses"),
        ])));
        let session = Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        session
    }

    fn pending(session: &Session) -> bool {
        let opened = session.opened().unwrap();
        let pending = opened.pending.lock().unwrap();
        pending.contains(&NotePath::parse("favoris.md").unwrap())
    }

    #[test]
    fn a_change_of_the_favorites_note_waits_for_its_version_like_any_saved_note() {
        let session = session();
        session.choose_favorites_note("favoris.md").unwrap();
        assert!(!pending(&session));

        session.add_favorite("courses.md").unwrap();
        assert!(pending(&session));
        session.keep_pending_versions();
        assert!(!pending(&session));

        let removed = session.remove_favorite("courses.md").unwrap();
        assert!(pending(&session));
        session.keep_pending_versions();

        session.restore_favorites(removed).unwrap();
        assert!(pending(&session));
    }

    #[test]
    fn creating_the_favorites_note_chooses_it() {
        let session = session();
        let created = session.create_favorites_note("Mes favoris", "").unwrap();
        assert_eq!(created.path, "mes-favoris.md");
        assert_eq!(session.favorites_note().unwrap(), Some(created));
    }

    #[test]
    fn an_invalid_path_or_folder_is_refused_before_anything_is_written() {
        let session = session();
        session.choose_favorites_note("favoris.md").unwrap();
        assert!(session.choose_favorites_note("../x.md").is_err());
        assert!(session.create_favorites_note("Favoris", "../x").is_err());
        assert!(session.is_favorite("../x.md").is_err());
        assert!(session.add_favorite("../x.md").is_err());
        assert!(session.remove_favorite("../x.md").is_err());
        assert_eq!(
            session.read_note("favoris.md").unwrap().content,
            "# Favoris\n"
        );
    }

    #[test]
    fn the_favorites_are_listed_for_the_tools() {
        let session = session();
        session.choose_favorites_note("favoris.md").unwrap();
        session.add_favorite("courses.md").unwrap();
        let list = session.list_favorites().unwrap();
        assert_eq!(list.contents.len(), 1);
        assert_eq!(list.contents[0].title, "Courses");
    }
}
