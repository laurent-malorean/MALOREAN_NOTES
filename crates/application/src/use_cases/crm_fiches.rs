//! Les fiches d'un CRM suivent son fichier (fiche 0091) : mis à la corbeille, restauré ou déplacé,
//! un CRM emporte avec lui le dossier qui porte son nom. Une seule règle pour ces trois gestes (et
//! pour tout geste futur qui change le nom ou la place du CRM) : ce module la porte, les cas
//! d'usage `Trash` et `MoveNote` l'appellent.

use domain::crm::{CrmFiches, CrmKind, fiches_folder, names_of_folders_in, retargeted};
use domain::saving::moved_note;
use domain::{FileName, Folder, NotePath, NoteSummary};

use crate::{AppError, NoteStore, StoreError, TrashContents};

/// Les fiches du CRM de la note `note` ; rien si `note` n'est pas un CRM ou n'a pas de dossier de
/// fiches.
///
/// # Errors
///
/// [`AppError::NoteNotFound`] si la note n'existe pas, [`AppError::StorageUnavailable`] si le
/// stockage ne répond pas.
pub(super) fn fiches_of(
    store: &dyn NoteStore,
    note: &NotePath,
) -> Result<Option<CrmFiches>, AppError> {
    let content = store.read_indexed(note)?.content;
    if CrmKind::of(&content) != Some(CrmKind::Crm) {
        return Ok(None);
    }
    let Some(folder) = fiches_folder(note) else {
        return Ok(None);
    };
    let folders = store.folders()?;
    if !folders.contains(&folder) {
        return Ok(None);
    }
    let mut notes: Vec<NoteSummary> = Vec::new();
    for inside in folders.iter().filter(|f| f.is_within(&folder)) {
        notes.extend(
            store
                .list(inside)?
                .into_iter()
                .map(super::list_notes::summary),
        );
    }
    Ok(CrmFiches::of(note, &notes))
}

/// Les noms que le CRM ne peut pas prendre dans `folders`, en plus de ceux des notes : celui d'un
/// dossier qui y est déjà, car son dossier des fiches se confondrait avec lui.
pub(super) fn taken_with_folders(
    mut names: Vec<FileName>,
    folders: &[Folder],
    parent: &Folder,
) -> Vec<FileName> {
    names.extend(names_of_folders_in(folders, parent));
    names
}

/// Le chemin où va le dossier des fiches : celui qui porte le nom que prend le CRM.
fn base_of(crm: &NotePath) -> Result<Folder, AppError> {
    fiches_folder(crm).ok_or_else(|| AppError::NoteNotFound(crm.clone()))
}

/// Crée le dossier `folder` et ceux qui manquent au-dessus.
fn ensure_folder(store: &dyn NoteStore, folder: &Folder) -> Result<(), AppError> {
    let existing = store.folders()?;
    let mut missing = Vec::new();
    let mut current = Some(folder.clone());
    while let Some(next) = current.filter(|f| f.parent().is_some() && !existing.contains(f)) {
        current = next.parent();
        missing.push(next);
    }
    for next in missing.iter().rev() {
        store.create_folder(next)?;
    }
    Ok(())
}

/// Déplace les fiches avec le CRM, qui arrive à `to` : le dossier entier s'il ne contient que
/// des fiches, sinon les fiches seules, chacune avec ses pièces jointes.
pub(super) fn move_with(
    store: &dyn NoteStore,
    fiches: &CrmFiches,
    to: &NotePath,
) -> Result<(), AppError> {
    let target = base_of(to)?;
    if fiches.holds_only_fiches() {
        return Ok(store.move_folder(fiches.folder(), &target)?);
    }
    for fiche in fiches.paths() {
        let moved = retargeted(fiche, fiches.folder(), &target);
        ensure_folder(store, moved.folder())?;
        store.move_note(fiche, &moved)?;
    }
    Ok(())
}

/// Met les fiches à la corbeille avec le CRM, qui y arrive à `at` : le dossier entier s'il ne
/// contient que des fiches, sinon les fiches seules.
pub(super) fn trash_with(
    store: &dyn NoteStore,
    fiches: &CrmFiches,
    at: &NotePath,
) -> Result<(), AppError> {
    let target = base_of(at)?;
    if fiches.holds_only_fiches() {
        return Ok(store.trash_folder(fiches.folder(), &target)?);
    }
    for fiche in fiches.paths() {
        store.trash_note(fiche, &retargeted(fiche, fiches.folder(), &target))?;
    }
    Ok(())
}

/// Remet les fiches du CRM `at` de la corbeille avec lui, qui revient à `to` : chacune dans le
/// dossier qui porte le nom de `to` (un nom pris reçoit un suffixe libre), puis les dossiers
/// vides que le CRM avait. Ce qui n'est pas une fiche du CRM reste dans la corbeille.
pub(super) fn restore_with(
    store: &dyn NoteStore,
    trashed: &TrashContents,
    (at, to): (&NotePath, &NotePath),
) -> Result<(), AppError> {
    let (from_base, to_base) = (base_of(at)?, base_of(to)?);
    let summaries: Vec<NoteSummary> = trashed
        .notes
        .iter()
        .filter(|n| n.path.folder().is_within(&from_base))
        .cloned()
        .map(super::list_notes::summary)
        .collect();
    let Some(fiches) = CrmFiches::of(at, &summaries) else {
        return Ok(());
    };
    for fiche in fiches.paths() {
        let wanted = retargeted(fiche, &from_base, &to_base);
        let existing = match store.names(wanted.folder()) {
            Ok(names) => names,
            Err(StoreError::FolderNotFound(_)) => Vec::new(),
            Err(error) => return Err(error.into()),
        };
        store.restore_note(fiche, &moved_note(&wanted, wanted.folder(), &existing))?;
    }
    restore_empty_folders(store, (&from_base, &to_base))
}

/// Remet les dossiers de la corbeille sous `from_base` que plus aucune note n'habite, du plus
/// profond au moins profond.
fn restore_empty_folders(
    store: &dyn NoteStore,
    (from_base, to_base): (&Folder, &Folder),
) -> Result<(), AppError> {
    let trashed = store.trash()?;
    let mut empty: Vec<Folder> = trashed
        .folders
        .iter()
        .filter(|f| f.is_within(from_base))
        .filter(|f| !trashed.notes.iter().any(|n| n.path.folder().is_within(f)))
        .cloned()
        .collect();
    empty.sort_by_key(|f| std::cmp::Reverse(f.names().len()));
    for folder in empty {
        if store.trash()?.folders.contains(&folder) {
            store.restore_folder(&folder, &folder.moved(from_base, to_base))?;
        }
    }
    Ok(())
}
