//! Préférences en mémoire (voir `preferences_contract`).

use std::sync::{Mutex, PoisonError};

use domain::MeaningModel;

use crate::{Preferences, StoreError, Workspaces};

/// Préférences en mémoire.
#[derive(Debug)]
pub struct FakePreferences {
    workspaces: Mutex<Workspaces>,
    meaning_model: Mutex<MeaningModel>,
    voice_language: Mutex<Option<String>>,
}

impl Default for FakePreferences {
    fn default() -> Self {
        Self {
            workspaces: Mutex::default(),
            meaning_model: Mutex::new(MeaningModel::DEFAULT),
            voice_language: Mutex::new(None),
        }
    }
}

impl Preferences for FakePreferences {
    fn workspaces(&self) -> Result<Workspaces, StoreError> {
        Ok(self
            .workspaces
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone())
    }

    fn save_workspaces(&self, workspaces: &Workspaces) -> Result<(), StoreError> {
        *self
            .workspaces
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = workspaces.clone();
        Ok(())
    }

    fn meaning_model(&self) -> Result<MeaningModel, StoreError> {
        Ok(*self
            .meaning_model
            .lock()
            .unwrap_or_else(PoisonError::into_inner))
    }

    fn save_meaning_model(&self, model: MeaningModel) -> Result<(), StoreError> {
        *self
            .meaning_model
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = model;
        Ok(())
    }

    fn voice_language(&self) -> Result<Option<String>, StoreError> {
        Ok(self
            .voice_language
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone())
    }

    fn save_voice_language(&self, language: Option<&str>) -> Result<(), StoreError> {
        *self
            .voice_language
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = language.map(str::to_owned);
        Ok(())
    }
}
