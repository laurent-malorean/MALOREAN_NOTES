//! L'historique des versions d'une note : en garder une, les lister, en comparer une à la note,
//! revenir à l'une d'elles.

use domain::NotePath;
use domain::diff::{Difference, differences};
use domain::history::{Version, before_outside_change, next_version, retained};

use crate::{AppError, Clock, History, NoteIndex, NoteStore, StoreError, StoredNote};

/// Garde une version d'une note, sauf si son texte est déjà celui de la plus récente ; les
/// versions que la conservation ne garde plus sont alors retirées.
#[derive(Debug)]
pub struct KeepVersion<'a> {
    store: &'a dyn NoteStore,
    history: &'a dyn History,
    clock: &'a dyn Clock,
}

impl<'a> KeepVersion<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et son historique.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, history: &'a dyn History, clock: &'a dyn Clock) -> Self {
        Self {
            store,
            history,
            clock,
        }
    }

    /// Garde le texte actuel de la note ; rend la version gardée, aucune s'il n'a pas changé
    /// depuis la plus récente.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si la note n'existe pas, [`AppError::NoteUnreadable`] si elle
    /// n'est pas du texte UTF-8, [`AppError::StorageUnavailable`] si le stockage ou
    /// l'historique ne répond pas.
    pub fn execute(&self, note: &NotePath) -> Result<Option<Version>, AppError> {
        let current = self.store.read(note)?;
        self.keep(note, &current.content)
    }

    /// Garde `content` comme version de la note ; rend la version gardée, aucune si c'est déjà
    /// le texte de la plus récente.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'historique ne répond pas.
    pub fn keep(&self, note: &NotePath, content: &str) -> Result<Option<Version>, AppError> {
        let mut existing = self.history.versions(note)?;
        let latest = match existing.iter().max() {
            Some(version) => Some(self.history.read_version(note, version)?),
            None => None,
        };
        let now = self.clock.now();
        let Some(version) = next_version(&existing, latest.as_deref(), content, now) else {
            return Ok(None);
        };
        self.history.write_version(note, &version, content)?;
        existing.push(version);
        let kept = retained(&existing, now);
        let gone: Vec<Version> = existing
            .into_iter()
            .filter(|version| !kept.contains(version))
            .collect();
        self.history.remove_versions(note, &gone)?;
        Ok(Some(version))
    }
}

/// Les versions d'une note, la plus récente d'abord.
#[derive(Debug)]
pub struct ListVersions<'a> {
    history: &'a dyn History,
}

impl<'a> ListVersions<'a> {
    /// Le cas d'usage, branché sur l'historique de l'espace de travail ouvert.
    #[must_use]
    pub fn new(history: &'a dyn History) -> Self {
        Self { history }
    }

    /// Les versions de la note, la plus récente d'abord ; aucune si elle n'en a pas.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'historique ne peut pas être lu.
    pub fn execute(&self, note: &NotePath) -> Result<Vec<Version>, AppError> {
        let mut versions = self.history.versions(note)?;
        versions.sort_unstable_by(|a, b| b.cmp(a));
        Ok(versions)
    }
}

/// Ce qui distingue une version de la note telle qu'elle est maintenant.
#[derive(Debug)]
pub struct CompareVersion<'a> {
    store: &'a dyn NoteStore,
    history: &'a dyn History,
}

impl<'a> CompareVersion<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et son historique.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, history: &'a dyn History) -> Self {
        Self { store, history }
    }

    /// Les lignes de la note actuelle et de la version : celles qui ne sont que dans la note
    /// sont retirées ([`Difference::Removed`]), celles qui ne sont que dans la version, ajoutées.
    ///
    /// # Errors
    ///
    /// [`AppError::VersionNotFound`] si la note n'a pas cette version, [`AppError::NoteNotFound`]
    /// si elle n'existe pas, [`AppError::NoteUnreadable`] si elle n'est pas du texte UTF-8,
    /// [`AppError::StorageUnavailable`] si le stockage ou l'historique ne répond pas.
    pub fn execute(&self, note: &NotePath, version: &Version) -> Result<Vec<Difference>, AppError> {
        let kept = self.history.read_version(note, version)?;
        let current = self.store.read(note)?;
        Ok(differences(&current.content, &kept))
    }
}

/// Revient à une version d'une note : le texte actuel est d'abord gardé comme version, pour
/// pouvoir toujours revenir en arrière.
#[derive(Debug)]
pub struct RestoreVersion<'a> {
    keeping: KeepVersion<'a>,
}

