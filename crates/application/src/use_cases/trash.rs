//! La corbeille : y placer une note ou un dossier, voir ce qu'elle contient, restaurer, vider.

use domain::attachments::relink;
use domain::folder::sort_for_display;
use domain::saving::moved_note;
use domain::{FileName, Folder, NotePath, NoteSummary};

use super::crm_fiches::{fiches_of, owns_a_folder, restore_with, taken_with_folders, trash_with};
use crate::{AppError, NoteStore, TrashContents};

/// Ce que montre la corbeille : ses dossiers dans l'ordre de l'arbre, ses notes par chemin.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrashView {
    /// Les dossiers de la corbeille, chacun suivi des siens.
    pub folders: Vec<Folder>,
    /// Les notes de la corbeille, triées par chemin.
    pub notes: Vec<NoteSummary>,
}

/// La corbeille de l'espace de travail ouvert. Rien n'y est supprimé tant qu'on ne la vide pas.
/// Un CRM y va avec ses fiches et en revient avec elles (fiche 0091) ; un agenda 12 de même avec ses
/// événements (fiche 0104).
#[derive(Debug)]
pub struct Trash<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> Trash<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Place la note (et ses pièces jointes) dans la corbeille, à son chemin d'origine ; si une
    /// note supprimée avant elle y est déjà, elle reçoit le premier suffixe libre, et ses liens
    /// vers ses pièces jointes suivent. Un CRM emporte ses fiches : le dossier qui porte son nom
    /// s'il ne contient que des fiches, sinon les fiches seules (une note ordinaire y reste) ; le
    /// dossier des fiches prend le même suffixe que lui. Rend son chemin dans la corbeille.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si elle n'existe pas, [`AppError::NoteUnreadable`] si elle
    /// doit être renommée mais n'est pas du texte UTF-8, [`AppError::StorageUnavailable`] si le
    /// stockage ne répond pas.
    pub fn put_note(&self, note: &NotePath) -> Result<NotePath, AppError> {
        let trashed = self.store.trash()?;
        let fiches = fiches_of(self.store, note)?;
        let mut taken = names_in(&trashed, note.folder());
        if fiches.is_some() {
            taken = taken_with_folders(taken, &trashed.folders, note.folder());
        }
        let at = moved_note(note, note.folder(), &taken);
        if at.name() != note.name() {
            let content = self.store.read(note)?.content;
            self.store
                .write_keeping_date(note, &relink(&content, note.name(), at.name()))?;
        }
        if let Some(fiches) = fiches {
            trash_with(self.store, &fiches, &at)?;
        }
        self.store.trash_note(note, &at)?;
        Ok(at)
    }

    /// Le nombre de fiches qui partent avec la note à la corbeille : celles de son CRM, zéro pour
    /// une note ordinaire.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si elle n'existe pas, [`AppError::StorageUnavailable`] si le
    /// stockage ne répond pas.
    pub fn fiches_with(&self, note: &NotePath) -> Result<usize, AppError> {
        Ok(fiches_of(self.store, note)?.map_or(0, |fiches| fiches.count()))
    }

    /// Place le dossier, avec tout ce qu'il contient, dans la corbeille, à son chemin d'origine ;
    /// s'il y est déjà, il devient `Nom 2`, `Nom 3`… Rend son chemin dans la corbeille.
    ///
    /// # Errors
    ///
    /// [`AppError::RootCannotBeTrashed`] pour l'espace de travail lui-même,
    /// [`AppError::FolderNotFound`] si le dossier n'existe pas,
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn put_folder(&self, folder: &Folder) -> Result<Folder, AppError> {
        if folder.parent().is_none() {
            return Err(AppError::RootCannotBeTrashed);
        }
        let trashed = self.store.trash()?;
        let at = folder
            .clone()
            .deduplicated(|candidate| trashed.folders.contains(candidate));
        self.store.trash_folder(folder, &at)?;
        Ok(at)
    }

    /// Ce que contient la corbeille.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si la corbeille ne peut pas être lue.
    pub fn contents(&self) -> Result<TrashView, AppError> {
        let trashed = self.store.trash()?;
        let mut notes: Vec<NoteSummary> = trashed
            .notes
            .into_iter()
            .map(super::list_notes::summary)
            .collect();
        notes.sort_by(|a, b| a.path().cmp(b.path()));
        Ok(TrashView {
            folders: sort_for_display(trashed.folders),
            notes,
        })
    }

    /// Remet la note `at` de la corbeille à son chemin d'origine, en recréant ses dossiers ;
    /// si le nom y est pris, elle reçoit le premier suffixe libre et ses liens vers ses pièces
    /// jointes suivent. Rend son chemin dans l'espace de travail.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si la corbeille n'a pas cette note,
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn restore_note(&self, at: &NotePath) -> Result<NotePath, AppError> {
        let trashed = self.store.trash()?;
        let content = trashed
            .notes
            .iter()
            .find(|n| &n.path == at)
            .ok_or_else(|| AppError::NoteNotFound(at.clone()))?
            .content
            .clone();
        let existing = if self.has_folder(at.folder())? {
            self.store.names(at.folder())?
        } else {
            Vec::new()
        };
        let to = moved_note(at, at.folder(), &existing);
        self.store.restore_note(at, &to)?;
        if to.name() != at.name() {
            self.store
                .write_keeping_date(&to, &relink(&content, at.name(), to.name()))?;
        }
        if owns_a_folder(&content) {
            restore_with(self.store, &trashed, (at, &to))?;
        }
        Ok(to)
    }

    /// Remet le dossier `at` de la corbeille à son chemin d'origine, avec tout ce qu'il contient.
    /// S'il existe déjà dans l'espace de travail, son contenu y est remis élément par élément ;
    /// les noms pris reçoivent un suffixe libre. La racine de la corbeille remet tout.
    ///
    /// # Errors
    ///
    /// [`AppError::FolderNotFound`] si la corbeille n'a pas ce dossier,
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn restore_folder(&self, at: &Folder) -> Result<Folder, AppError> {
        let trashed = self.store.trash()?;
        let is_root = at.parent().is_none();
        if !is_root && !trashed.folders.contains(at) {
            return Err(AppError::FolderNotFound(at.clone()));
        }
        if !self.has_folder(at)? {
            self.store.restore_folder(at, at)?;
            return Ok(at.clone());
        }
        for child in trashed
            .folders
            .iter()
            .filter(|f| f.parent().as_ref() == Some(at))
        {
            self.restore_folder(child)?;
        }
        for note in trashed.notes.iter().filter(|n| n.path.folder() == at) {
            self.restore_note(&note.path)?;
        }
        // Vidé de son contenu, le dossier de la corbeille n'a plus de raison d'y rester.
        if !is_root && self.store.trash()?.folders.contains(at) {
            self.store.restore_folder(at, at)?;
        }
        Ok(at.clone())
    }

    /// Supprime définitivement tout ce que contient la corbeille.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si la suppression échoue.
    pub fn empty(&self) -> Result<(), AppError> {
        Ok(self.store.empty_trash()?)
    }

    fn has_folder(&self, folder: &Folder) -> Result<bool, AppError> {
        Ok(folder.parent().is_none() || self.store.folders()?.contains(folder))
    }
}

