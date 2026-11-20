//! L'historique des versions d'une note : la liste datée, la comparaison avec la note, le retour
//! à une version, et les versions gardées en quittant une note ou l'application.

use std::sync::{Arc, PoisonError};

use application::HistoryOpener;
use application::use_cases::{
    CompareVersion, KeepVersion, ListVersions, ReadVersion, RestoreVersion,
};
use domain::NotePath;
use domain::diff::Difference;
use domain::history::Version;

use super::{Session, note_content};
use crate::{ApiError, DifferenceItem, DifferenceKind, NoteContent, VersionItem};

impl Session {
    /// La même session, dont l'historique de chaque espace de travail est ouvert par `histories`.
    #[must_use]
    pub fn with_histories(mut self, histories: Arc<dyn HistoryOpener>) -> Self {
        self.histories = histories;
        self
    }

    /// Les versions de la note, la plus récente d'abord.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, historique
    /// illisible, aucun espace de travail ouvert.
    pub fn list_versions(&self, path: &str) -> Result<Vec<VersionItem>, ApiError> {
        let opened = self.opened()?;
        let versions = ListVersions::new(&*opened.history).execute(&NotePath::parse(path)?)?;
        Ok(versions
            .iter()
            .map(|version| VersionItem {
                id: version.id(),
                label: version.label(),
            })
            .collect())
    }

    /// Le texte de la version `version` de la note.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin ou version invalide,
    /// version absente, aucun espace de travail ouvert.
    pub fn read_version(&self, path: &str, version: &str) -> Result<String, ApiError> {
        let opened = self.opened()?;
        Ok(ReadVersion::new(&*opened.history)
            .execute(&NotePath::parse(path)?, &Version::parse(version)?)?)
    }

    /// Les lignes de la note actuelle et de la version `version`, chacune marquée selon qu'elle
    /// est dans les deux, dans la note seulement, ou dans la version seulement.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin ou version invalide, note
    /// ou version absente, aucun espace de travail ouvert.
    pub fn compare_version(
        &self,
        path: &str,
        version: &str,
    ) -> Result<Vec<DifferenceItem>, ApiError> {
        let opened = self.opened()?;
        let found = CompareVersion::new(&*opened.store, &*opened.history)
            .execute(&NotePath::parse(path)?, &Version::parse(version)?)?;
        Ok(found.into_iter().map(difference_item).collect())
    }

    /// Garde une version du texte actuel de la note, s'il diffère de la plus récente.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, note absente ou
    /// illisible, historique indisponible, aucun espace de travail ouvert.
    pub fn keep_version(&self, path: &str) -> Result<(), ApiError> {
        let opened = self.opened()?;
        let note = NotePath::parse(path)?;
        KeepVersion::new(&*opened.store, &*opened.history, &*self.clock).execute(&note)?;
        opened
            .pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(&note);
        Ok(())
    }

    /// Revient à la version `version` de la note, après avoir gardé son texte actuel comme
    /// version ; rend la note, avec son nouveau texte.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin ou version invalide, note
    /// ou version absente, stockage indisponible, aucun espace de travail ouvert.
    pub fn restore_version(&self, path: &str, version: &str) -> Result<NoteContent, ApiError> {
        let opened = self.opened()?;
        let restored = RestoreVersion::new(&*opened.store, &*opened.history, &*self.clock)
            .execute(&NotePath::parse(path)?, &Version::parse(version)?)?;
        Ok(note_content(restored))
    }

    /// Garde une version de chaque note enregistrée depuis sa dernière version, quand on quitte
    /// l'application ou l'espace de travail. Une note qui n'existe plus est passée ; un échec est
    /// journalisé, sans arrêter les autres.
    pub fn keep_pending_versions(&self) {
        let Ok(opened) = self.opened() else {
            return;
        };
        let pending = std::mem::take(
            &mut *opened
                .pending
                .lock()
                .unwrap_or_else(PoisonError::into_inner),
        );
        let keeping = KeepVersion::new(&*opened.store, &*opened.history, &*self.clock);
        for note in pending {
            if let Err(error) = keeping.execute(&note) {
                tracing::warn!(?error, "une version n'a pas pu être gardée");
            }
        }
    }