impl<'a> RestoreVersion<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et son historique.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, history: &'a dyn History, clock: &'a dyn Clock) -> Self {
        Self {
            keeping: KeepVersion::new(store, history, clock),
        }
    }

    /// La note, qui a désormais le texte de la version ; son nom de fichier ne change pas.
    ///
    /// # Errors
    ///
    /// [`AppError::VersionNotFound`] si la note n'a pas cette version (rien n'est alors changé),
    /// [`AppError::NoteNotFound`] si elle n'existe pas, [`AppError::NoteUnreadable`] si elle
    /// n'est pas du texte UTF-8, [`AppError::StorageUnavailable`] si le stockage ou
    /// l'historique ne répond pas.
    pub fn execute(&self, note: &NotePath, version: &Version) -> Result<StoredNote, AppError> {
        let KeepVersion { store, history, .. } = self.keeping;
        let restored = history.read_version(note, version)?;
        self.keeping.execute(note)?;
        store.write(note, &restored)?;
        Ok(store.read(note)?)
    }
}

/// Juste avant qu'un changement fait hors de l'application ne soit suivi, garde en version le
/// texte que l'application connaissait des notes changées.
#[derive(Debug)]
pub struct KeepVersionsBeforeChange<'a> {
    index: &'a dyn NoteIndex,
    keeping: KeepVersion<'a>,
}

