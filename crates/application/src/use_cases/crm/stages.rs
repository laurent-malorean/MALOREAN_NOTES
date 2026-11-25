//! Les étapes d'un CRM (spécification § 5.5) : les changer touche le CRM et les actions des étapes
//! touchées, tous ensemble ou aucun.

use domain::NotePath;
use domain::crm::action_write::{with_stage_removed, with_stage_renamed};
use domain::crm::{Stages, with_stages};

use super::files::CrmFiles;
use super::gesture::ApplyGesture;
use crate::{AppError, Gesture, GestureStep, NoteStore, PendingGestures};

/// Un changement des étapes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StageChange {
    /// « + Ajouter une étape » : à la fin, juste avant « Done ».
    Add(String),
    /// Renommer une étape : ses actions la suivent, leur rang reste.
    Rename {
        /// Son nom actuel.
        from: String,
        /// Son nouveau nom.
        to: String,
    },
    /// Retirer une étape : ses actions repartent en « TODO », leur rang s'efface.
    Remove(String),
    /// Déplacer une étape à cette place (à partir de 0) dans la liste obtenue.
    Move {
        /// Son nom.
        name: String,
        /// Sa nouvelle place.
        to: usize,
    },
}

/// Changer les étapes d'un CRM.
#[derive(Debug)]
pub struct ChangeStages<'a> {
    store: &'a dyn NoteStore,
    pending: &'a dyn PendingGestures,
}

impl<'a> ChangeStages<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et ses gestes en attente.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, pending: &'a dyn PendingGestures) -> Self {
        Self { store, pending }
    }

    /// Fait ce changement sur les étapes du CRM `crm` et rend les nouvelles. Le CRM et chaque action
    /// touchée sont écrits tous ensemble ; interrompu, le changement est terminé à l'ouverture
    /// suivante.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::CrmStage`] si le nom est refusé
    /// ou l'étape inconnue ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, crm: &NotePath, change: &StageChange) -> Result<Stages, AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let old = files.stages();
        let new = match change {
            StageChange::Add(name) => old.added(name)?,
            StageChange::Rename { from, to } => old.renamed(from, to)?,
            StageChange::Remove(name) => old.removed(name)?,
            StageChange::Move { name, to } => old.moved(name, *to)?,
        };
        let mut steps = vec![GestureStep::Rewrite {
            note: crm.clone(),
            content: with_stages(&files.content, &new),
        }];
        for (action, _) in files.load()?.actions {
            let content = match change {
                StageChange::Rename { from, to } => new.find(to).map_or_else(
                    || action.content.clone(),
                    |stage| with_stage_renamed(&action.content, from, stage),
                ),
                StageChange::Remove(name) => with_stage_removed(&action.content, name),
                StageChange::Add(_) | StageChange::Move { .. } => continue,
            };
            if content != action.content {
                steps.push(GestureStep::Rewrite {
                    note: action.path,
                    content,
                });
            }
        }
        ApplyGesture::new(self.store, self.pending).execute(&Gesture::new(steps))?;
        Ok(new)
    }
}

#[cfg(test)]
#[path = "stages_tests.rs"]
mod tests;
