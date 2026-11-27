//! Renommer un contenu depuis son menu (fiche 0090) : un nouveau titre, et le nom du fichier le suit
//! avec les règles de l'enregistrement. Le titre d'une note, d'une carte mentale, d'un cahier de
//! recherche et d'un CRM est leur titre `#` ; celui d'un canvas est son nom de fichier.

use domain::crm::{CrmFiches, CrmKind, fiches_folder};
use domain::saving::plan_save;
use domain::title::retitled;
use domain::{ContentType, FileName, Fingerprint, NotePath};

use super::crm_fiches::{fiches_of, move_with};
use crate::use_cases::{KeepVersion, SaveNote};
use crate::{AppError, Clock, History, NoteStore};

/// Ce qu'a donné un renommage.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenamedNote {
    /// Le chemin du contenu, dont le nom a suivi le titre.
    pub path: NotePath,
    /// Son texte après le renommage.
    pub content: String,
}

/// Change le titre d'un contenu ; son fichier le suit, sans jamais écraser un autre contenu.
#[derive(Debug)]
pub struct RenameNote<'a> {
    store: &'a dyn NoteStore,
    keeping: KeepVersion<'a>,
    saving: SaveNote<'a>,
}

impl<'a> RenameNote<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert, son historique et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, history: &'a dyn History, clock: &'a dyn Clock) -> Self {
        Self {
            store,
            keeping: KeepVersion::new(store, history, clock),
            saving: SaveNote::new(store, clock),
        }
    }

    /// Le contenu `note` prend ce titre (les blancs superflus sont retirés).
    ///
    /// Une note, une carte mentale, un cahier de recherche ou un CRM : son titre `#` est changé
    /// (le texte d'avant est gardé en version), son fichier prend le nom du titre en kebab-case ;
    /// un CRM emmène avec lui le dossier de ses fiches. Un canvas n'a pas de texte à lui : son
    /// fichier prend le nom du titre. Un titre déjà celui du contenu ne change rien.
    ///
    /// # Errors
    ///
    /// [`AppError::EmptyTitle`] si le titre est vide, [`AppError::TitleTaken`] si le nom de
    /// fichier du titre est déjà pris dans le dossier (ou, pour un CRM, le dossier de ses
    /// fiches), [`AppError::FicheNamedInItsScreen`] pour une fiche de CRM,
    /// [`AppError::NoteNotFound`] si le contenu n'existe pas, [`AppError::NoteUnreadable`] s'il
    /// n'est pas du texte UTF-8, [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, note: &NotePath, title: &str) -> Result<RenamedNote, AppError> {
        let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
        if title.is_empty() {
            return Err(AppError::EmptyTitle);
        }
        let current = self.store.read(note)?.content;
        match ContentType::of_file(note.name(), &current) {
            ContentType::Canvas => self.rename_canvas(note, &title, current),
            kind if kind.crm_kind().is_some_and(|crm| crm != CrmKind::Crm) => {
                Err(AppError::FicheNamedInItsScreen)
            }
            kind => self.rename_text(
                note,
                &title,
                current,
                matches!(kind, ContentType::Crm | ContentType::Agenda12),
            ),
        }
    }

    /// Un canvas : son nom de fichier est son titre.
    fn rename_canvas(
        &self,
        note: &NotePath,
        title: &str,
        content: String,
    ) -> Result<RenamedNote, AppError> {
        let wanted = FileName::canvas_from_title(title);
        if &wanted == note.name() {
            return Ok(unchanged(note, content));
        }
        if self.store.names(note.folder())?.contains(&wanted) {
            return Err(AppError::TitleTaken);
        }
        self.store.rename(note, &wanted)?;
        Ok(RenamedNote {
            path: note.renamed(wanted),
            content,
        })
    }

    /// Un contenu en Markdown : son titre `#` change, l'enregistrement renomme le fichier.
    fn rename_text(
        &self,
        note: &NotePath,
        title: &str,
        current: String,
        owns_a_folder: bool,
    ) -> Result<RenamedNote, AppError> {
        let content = retitled(&current, title);
        if content == current {
            return Ok(unchanged(note, current));
        }
        let existing = self.store.names(note.folder())?;
        let planned = plan_save(note.name(), &content, &existing);
        if planned.file_name() != plan_save(note.name(), &content, &[]).file_name() {
            return Err(AppError::TitleTaken);
        }
        let renamed = note.renamed(planned.file_name().clone());
        let fiches = if owns_a_folder && renamed != *note {
            self.fiches_to_follow(note, &renamed)?
        } else {
            None
        };
        self.keeping.keep(note, &current)?;
        if let Some(fiches) = &fiches {
            move_with(self.store, fiches, &renamed)?;
        }
        let saved = self
            .saving
            .execute(note, &content, &Fingerprint::of(&current));
        match saved {
            Ok(saved) => Ok(RenamedNote {
                content: self.store.read(&saved.path)?.content,
                path: saved.path,
            }),
            Err(error) => {
                if let Some(back) = fiches.and_then(|f| f.relocated(note, &renamed)) {
                    // Les fiches ne restent pas orphelines : le CRM n'a pas changé de nom.
                    move_with(self.store, &back, note).ok();
                }
                Err(error)
            }
        }
    }

    /// Les fiches du CRM (ou les événements de l'agenda 12), qui suivent son nouveau nom (la règle est celle de la corbeille et du
    /// déplacement : `crm_fiches`) ; rien s'il n'a pas encore de fiche.
    fn fiches_to_follow(
        &self,
        crm: &NotePath,
        renamed: &NotePath,
    ) -> Result<Option<CrmFiches>, AppError> {
        let Some(fiches) = fiches_of(self.store, crm)? else {
            return Ok(None);
        };
        let folders = self.store.folders()?;
        if fiches_folder(renamed).is_some_and(|folder| folders.contains(&folder)) {
            return Err(AppError::TitleTaken);
        }
        Ok(Some(fiches))
    }
}