    /// La note `from`, enregistrée sous le chemin `to`, attend une version.
    pub(super) fn saved_since_version(
        &self,
        from: &NotePath,
        to: &NotePath,
    ) -> Result<(), ApiError> {
        let opened = self.opened()?;
        let mut pending = opened
            .pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        pending.remove(from);
        pending.insert(to.clone());
        Ok(())
    }
}

pub(super) fn difference_item(difference: Difference) -> DifferenceItem {
    let (kind, text) = match difference {
        Difference::Same(text) => (DifferenceKind::Same, text),
        Difference::Removed(text) => (DifferenceKind::Removed, text),
        Difference::Added(text) => (DifferenceKind::Added, text),
    };
    DifferenceItem { kind, text }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{
        FakeOpener, FakePreferences, FakeWatcher, FixedClock, InMemoryNoteStore,
    };
    use application::{
        History, MemoryHistory, NoteStore, StoreError, WorkspaceChange, WorkspaceLocation,
        WorkspaceWatcher,
    };

    use super::*;

    /// Le même historique pour chaque espace de travail ouvert : on le relit après coup.
    #[derive(Debug)]
    struct Shared(Arc<MemoryHistory>);

    impl HistoryOpener for Shared {
        fn open(&self, _: &WorkspaceLocation) -> Result<Arc<dyn History>, StoreError> {
            Ok(Arc::clone(&self.0) as Arc<dyn History>)
        }
    }

    struct Opened {
        session: Session,
        store: Arc<InMemoryNoteStore>,
        watcher: Arc<FakeWatcher>,
    }

    fn opened(notes: &[(&str, &str)]) -> Opened {
        let store = Arc::new(InMemoryNoteStore::with_notes(notes));
        let watcher = Arc::new(FakeWatcher::default());
        let session = Session::new(
            Arc::new(FakeOpener::new(Arc::clone(&store))),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        )
        .with_histories(Arc::new(Shared(Arc::default())))
        .with_watcher(Arc::clone(&watcher) as Arc<dyn WorkspaceWatcher>);
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        Opened {
            session,
            store,
            watcher,
        }
    }

    fn ids(session: &Session, path: &str) -> Vec<String> {
        let versions = session.list_versions(path).unwrap();
        versions.into_iter().map(|v| v.id).collect()
    }

    fn difference(kind: DifferenceKind, text: &str) -> DifferenceItem {
        DifferenceItem {
            kind,
            text: text.to_owned(),
        }
    }

    #[test]
    fn a_kept_version_is_listed_with_its_date_and_compared_to_the_note() {
        let Opened { session, store, .. } = opened(&[("a.md", "# A\nancien")]);
        session.keep_version("a.md").unwrap();
        store
            .write(&NotePath::parse("a.md").unwrap(), "# A\nnouveau")
            .unwrap();
        assert_eq!(
            session.list_versions("a.md").unwrap(),
            [VersionItem {
                id: "2026-11-16 18h30".into(),
                label: "16 novembre 2026 à 18:30".into(),
            }]
        );
        assert_eq!(
            session.compare_version("a.md", "2026-11-16 18h30").unwrap(),
            [
                difference(DifferenceKind::Same, "# A"),
                difference(DifferenceKind::Removed, "nouveau"),
                difference(DifferenceKind::Added, "ancien"),
            ]
        );
        assert_eq!(
            session.read_version("a.md", "2026-11-16 18h30").unwrap(),
            "# A\nancien"
        );
        assert!(session.read_version("a.md", "pas une version").is_err());
        assert!(session.read_version("../a.md", "2026-11-16 18h30").is_err());
    }

    #[test]
    fn restoring_a_version_keeps_the_current_text_and_gives_back_the_note() {
        let Opened { session, .. } = opened(&[("a.md", "# A\nancien")]);
        session.keep_version("a.md").unwrap();
        let read = session.read_note("a.md").unwrap();
        session
            .save_note("a.md", "# A\nnouveau", &read.fingerprint)
            .unwrap();
        let restored = session.restore_version("a.md", "2026-11-16 18h30").unwrap();
        assert_eq!(restored.content, "# A\nancien");
        assert_eq!(
            restored.fingerprint,
            session.read_note("a.md").unwrap().fingerprint
        );
        assert_eq!(
            ids(&session, "a.md"),
            ["2026-11-16 18h30 (2)", "2026-11-16 18h30"]
        );
        let kept = session
            .compare_version("a.md", "2026-11-16 18h30 (2)")
            .unwrap();
        assert!(kept.contains(&difference(DifferenceKind::Added, "nouveau")));
    }

    #[test]
    fn a_bad_version_or_note_from_the_interface_is_refused() {
        let Opened { session, .. } = opened(&[("a.md", "# A")]);
        assert_eq!(
            session.compare_version("a.md", "../x").unwrap_err().message,
            "version invalide : « ../x »"
        );
        assert_eq!(
            session
                .restore_version("a.md", "2026-11-16 18h30")
                .unwrap_err()
                .message,
            "la version du 16 novembre 2026 à 18:30 n'existe plus"
        );
        assert!(session.list_versions("../a.md").is_err());
        assert!(session.keep_version("b.md").is_err());
    }

    #[test]
    fn a_renamed_note_keeps_its_history() {
        let Opened { session, .. } = opened(&[("a.md", "# Alpha")]);
        session.keep_version("a.md").unwrap();
        let read = session.read_note("a.md").unwrap();
        let saved = session
            .save_note("a.md", "# Bêta", &read.fingerprint)
            .unwrap();
        assert_eq!(saved.path, "beta.md");
        assert_eq!(ids(&session, "beta.md"), ["2026-11-16 18h30"]);
        assert!(ids(&session, "a.md").is_empty());
    }

    #[test]
    fn quitting_keeps_a_version_of_each_note_saved_since_its_last_one() {
        let Opened { session, .. } =
            opened(&[("a.md", "# Alpha"), ("b.md", "# B"), ("c.md", "# C")]);
        for (path, content) in [
            ("a.md", "# Bêta"),
            ("b.md", "# B\nsuite"),
            ("c.md", "# C\n"),
        ] {
            let read = session.read_note(path).unwrap();
            session.save_note(path, content, &read.fingerprint).unwrap();
        }
        session.keep_version("b.md").unwrap();
        session.trash_note("c.md").unwrap();
        session.keep_pending_versions();
        assert_eq!(ids(&session, "beta.md"), ["2026-11-16 18h30"]);
        assert_eq!(ids(&session, "b.md"), ["2026-11-16 18h30"]);
        session.keep_pending_versions();
        assert_eq!(ids(&session, "beta.md"), ["2026-11-16 18h30"]);
    }

    #[test]
    fn opening_another_workspace_keeps_the_pending_versions_of_the_previous_one() {
        let Opened { session, .. } = opened(&[("a.md", "# A")]);
        let read = session.read_note("a.md").unwrap();
        session
            .save_note("a.md", "# A\nsuite", &read.fingerprint)
            .unwrap();
        session
            .add_workspace("Autres", "/Users/moi/Autres")
            .unwrap();
        assert_eq!(ids(&session, "a.md"), ["2026-11-16 18h30"]);
    }

    #[test]
    fn nothing_is_pending_before_a_workspace_is_open() {
        let session = Session::new(
            Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::default()))),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        session.keep_pending_versions();
        assert!(session.list_versions("a.md").is_err());
    }

    #[test]
    fn a_change_made_outside_keeps_the_text_the_app_knew() {
        let Opened {
            session,
            store,
            watcher,
        } = opened(&[("a.md", "# Connu")]);
        session.watch_workspace(|_| {}).unwrap();
        let note = NotePath::parse("a.md").unwrap();
        store.write(&note, "# Changé par Claude Code").unwrap();
        watcher.announce(WorkspaceChange { notes: vec![note] });
        assert_eq!(
            session.compare_version("a.md", "2026-11-16 18h30").unwrap(),
            [
                difference(DifferenceKind::Removed, "# Changé par Claude Code"),
                difference(DifferenceKind::Added, "# Connu"),
            ]
        );
    }

    #[test]
    fn a_save_from_the_app_announced_by_the_watcher_keeps_no_version() {
        let Opened {
            session, watcher, ..
        } = opened(&[("a.md", "# A")]);
        session.watch_workspace(|_| {}).unwrap();
        let read = session.read_note("a.md").unwrap();
        session
            .save_note("a.md", "# A\nsuite", &read.fingerprint)
            .unwrap();
        watcher.announce(WorkspaceChange {
            notes: vec![NotePath::parse("a.md").unwrap()],
        });
        assert!(ids(&session, "a.md").is_empty());
    }
}
