//! Enregistrer une note ; son nom de fichier suit son titre, et rien n'est écrasé sans être gardé.

use domain::conflict::conflict_copy_name;
use domain::saving::plan_save;
use domain::tag::tags;
use domain::{Fingerprint, NotePath};

use crate::{AppError, Clock, NoteStore, StoreError};

/// Ce qu'a donné un enregistrement.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SaveOutcome {
    /// Le chemin de la note, dont le nom a peut-être changé avec le titre.
    pub path: NotePath,
    /// L'empreinte de ce qui vient d'être écrit : à renvoyer au prochain enregistrement.
    pub fingerprint: Fingerprint,
    /// La copie de conflit qui garde la version trouvée sur le disque, si elle avait
    /// changé hors de l'application depuis la dernière lecture.
    pub conflict_copy: Option<NotePath>,
    /// Les étiquettes écrites ne sont plus celles de la note sur le disque (ou d'une note
    /// absente) : la liste des étiquettes est à relire.
    pub tags_changed: bool,
}

/// Enregistre une note ; si son titre a changé, le fichier (et ses pièces jointes) est renommé.
///
/// Si le fichier a changé hors de l'application depuis que l'interface l'a lu (son empreinte
/// n'est plus celle que l'interface connaît), cette version est d'abord gardée dans une copie
/// de conflit, à côté : le texte de l'utilisateur est enregistré, et rien n'est perdu.
/// Une note supprimée hors de l'application est recréée.
#[derive(Debug)]
pub struct SaveNote<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> SaveNote<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// Enregistre `content` dans la note `current`, que l'interface a lue ou écrite avec
    /// l'empreinte `known` ; la note reste dans son dossier.
    ///
    /// # Errors
    ///
    /// [`AppError::NameTaken`] si le nouveau nom est pris entre-temps,
    /// [`AppError::NoteUnreadable`] si le fichier n'est plus du texte UTF-8,
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(
        &self,
        current: &NotePath,
        content: &str,
        known: &Fingerprint,
    ) -> Result<SaveOutcome, AppError> {
        let on_disk = self.on_disk(current)?;
        let conflict_copy =
            self.keep_changed_version(current, on_disk.as_deref(), content, known)?;
        let existing = self.store.names(current.folder())?;
        let plan = plan_save(current.name(), content, &existing);
        self.store.write(current, plan.content())?;
        if plan.file_name() != current.name() {
            self.store.rename(current, plan.file_name())?;
        }
        Ok(SaveOutcome {
            path: current.renamed(plan.file_name().clone()),
            fingerprint: Fingerprint::of(plan.content()),
            conflict_copy,
            tags_changed: tags(on_disk.as_deref().unwrap_or_default()) != tags(content),
        })
    }

    /// Le contenu de la note sur le disque, ou rien si elle n'existe plus.
    fn on_disk(&self, current: &NotePath) -> Result<Option<String>, AppError> {
        match self.store.read(current) {
            Ok(note) => Ok(Some(note.content)),
            Err(StoreError::NotFound(_)) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    /// Garde la version du disque dans une copie de conflit si elle a changé ailleurs
    /// et diffère de ce qu'on va écrire.
    fn keep_changed_version(
        &self,
        current: &NotePath,
        on_disk: Option<&str>,
        content: &str,
        known: &Fingerprint,
    ) -> Result<Option<NotePath>, AppError> {
        let Some(on_disk) = on_disk else {
            return Ok(None);
        };
        if Fingerprint::of(on_disk) == *known || on_disk == content {
            return Ok(None);
        }
        let existing = self.store.names(current.folder())?;
        let copy = current.renamed(conflict_copy_name(
            current.name(),
            &self.clock.now(),
            &existing,
        ));
        self.store.write(&copy, on_disk)?;
        Ok(Some(copy))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{FixedClock, InMemoryNoteStore};

    fn name(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    /// Enregistre `content` dans `path`, comme l'interface quand elle a lu la note telle qu'elle est.
    fn save(store: &InMemoryNoteStore, path: &str, content: &str) -> NotePath {
        let known = Fingerprint::of(&store.read(&name(path)).unwrap().content);
        save_knowing(store, path, content, &known).path
    }

    fn save_knowing(
        store: &InMemoryNoteStore,
        path: &str,
        content: &str,
        known: &Fingerprint,
    ) -> SaveOutcome {
        SaveNote::new(store, &FixedClock::default())
            .execute(&name(path), content, known)
            .unwrap()
    }

    #[test]
    fn content_is_saved_under_the_same_name_when_title_matches() {
        let store = InMemoryNoteStore::with_notes(&[("courses.md", "# Courses")]);
        let saved = save(&store, "courses.md", "# Courses\n- pain");
        assert_eq!(saved, name("courses.md"));
        assert_eq!(store.read(&saved).unwrap().content, "# Courses\n- pain");
    }

    #[test]
    fn changing_the_title_renames_the_file_in_kebab_case() {
        let store = InMemoryNoteStore::with_notes(&[("ancien-nom.md", "# Ancien")]);
        let saved = save(&store, "ancien-nom.md", "# Mon idée");
        assert_eq!(saved, name("mon-idee.md"));
        assert_eq!(
            store.names(&domain::Folder::root()).unwrap(),
            [domain::FileName::parse("mon-idee.md").unwrap()]
        );
        assert_eq!(store.read(&saved).unwrap().content, "# Mon idée");
    }

    #[test]
    fn taken_name_gets_a_numbered_suffix() {
        let store = InMemoryNoteStore::with_notes(&[("idee.md", "# Idée"), ("brouillon.md", "")]);
        let saved = save(&store, "brouillon.md", "# Idée");
        assert_eq!(saved, name("idee-2.md"));
        assert_eq!(store.read(&name("idee.md")).unwrap().content, "# Idée");
    }

    #[test]
    fn note_already_holding_its_numbered_name_keeps_it() {
        let store =
            InMemoryNoteStore::with_notes(&[("idee.md", "# Idée"), ("idee-2.md", "# Idée")]);
        let saved = save(&store, "idee-2.md", "# Idée\nsuite");
        assert_eq!(saved, name("idee-2.md"));
    }

    #[test]
    fn attachment_links_follow_the_renamed_note() {
        let store = InMemoryNoteStore::with_notes(&[("voyage.md", "# Voyage")]);
        let content = "# Lisbonne\n![vue](voyage.assets/vue.png)";
        let saved = save(&store, "voyage.md", content);
        assert_eq!(saved, name("lisbonne.md"));
        assert_eq!(
            store.read(&saved).unwrap().content,
            "# Lisbonne\n![vue](lisbonne.assets/vue.png)"
        );
    }

    #[test]
    fn removing_the_title_keeps_the_file_name() {
        let store = InMemoryNoteStore::with_notes(&[("courses.md", "# Courses")]);
        let saved = save(&store, "courses.md", "plus de titre");
        assert_eq!(saved, name("courses.md"));
    }

    #[test]
    fn the_fingerprint_of_what_was_written_is_given_back() {
        let store = InMemoryNoteStore::with_notes(&[("voyage.md", "# Voyage")]);
        let known = Fingerprint::of("# Voyage");
        let outcome = save_knowing(
            &store,
            "voyage.md",
            "# Lisbonne\n![](voyage.assets/a.png)",
            &known,
        );
        let written = store.read(&outcome.path).unwrap().content;
        assert_eq!(outcome.fingerprint, Fingerprint::of(&written));
        assert_eq!(outcome.conflict_copy, None);
    }

    #[test]
    fn the_outcome_says_whether_the_tags_changed() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "---\ntags: [x]\n---\n# A")]);
        let known = Fingerprint::of("---\ntags: [x]\n---\n# A");
        let same = save_knowing(&store, "a.md", "---\ntags: [x]\n---\n# A\ntexte", &known);
        assert!(!same.tags_changed);
        let changed = save_knowing(
            &store,
            "a.md",
            "---\ntags: [y]\n---\n# A",
            &same.fingerprint,
        );
        assert!(changed.tags_changed);
    }

    #[test]
    fn a_recreated_note_has_changed_tags_only_if_it_has_some() {
        let store = InMemoryNoteStore::with_notes(&[]);
        let known = Fingerprint::of("");
        assert!(!save_knowing(&store, "a.md", "# A", &known).tags_changed);
        let store = InMemoryNoteStore::with_notes(&[]);
        assert!(save_knowing(&store, "a.md", "---\ntags: [x]\n---\n# A", &known).tags_changed);
    }

    #[test]
    fn a_version_changed_elsewhere_is_kept_in_a_conflict_copy() {
        let store = InMemoryNoteStore::with_notes(&[("courses.md", "# Courses\n- lait")]);
        let known = Fingerprint::of("# Courses");
        let outcome = save_knowing(&store, "courses.md", "# Courses\n- pain", &known);
        let copy = name("courses (conflit 2026-11-16 18h30).md");
        assert_eq!(outcome.conflict_copy, Some(copy.clone()));
        assert_eq!(store.read(&copy).unwrap().content, "# Courses\n- lait");
        assert_eq!(
            store.read(&name("courses.md")).unwrap().content,
            "# Courses\n- pain"
        );
    }

    #[test]
    fn the_conflict_copy_stays_in_the_note_folder() {
        let store = InMemoryNoteStore::with_notes(&[]);
        store
            .create_folder(&domain::Folder::parse("Travail").unwrap())
            .unwrap();
        store
            .write(&name("Travail/lundi.md"), "# Lundi\nailleurs")
            .unwrap();
        let outcome = save_knowing(
            &store,
            "Travail/lundi.md",
            "# Lundi\nici",
            &Fingerprint::of("# Lundi"),
        );
        assert_eq!(
            outcome.conflict_copy,
            Some(name("Travail/lundi (conflit 2026-11-16 18h30).md"))
        );
    }

    #[test]
    fn no_copy_when_the_disk_already_holds_the_same_text() {
        let store = InMemoryNoteStore::with_notes(&[("courses.md", "# Courses\n- pain")]);
        let outcome = save_knowing(
            &store,
            "courses.md",
            "# Courses\n- pain",
            &Fingerprint::of("# Courses"),
        );
        assert_eq!(outcome.conflict_copy, None);
        assert_eq!(store.names(&domain::Folder::root()).unwrap().len(), 1);
    }

    #[test]
    fn a_note_deleted_elsewhere_is_created_again() {
        let store = InMemoryNoteStore::with_notes(&[]);
        let outcome = save_knowing(
            &store,
            "courses.md",
            "# Courses",
            &Fingerprint::of("# Courses"),
        );
        assert_eq!(outcome.conflict_copy, None);
        assert_eq!(
            store.read(&name("courses.md")).unwrap().content,
            "# Courses"
        );
    }
}