/// Les noms des notes rangées dans ce dossier de la corbeille.
fn names_in(trashed: &TrashContents, folder: &Folder) -> Vec<FileName> {
    trashed
        .notes
        .iter()
        .filter(|n| n.path.folder() == folder)
        .map(|n| n.path.name().clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;

    fn note(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn folder(text: &str) -> Folder {
        Folder::parse(text).unwrap()
    }

    fn workspace() -> InMemoryNoteStore {
        InMemoryNoteStore::with_notes(&[
            (
                "Travail/lundi.md",
                "# Lundi\n![plan](lundi.assets/plan.png)",
            ),
            ("Travail/Réunions/mardi.md", "# Mardi"),
        ])
    }

    fn trashed_paths(trash: &Trash<'_>) -> Vec<String> {
        trash
            .contents()
            .unwrap()
            .notes
            .iter()
            .map(|n| n.path().to_path())
            .collect()
    }

    #[test]
    fn a_trashed_note_keeps_its_original_path() {
        let store = workspace();
        let trash = Trash::new(&store);
        let at = trash.put_note(&note("Travail/lundi.md")).unwrap();
        assert_eq!(at, note("Travail/lundi.md"));
        assert_eq!(trashed_paths(&trash), ["Travail/lundi.md"]);
        assert!(store.read(&note("Travail/lundi.md")).is_err());
    }

    #[test]
    fn two_notes_deleted_from_the_same_path_do_not_overwrite_each_other() {
        let store = workspace();
        let trash = Trash::new(&store);
        trash.put_note(&note("Travail/lundi.md")).unwrap();
        store
            .write(
                &note("Travail/lundi.md"),
                "# Lundi\n![plan](lundi.assets/plan.png)",
            )
            .unwrap();
        let at = trash.put_note(&note("Travail/lundi.md")).unwrap();
        assert_eq!(at, note("Travail/lundi-2.md"));
        assert_eq!(
            trashed_paths(&trash),
            ["Travail/lundi-2.md", "Travail/lundi.md"]
        );
        let second = store.trash().unwrap().notes;
        let renamed = second.iter().find(|n| n.path == at).unwrap();
        assert_eq!(renamed.content, "# Lundi\n![plan](lundi-2.assets/plan.png)");
    }

    #[test]
    fn a_trashed_folder_goes_whole_and_twice_gets_a_number() {
        let store = workspace();
        let trash = Trash::new(&store);
        assert_eq!(
            trash.put_folder(&folder("Travail")).unwrap(),
            folder("Travail")
        );
        store.create_folder(&folder("Travail")).unwrap();
        assert_eq!(
            trash.put_folder(&folder("Travail")).unwrap(),
            folder("Travail 2")
        );
        assert_eq!(
            trash
                .contents()
                .unwrap()
                .folders
                .iter()
                .map(Folder::to_path)
                .collect::<Vec<_>>(),
            ["Travail", "Travail/Réunions", "Travail 2"]
        );
    }

    #[test]
    fn the_workspace_itself_cannot_go_to_the_trash() {
        let store = workspace();
        assert_eq!(
            Trash::new(&store).put_folder(&Folder::root()),
            Err(AppError::RootCannotBeTrashed)
        );
    }

    #[test]
    fn the_trash_lists_note_titles() {
        let store = workspace();
        let trash = Trash::new(&store);
        trash.put_note(&note("Travail/lundi.md")).unwrap();
        assert_eq!(trash.contents().unwrap().notes[0].title(), "Lundi");
    }

    #[test]
    fn a_restored_note_goes_back_even_if_its_folder_was_deleted() {
        let store = workspace();
        let trash = Trash::new(&store);
        trash.put_folder(&folder("Travail")).unwrap();
        let back = trash
            .restore_note(&note("Travail/Réunions/mardi.md"))
            .unwrap();
        assert_eq!(back, note("Travail/Réunions/mardi.md"));
        assert_eq!(store.read(&back).unwrap().content, "# Mardi");
    }

    #[test]
    fn a_restored_note_whose_name_is_taken_gets_a_suffix_and_its_links_follow() {
        let store = workspace();
        let trash = Trash::new(&store);
        trash.put_note(&note("Travail/lundi.md")).unwrap();
        store.write(&note("Travail/lundi.md"), "# Nouveau").unwrap();
        let back = trash.restore_note(&note("Travail/lundi.md")).unwrap();
        assert_eq!(back, note("Travail/lundi-2.md"));
        assert_eq!(
            store.read(&back).unwrap().content,
            "# Lundi\n![plan](lundi-2.assets/plan.png)"
        );
    }

    #[test]
    fn restoring_a_note_missing_from_the_trash_is_reported() {
        let store = workspace();
        assert_eq!(
            Trash::new(&store).restore_note(&note("Travail/absente.md")),
            Err(AppError::NoteNotFound(note("Travail/absente.md")))
        );
    }

    #[test]
    fn a_restored_folder_goes_back_whole() {
        let store = workspace();
        let trash = Trash::new(&store);
        trash.put_folder(&folder("Travail")).unwrap();
        trash.restore_folder(&folder("Travail")).unwrap();
        assert_eq!(
            store
                .read(&note("Travail/Réunions/mardi.md"))
                .unwrap()
                .content,
            "# Mardi"
        );
        assert!(trash.contents().unwrap().folders.is_empty());
    }

    #[test]
    fn a_folder_restored_onto_an_existing_one_is_merged_into_it() {
        let store = workspace();
        let trash = Trash::new(&store);
        trash.put_folder(&folder("Travail")).unwrap();
        store
            .write(&note("Travail/lundi.md"), "# Autre lundi")
            .unwrap();
        trash.restore_folder(&folder("Travail")).unwrap();
        assert_eq!(
            store.read(&note("Travail/lundi.md")).unwrap().content,
            "# Autre lundi"
        );
        assert_eq!(
            store
                .read(&note("Travail/lundi-2.md"))
                .unwrap()
                .content
                .lines()
                .next(),
            Some("# Lundi")
        );
        assert_eq!(
            store
                .read(&note("Travail/Réunions/mardi.md"))
                .unwrap()
                .content,
            "# Mardi"
        );
        let left = trash.contents().unwrap();
        assert!(left.folders.is_empty());
        assert!(left.notes.is_empty());
    }

    #[test]
    fn an_emptied_trashed_folder_whose_place_exists_leaves_the_trash() {
        let store = InMemoryNoteStore::default();
        store.create_folder(&folder("Vide")).unwrap();
        let trash = Trash::new(&store);
        trash.put_folder(&folder("Vide")).unwrap();
        store.create_folder(&folder("Vide")).unwrap();
        trash.restore_folder(&folder("Vide")).unwrap();
        assert!(trash.contents().unwrap().folders.is_empty());
    }

    #[test]
    fn restoring_the_trash_root_restores_everything() {
        let store = workspace();
        let trash = Trash::new(&store);
        trash.put_note(&note("Travail/lundi.md")).unwrap();
        store.write(&note("racine.md"), "# Racine").unwrap();
        trash.put_note(&note("racine.md")).unwrap();
        trash.restore_folder(&Folder::root()).unwrap();
        assert!(store.read(&note("racine.md")).is_ok());
        assert!(store.read(&note("Travail/lundi.md")).is_ok());
        assert!(trash.contents().unwrap().notes.is_empty());
    }

    #[test]
    fn restoring_a_folder_missing_from_the_trash_is_reported() {
        let store = workspace();
        assert_eq!(
            Trash::new(&store).restore_folder(&folder("Absent")),
            Err(AppError::FolderNotFound(folder("Absent")))
        );
    }

    #[test]
    fn emptying_the_trash_deletes_what_it_holds_only() {
        let store = workspace();
        let trash = Trash::new(&store);
        trash.put_note(&note("Travail/lundi.md")).unwrap();
        trash.empty().unwrap();
        assert!(trash.contents().unwrap().notes.is_empty());
        assert!(store.read(&note("Travail/Réunions/mardi.md")).is_ok());
    }
}

#[cfg(test)]
#[path = "trash_crm_tests.rs"]
mod crm_tests;