/// Le titre demandé est déjà celui du contenu : rien ne change.
fn unchanged(note: &NotePath, content: String) -> RenamedNote {
    RenamedNote {
        path: note.clone(),
        content,
    }
}

#[cfg(test)]
mod tests {
    use domain::{Folder, Moment};

    use super::*;
    use crate::MemoryHistory;
    use crate::testing::{FixedClock, InMemoryNoteStore};

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn folder(text: &str) -> Folder {
        Folder::parse(text).unwrap()
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
        fn rename(&self, note: &str, title: &str) -> Result<RenamedNote, AppError> {
            let clock = FixedClock::at(Moment::new(2026, 11, 26, 14, 30).unwrap());
            RenameNote::new(&self.store, &self.history, &clock).execute(&path(note), title)
        }

        fn text(&self, note: &str) -> String {
            self.store.read(&path(note)).unwrap().content
        }

        fn exists(&self, note: &str) -> bool {
            self.store.read(&path(note)).is_ok()
        }
    }

    #[test]
    fn a_note_takes_the_new_title_and_the_file_name_follows() {
        let w = workspace(&[("courses.md", "---\npinned: true\n---\n# Courses\n- pain")]);
        let renamed = w.rename("courses.md", "Mon idée du jour").unwrap();
        assert_eq!(renamed.path, path("mon-idee-du-jour.md"));
        assert_eq!(
            renamed.content,
            "---\npinned: true\n---\n# Mon idée du jour\n- pain"
        );
        assert_eq!(w.text("mon-idee-du-jour.md"), renamed.content);
        assert!(!w.exists("courses.md"));
    }

    #[test]
    fn the_title_loses_its_extra_blanks_and_line_breaks() {
        let w = workspace(&[("a.md", "# A")]);
        let renamed = w.rename("a.md", "  Mon \n  titre\t long ").unwrap();
        assert_eq!(renamed.content, "# Mon titre long");
        assert_eq!(renamed.path, path("mon-titre-long.md"));
    }

    #[test]
    fn the_note_keeps_its_folder_and_its_attachment_links_follow() {
        let w = workspace(&[
            ("Perso/voyage.md", "# Voyage\n![vue](voyage.assets/vue.png)"),
            ("Perso/autre.md", "# Autre"),
        ]);
        let renamed = w.rename("Perso/voyage.md", "Lisbonne").unwrap();
        assert_eq!(renamed.path, path("Perso/lisbonne.md"));
        assert_eq!(
            renamed.content,
            "# Lisbonne\n![vue](lisbonne.assets/vue.png)"
        );
    }

    #[test]
    fn a_note_without_title_gets_one_on_top_of_its_text() {
        let w = workspace(&[("import.md", "du texte")]);
        let renamed = w.rename("import.md", "Importée").unwrap();
        assert_eq!(renamed.content, "# Importée\ndu texte");
        assert_eq!(renamed.path, path("importee.md"));
    }

    #[test]
    fn the_text_before_the_change_is_kept_as_a_version() {
        let w = workspace(&[("a.md", "# Alpha")]);
        w.rename("a.md", "Bêta").unwrap();
        let versions = w.history.versions(&path("a.md")).unwrap();
        assert_eq!(versions.len(), 1);
        assert_eq!(
            w.history.read_version(&path("a.md"), &versions[0]).unwrap(),
            "# Alpha"
        );
    }