impl<'a> KeepVersionsBeforeChange<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert, son index (qui n'a pas encore
    /// suivi le changement) et son historique.
    #[must_use]
    pub fn new(
        store: &'a dyn NoteStore,
        index: &'a dyn NoteIndex,
        history: &'a dyn History,
        clock: &'a dyn Clock,
    ) -> Self {
        Self {
            index,
            keeping: KeepVersion::new(store, history, clock),
        }
    }

    /// Pour chaque note changée, une version du texte que l'index en avait, s'il n'est plus
    /// celui du disque (la note a pu disparaître).
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si le stockage, l'index ou l'historique ne répond pas.
    pub fn execute(&self, notes: &[NotePath]) -> Result<(), AppError> {
        for note in notes {
            let known = self.index.content(note)?;
            let on_disk = match self.keeping.store.read(note) {
                Ok(stored) => Some(stored.content),
                Err(StoreError::NotFound(_) | StoreError::Unreadable(_)) => None,
                Err(error) => return Err(error.into()),
            };
            if let Some(text) = before_outside_change(known.as_deref(), on_disk.as_deref()) {
                self.keeping.keep(note, text)?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use domain::Moment;

    use super::*;
    use crate::MemoryHistory;
    use crate::testing::{FixedClock, InMemoryNoteStore, indexed};

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn version(id: &str) -> Version {
        Version::parse(id).unwrap()
    }

    fn at(day: u32, hour: u32, minute: u32) -> FixedClock {
        FixedClock::at(Moment::new(2026, 11, day, hour, minute).unwrap())
    }

    struct Workspace {
        store: InMemoryNoteStore,
        history: MemoryHistory,
    }

    fn workspace(notes: &[(&str, &str)]) -> Workspace {
        Workspace {
            store: InMemoryNoteStore::with_notes(notes),
            history: MemoryHistory::default(),
        }
    }

    impl Workspace {
        fn keep_at(&self, clock: &FixedClock, note: &str) -> Option<Version> {
            KeepVersion::new(&self.store, &self.history, clock)
                .execute(&path(note))
                .unwrap()
        }

        fn ids(&self, note: &str) -> Vec<String> {
            let versions = ListVersions::new(&self.history).execute(&path(note));
            versions.unwrap().iter().map(Version::id).collect()
        }

        fn text(&self, note: &str, id: &str) -> String {
            self.history
                .read_version(&path(note), &version(id))
                .unwrap()
        }
    }

    #[test]
    fn the_current_text_of_a_note_is_kept_as_a_version() {
        let workspace = workspace(&[("a.md", "# A")]);
        let kept = workspace.keep_at(&at(18, 14, 30), "a.md");
        assert_eq!(kept, Some(version("2026-11-18 14h30")));
        assert_eq!(workspace.text("a.md", "2026-11-18 14h30"), "# A");
    }

    #[test]
    fn a_text_identical_to_the_latest_version_is_not_kept_again() {
        let workspace = workspace(&[("a.md", "# A")]);
        workspace.keep_at(&at(18, 14, 30), "a.md");
        assert_eq!(workspace.keep_at(&at(18, 15, 0), "a.md"), None);
        assert_eq!(workspace.ids("a.md"), ["2026-11-18 14h30"]);
    }

    #[test]
    fn versions_are_listed_newest_first_and_two_in_one_minute_are_both_kept() {
        let workspace = workspace(&[("a.md", "# A")]);
        workspace.keep_at(&at(18, 14, 0), "a.md");
        workspace.store.write(&path("a.md"), "# B").unwrap();
        workspace.keep_at(&at(18, 14, 30), "a.md");
        workspace.store.write(&path("a.md"), "# C").unwrap();
        workspace.keep_at(&at(18, 14, 30), "a.md");
        assert_eq!(
            workspace.ids("a.md"),
            [
                "2026-11-18 14h30 (2)",
                "2026-11-18 14h30",
                "2026-11-18 14h00"
            ]
        );
    }

    #[test]
    fn keeping_a_version_removes_those_the_retention_no_longer_keeps() {
        let workspace = workspace(&[("a.md", "# Maintenant")]);
        for id in ["2026-11-10 09h00", "2026-11-10 18h00", "2026-11-17 20h00"] {
            workspace
                .history
                .write_version(&path("a.md"), &version(id), id)
                .unwrap();
        }
        workspace.keep_at(&at(18, 14, 30), "a.md");
        assert_eq!(
            workspace.ids("a.md"),
            ["2026-11-18 14h30", "2026-11-17 20h00", "2026-11-10 18h00"]
        );
    }

    #[test]
    fn a_missing_note_has_no_version_to_keep() {
        let workspace = workspace(&[]);
        let error = KeepVersion::new(&workspace.store, &workspace.history, &at(18, 14, 30))
            .execute(&path("a.md"))
            .unwrap_err();
        assert_eq!(error, AppError::NoteNotFound(path("a.md")));
    }

    #[test]
    fn a_version_is_compared_line_by_line_to_the_current_note() {
        let workspace = workspace(&[("a.md", "# A\nancien")]);
        workspace.keep_at(&at(18, 14, 0), "a.md");
        workspace
            .store
            .write(&path("a.md"), "# A\nnouveau")
            .unwrap();
        let found = CompareVersion::new(&workspace.store, &workspace.history)
            .execute(&path("a.md"), &version("2026-11-18 14h00"))
            .unwrap();
        assert_eq!(
            found,
            [
                Difference::Same("# A".into()),
                Difference::Removed("nouveau".into()),
                Difference::Added("ancien".into()),
            ]
        );
    }

    #[test]
    fn restoring_a_version_keeps_the_current_text_first() {
        let workspace = workspace(&[("a.md", "# A\nancien")]);
        workspace.keep_at(&at(18, 14, 0), "a.md");
        workspace
            .store
            .write(&path("a.md"), "# A\nnouveau")
            .unwrap();
        let restored = RestoreVersion::new(&workspace.store, &workspace.history, &at(18, 14, 30))
            .execute(&path("a.md"), &version("2026-11-18 14h00"))
            .unwrap();
        assert_eq!(restored.content, "# A\nancien");
        assert_eq!(
            workspace.store.read(&path("a.md")).unwrap().content,
            "# A\nancien"
        );
        assert_eq!(workspace.text("a.md", "2026-11-18 14h30"), "# A\nnouveau");
    }

    #[test]
    fn restoring_a_missing_version_changes_nothing() {
        let workspace = workspace(&[("a.md", "# A")]);
        let error = RestoreVersion::new(&workspace.store, &workspace.history, &at(18, 14, 30))
            .execute(&path("a.md"), &version("2026-11-18 14h00"))
            .unwrap_err();
        assert_eq!(
            error,
            AppError::VersionNotFound(version("2026-11-18 14h00"))
        );
        assert!(workspace.ids("a.md").is_empty());
    }

    #[test]
    fn the_known_text_is_kept_before_a_change_made_outside() {
        let workspace = workspace(&[("a.md", "# Connu"), ("b.md", "# B"), ("c.md", "# C")]);
        let index = indexed(&workspace.store);
        workspace
            .store
            .write(&path("a.md"), "# Changé ailleurs")
            .unwrap();
        workspace
            .store
            .trash_note(&path("c.md"), &path("c.md"))
            .unwrap();
        KeepVersionsBeforeChange::new(&workspace.store, &index, &workspace.history, &at(18, 9, 0))
            .execute(&[path("a.md"), path("b.md"), path("c.md"), path("d.md")])
            .unwrap();
        assert_eq!(workspace.text("a.md", "2026-11-18 09h00"), "# Connu");
        assert!(workspace.ids("b.md").is_empty());
        assert_eq!(workspace.text("c.md", "2026-11-18 09h00"), "# C");
        assert!(workspace.ids("d.md").is_empty());
    }
}
