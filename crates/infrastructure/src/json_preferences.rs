//! Préférences dans un petit fichier JSON, dans le dossier de configuration de l'application.

use std::fs;
use std::io;
use std::path::PathBuf;

use application::{LibraryLocation, Preferences, StoreError};
use serde::{Deserialize, Serialize};

#[derive(Default, Serialize, Deserialize)]
struct Stored {
    last_library: Option<String>,
}

/// Préférences gardées dans un fichier JSON.
#[derive(Debug)]
pub struct JsonPreferences {
    file: PathBuf,
}

impl JsonPreferences {
    /// Des préférences gardées dans `file`, créé au premier enregistrement.
    #[must_use]
    pub fn new(file: PathBuf) -> Self {
        Self { file }
    }

    fn load(&self) -> Result<Stored, StoreError> {
        match fs::read_to_string(&self.file) {
            // Des préférences abîmées ne doivent pas empêcher le lancement : on repart de zéro.
            Ok(text) => Ok(serde_json::from_str(&text).unwrap_or_else(|error| {
                tracing::warn!(%error, "préférences illisibles, ignorées");
                Stored::default()
            })),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Stored::default()),
            Err(error) => Err(unavailable(&error)),
        }
    }

    fn save(&self, stored: &Stored) -> Result<(), StoreError> {
        if let Some(parent) = self.file.parent() {
            fs::create_dir_all(parent).map_err(|e| unavailable(&e))?;
        }
        let text = serde_json::to_string_pretty(stored).map_err(|e| unavailable(&e))?;
        let temporary = self.file.with_extension("json.enregistrement");
        fs::write(&temporary, text)
            .and_then(|()| fs::rename(&temporary, &self.file))
            .map_err(|e| unavailable(&e))
    }
}

impl Preferences for JsonPreferences {
    fn last_library(&self) -> Result<Option<LibraryLocation>, StoreError> {
        // Un emplacement vide gardé par erreur vaut « aucune bibliothèque ».
        Ok(self
            .load()?
            .last_library
            .and_then(|l| LibraryLocation::new(l).ok()))
    }

    fn remember_library(&self, location: &LibraryLocation) -> Result<(), StoreError> {
        let mut stored = self.load()?;
        stored.last_library = Some(location.as_str().to_owned());
        self.save(&stored)
    }
}

fn unavailable(error: &dyn std::error::Error) -> StoreError {
    StoreError::Unavailable(error.to_string())
}