    #[test]
    fn an_empty_title_is_refused_and_nothing_changes() {
        let w = workspace(&[("a.md", "# Alpha")]);
        assert_eq!(w.rename("a.md", " \n ").unwrap_err(), AppError::EmptyTitle);
        assert_eq!(w.text("a.md"), "# Alpha");
    }

    #[test]
    fn a_title_whose_file_name_is_taken_is_refused_and_nothing_changes() {
        let w = workspace(&[("a.md", "# Alpha"), ("idee.md", "# Idée")]);
        assert_eq!(w.rename("a.md", "IDÉE").unwrap_err(), AppError::TitleTaken);
        assert_eq!(w.text("a.md"), "# Alpha");
        assert_eq!(w.text("idee.md"), "# Idée");
    }

    #[test]
    fn a_name_taken_in_another_folder_does_not_count() {
        let w = workspace(&[("a.md", "# Alpha"), ("Perso/idee.md", "# Idée")]);
        assert_eq!(w.rename("a.md", "Idée").unwrap().path, path("idee.md"));
    }

    #[test]
    fn the_same_title_changes_nothing_and_keeps_no_version() {
        let w = workspace(&[("a.md", "# Alpha\ntexte")]);
        let renamed = w.rename("a.md", "Alpha").unwrap();
        assert_eq!(renamed.path, path("a.md"));
        assert_eq!(renamed.content, "# Alpha\ntexte");
        assert!(w.history.versions(&path("a.md")).unwrap().is_empty());
    }

    #[test]
    fn only_the_capitals_of_the_title_can_change_with_the_same_file_name() {
        let w = workspace(&[("alpha.md", "# alpha")]);
        let renamed = w.rename("alpha.md", "Alpha").unwrap();
        assert_eq!(renamed.path, path("alpha.md"));
        assert_eq!(w.text("alpha.md"), "# Alpha");
    }

    #[test]
    fn an_unknown_content_is_refused() {
        let w = workspace(&[("a.md", "# A")]);
        assert!(matches!(
            w.rename("b.md", "Neuf").unwrap_err(),
            AppError::NoteNotFound(_)
        ));
    }

    #[test]
    fn a_mind_map_and_a_research_notebook_keep_their_header() {
        let w = workspace(&[
            (
                "carte.md",
                "---\ntype: carte-mentale\n---\n# Carte\n\n- idée\n",
            ),
            (
                "cahier.md",
                "---\ntype: cahier-de-recherche\n---\n# Cahier\n",
            ),
        ]);
        let map = w.rename("carte.md", "Ma carte").unwrap();
        assert_eq!(map.path, path("ma-carte.md"));
        assert_eq!(
            map.content,
            "---\ntype: carte-mentale\n---\n# Ma carte\n\n- idée\n"
        );
        let notebook = w.rename("cahier.md", "Mon cahier").unwrap();
        assert_eq!(notebook.path, path("mon-cahier.md"));
        assert_eq!(
            notebook.content,
            "---\ntype: cahier-de-recherche\n---\n# Mon cahier\n"
        );
    }

    #[test]
    fn a_canvas_takes_its_file_name_from_the_title_and_keeps_its_content() {
        let w = workspace(&[("plan.canvas", "{\"nodes\":[],\"edges\":[]}")]);
        let renamed = w.rename("plan.canvas", "Mon plan").unwrap();
        assert_eq!(renamed.path, path("mon-plan.canvas"));
        assert_eq!(renamed.content, "{\"nodes\":[],\"edges\":[]}");
        assert_eq!(w.text("mon-plan.canvas"), "{\"nodes\":[],\"edges\":[]}");
        assert!(!w.exists("plan.canvas"));
    }

    #[test]
    fn a_canvas_refuses_a_taken_name_and_keeps_its_own_name_for_the_same_title() {
        let w = workspace(&[("a.canvas", "{}"), ("b.canvas", "{}")]);
        assert_eq!(w.rename("a.canvas", "B").unwrap_err(), AppError::TitleTaken);
        assert!(w.exists("a.canvas"));
        assert_eq!(w.rename("a.canvas", "A").unwrap().path, path("a.canvas"));
        assert_eq!(w.rename("a.canvas", "").unwrap_err(), AppError::EmptyTitle);
    }

    #[test]
    fn a_note_and_a_canvas_with_the_same_stem_do_not_collide() {
        let w = workspace(&[("a.canvas", "{}"), ("plan.md", "# Plan")]);
        assert_eq!(
            w.rename("a.canvas", "Plan").unwrap().path,
            path("plan.canvas")
        );
    }

