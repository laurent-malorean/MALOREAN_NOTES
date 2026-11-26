//! Remplacer un texte par un autre dans le texte d'une note (fiche 0075), avec les règles de la
//! saisie : la version d'avant est gardée, le nom du fichier suit le titre (pièces jointes et leurs
//! liens suivis), le stockage met l'index à jour.

use domain::replacing::replaced;
use domain::{ContentType, Fingerprint, NotePath, Title};

use crate::use_cases::{KeepVersion, SaveNote};
use crate::{AppError, Clock, History, NoteStore};

/// Ce qu'a donné un remplacement.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplacedNote {
    /// Le chemin de la note, dont le nom a peut-être changé avec le titre.
    pub path: NotePath,
    /// Le texte de la note après le remplacement.
    pub content: String,
    /// L'empreinte de ce qui vient d'être écrit.
    pub fingerprint: Fingerprint,
    /// Le nombre d'occurrences remplacées.
    pub count: usize,
}

/// Remplace un texte par un autre dans une note simple.
#[derive(Debug)]
pub struct ReplaceInNote<'a> {
    store: &'a dyn NoteStore,
    keeping: KeepVersion<'a>,
    saving: SaveNote<'a>,
}

impl<'a> ReplaceInNote<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert, son historique et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, history: &'a dyn History, clock: &'a dyn Clock) -> Self {
        Self {
            store,
            keeping: KeepVersion::new(store, history, clock),
            saving: SaveNote::new(store, clock),
        }
    }

    /// Dans la note, `old_text` devient `new_text` : à sa seule occurrence, ou, si `replace_all`,
    /// à toutes. Le texte d'avant est d'abord gardé comme version ; rien n'est écrit si le
    /// remplacement est refusé.
    ///
    /// # Errors
    ///
    /// [`AppError::ReplacementRefused`] si la note n'est pas une note simple (cahier de
    /// recherche, carte mentale, canvas, CRM), si le texte à remplacer est vide, absent, égal au
    /// nouveau ou répété sans `replace_all` ; [`AppError::NoteNotFound`] si la note n'existe pas ;
    /// [`AppError::NoteUnreadable`] si elle n'est pas du texte UTF-8 ; [`AppError::NameTaken`] si
    /// le nom tiré du nouveau titre est pris entre-temps ; [`AppError::StorageUnavailable`] si
    /// le stockage ou l'historique ne répond pas.
    pub fn execute(
        &self,
        note: &NotePath,
        old_text: &str,
        new_text: &str,
        replace_all: bool,
    ) -> Result<ReplacedNote, AppError> {
        let current = self.store.read(note)?.content;
        let kind = ContentType::of_file(note.name(), &current);
        let done = replaced(kind, &current, old_text, new_text, replace_all)?;
        self.keeping.keep(note, &current)?;
        // Le fichier ne change de nom que si le remplacement change le titre : un chemin que l'IA
        // vient d'utiliser reste valable tant qu'elle ne touche pas au titre.
        let (path, fingerprint) = if Title::of(&current) == Title::of(&done.content) {
            self.store.write(note, &done.content)?;
            (note.clone(), Fingerprint::of(&done.content))
        } else {
            let saved = self
                .saving
                .execute(note, &done.content, &Fingerprint::of(&current))?;
            (saved.path, saved.fingerprint)
        };
        Ok(ReplacedNote {
            content: self.store.read(&path)?.content,
            path,
            fingerprint,
            count: done.count,
        })
    }
}

#[cfg(test)]
mod tests {
    use domain::Moment;
    use domain::history::Version;
    use domain::replacing::RefusedReplacement;

    use super::*;
    use crate::MemoryHistory;
    use crate::testing::{FixedClock, InMemoryNoteStore};

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn clock() -> FixedClock {
        FixedClock::at(Moment::new(2026, 11, 26, 14, 30).unwrap())
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
        fn replace(
            &self,
            note: &str,
            old: &str,
            new: &str,
            all: bool,
        ) -> Result<ReplacedNote, AppError> {
            ReplaceInNote::new(&self.store, &self.history, &clock()).execute(
                &path(note),
                old,
                new,
                all,
            )
        }

        fn text(&self, note: &str) -> String {
            self.store.read(&path(note)).unwrap().content
        }

        fn versions(&self, note: &str) -> Vec<String> {
            let versions = self.history.versions(&path(note)).unwrap();
            versions
                .iter()
                .map(|v| self.history.read_version(&path(note), v).unwrap())
                .collect()
        }
    }