    fn crm_workspace() -> Workspace {
        workspace(&[
            ("toto/clients.md", "---\ntype: crm\n---\n# Clients\n"),
            (
                "toto/clients/entreprises/acme.md",
                "---\ntype: crm-entreprise\n---\n# Acme\n",
            ),
            (
                "toto/clients/actions/2026-11-10-devis.md",
                "---\ntype: crm-action\ndate: '2026-11-10'\n---\n# Devis\n",
            ),
        ])
    }

    #[test]
    fn a_crm_takes_its_fiches_folder_with_it() {
        let w = crm_workspace();
        let renamed = w.rename("toto/clients.md", "Prospects").unwrap();
        assert_eq!(renamed.path, path("toto/prospects.md"));
        assert_eq!(renamed.content, "---\ntype: crm\n---\n# Prospects\n");
        assert!(w.exists("toto/prospects/entreprises/acme.md"));
        assert!(w.exists("toto/prospects/actions/2026-11-10-devis.md"));
        assert!(!w.exists("toto/clients/entreprises/acme.md"));
        assert!(!w.store.folders().unwrap().contains(&folder("toto/clients")));
    }

    #[test]
    fn an_ordinary_note_in_the_fiches_folder_stays_where_it_was() {
        let w = crm_workspace();
        w.store
            .write(&path("toto/clients/ma-note.md"), "# Ma note")
            .unwrap();
        w.rename("toto/clients.md", "Prospects").unwrap();
        assert!(w.exists("toto/prospects/entreprises/acme.md"));
        assert!(w.exists("toto/clients/ma-note.md"));
        assert!(!w.exists("toto/clients/entreprises/acme.md"));
    }

    #[test]
    fn a_crm_whose_title_changes_only_in_capitals_keeps_its_file_and_its_fiches() {
        let w = crm_workspace();
        let renamed = w.rename("toto/clients.md", "CLIENTS").unwrap();
        assert_eq!(renamed.path, path("toto/clients.md"));
        assert_eq!(renamed.content, "---\ntype: crm\n---\n# CLIENTS\n");
        assert!(w.exists("toto/clients/entreprises/acme.md"));
        assert!(w.exists("toto/clients/actions/2026-11-10-devis.md"));
    }

    #[test]
    fn a_crm_without_fiche_is_renamed_alone() {
        let w = workspace(&[("clients.md", "---\ntype: crm\n---\n# Clients\n")]);
        assert_eq!(
            w.rename("clients.md", "Prospects").unwrap().path,
            path("prospects.md")
        );
    }

    #[test]
    fn a_crm_whose_new_fiches_folder_exists_is_refused_and_nothing_changes() {
        let w = crm_workspace();
        w.store.create_folder(&folder("toto/prospects")).unwrap();
        assert_eq!(
            w.rename("toto/clients.md", "Prospects").unwrap_err(),
            AppError::TitleTaken
        );
        assert_eq!(
            w.text("toto/clients.md"),
            "---\ntype: crm\n---\n# Clients\n"
        );
        assert!(w.exists("toto/clients/entreprises/acme.md"));
    }

    #[test]
    fn a_crm_whose_file_name_is_taken_is_refused() {
        let w = crm_workspace();
        w.store
            .write(&path("toto/prospects.md"), "# Prospects")
            .unwrap();
        assert_eq!(
            w.rename("toto/clients.md", "Prospects").unwrap_err(),
            AppError::TitleTaken
        );
        assert!(w.exists("toto/clients/entreprises/acme.md"));
    }

    #[test]
    fn a_fiche_is_refused_whatever_its_kind() {
        let w = workspace(&[
            (
                "c/entreprises/a.md",
                "---\ntype: crm-entreprise\n---\n# A\n",
            ),
            ("c/personnes/p.md", "---\ntype: crm-personne\n---\n# P\n"),
            ("c/actions/x.md", "---\ntype: crm-action\n---\n# X\n"),
            ("c/projets/r.md", "---\ntype: crm-projet\n---\n# R\n"),
        ]);
        for fiche in [
            "c/entreprises/a.md",
            "c/personnes/p.md",
            "c/actions/x.md",
            "c/projets/r.md",
        ] {
            assert_eq!(
                w.rename(fiche, "Autre").unwrap_err(),
                AppError::FicheNamedInItsScreen
            );
        }
        assert_eq!(
            w.text("c/actions/x.md"),
            "---\ntype: crm-action\n---\n# X\n"
        );
    }
}