    #[test]
    fn the_text_is_replaced_and_what_was_written_is_given_back() {
        let workspace = workspace(&[("a.md", "# Pain\n\nLa farine.\n")]);
        let replaced = workspace
            .replace("a.md", "La farine.", "Le levain.", false)
            .unwrap();
        let written = "# Pain\n\nLe levain.\n";
        assert_eq!(workspace.text("a.md"), written);
        assert_eq!(replaced.path, path("a.md"));
        assert_eq!(replaced.content, written);
        assert_eq!(replaced.fingerprint, Fingerprint::of(written));
        assert_eq!(replaced.count, 1);
    }

    #[test]
    fn the_text_before_the_change_is_kept_as_a_version() {
        let workspace = workspace(&[("a.md", "# Pain\nLa farine.")]);
        workspace
            .replace("a.md", "farine", "levure", false)
            .unwrap();
        assert_eq!(workspace.versions("a.md"), ["# Pain\nLa farine."]);
        let versions = workspace.history.versions(&path("a.md")).unwrap();
        assert_eq!(versions, [Version::parse("2026-11-26 14h30").unwrap()]);
    }

    #[test]
    fn a_refused_replacement_writes_and_keeps_nothing() {
        let workspace = workspace(&[("a.md", "# Pain\nun\nun")]);
        for (old, new) in [("deux", "x"), ("un", "x"), ("", "x"), ("un", "un")] {
            assert!(workspace.replace("a.md", old, new, false).is_err());
        }
        assert_eq!(workspace.text("a.md"), "# Pain\nun\nun");
        assert!(workspace.versions("a.md").is_empty());
    }

    #[test]
    fn a_repeated_text_is_refused_unless_all_are_replaced() {
        let workspace = workspace(&[("a.md", "# Pain\nun\nun")]);
        assert_eq!(
            workspace.replace("a.md", "un", "1", false).unwrap_err(),
            AppError::ReplacementRefused(RefusedReplacement::Repeated {
                count: 2,
                lines: vec![2, 3]
            })
        );
        let replaced = workspace.replace("a.md", "un", "1", true).unwrap();
        assert_eq!(replaced.count, 2);
        assert_eq!(workspace.text("a.md"), "# Pain\n1\n1");
    }

    #[test]
    fn the_header_is_kept_as_it_is() {
        let workspace = workspace(&[("a.md", "---\ntags: [x]\npinned: true\n---\n# A\ntexte")]);
        workspace.replace("a.md", "texte", "autre", false).unwrap();
        assert_eq!(
            workspace.text("a.md"),
            "---\ntags: [x]\npinned: true\n---\n# A\nautre"
        );
    }

    #[test]
    fn a_new_title_renames_the_file_and_follows_the_attachment_links() {
        let workspace = workspace(&[("voyage.md", "# Voyage\n![vue](voyage.assets/vue.png)")]);
        let replaced = workspace
            .replace("voyage.md", "# Voyage", "# Lisbonne", false)
            .unwrap();
        assert_eq!(replaced.path, path("lisbonne.md"));
        assert_eq!(
            workspace.text("lisbonne.md"),
            "# Lisbonne\n![vue](lisbonne.assets/vue.png)"
        );
        assert_eq!(replaced.content, workspace.text("lisbonne.md"));
        assert!(workspace.store.read(&path("voyage.md")).is_err());
    }

    #[test]
    fn a_research_notebook_and_other_contents_are_refused() {
        let notebook = "---\ntype: cahier-de-recherche\n---\n# Levures\n";
        let workspace = workspace(&[
            ("c.md", notebook),
            ("m.md", "---\ntype: carte-mentale\n---\n# M\n- un"),
            ("x.canvas", "{}"),
        ]);
        assert_eq!(
            workspace.replace("c.md", "Levures", "Autre", false),
            Err(AppError::ReplacementRefused(RefusedReplacement::NotANote(
                ContentType::ResearchNotebook
            )))
        );
        assert_eq!(workspace.text("c.md"), notebook);
        assert!(workspace.versions("c.md").is_empty());
        assert_eq!(
            workspace.replace("m.md", "un", "deux", false),
            Err(AppError::ReplacementRefused(RefusedReplacement::NotANote(
                ContentType::MindMap
            )))
        );
        assert_eq!(
            workspace.replace("x.canvas", "{}", "[]", false),
            Err(AppError::ReplacementRefused(RefusedReplacement::NotANote(
                ContentType::Canvas
            )))
        );
    }

    #[test]
    fn a_missing_note_is_reported() {
        let workspace = workspace(&[]);
        assert_eq!(
            workspace.replace("a.md", "x", "y", false),
            Err(AppError::NoteNotFound(path("a.md")))
        );
    }
}
