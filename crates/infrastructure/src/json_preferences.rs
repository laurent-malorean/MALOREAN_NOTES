//! Préférences dans un petit fichier JSON, dans le dossier de configuration de l'application.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use application::{
    Preferences, StoreError, Workspace, WorkspaceLocation, WorkspaceName, Workspaces,
};
use domain::{Folder, MeaningModel, NotePath};
use serde::{Deserialize, Serialize};

/// Un espace de travail tel qu'il est écrit dans le fichier.
#[derive(Serialize, Deserialize)]
struct StoredWorkspace {
    name: String,
    folder: String,
    /// Autorisé pour les IA (fiche 0074) ; absent tant qu'il ne l'est pas.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    allowed: bool,
    /// Son dossier des modèles (fiche 0077) ; absent tant qu'il n'en a pas. Un dossier invalide
    /// est oublié à la lecture.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    templates: Option<String>,
    /// Sa note des favoris (fiche 0102), par son chemin ; absente tant qu'il n'en a pas. Un chemin
    /// invalide est oublié à la lecture.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    favorites: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct Stored {
    /// Le seul dossier gardé avant les espaces de travail (`last_library` avant encore) : il
    /// devient le premier espace de travail, nommé d'après lui. Lu, jamais réécrit.
    #[serde(alias = "last_library", skip_serializing)]
    last_workspace: Option<String>,
    #[serde(default)]
    workspaces: Vec<StoredWorkspace>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    active: Option<String>,
    /// Le nom du modèle de sens choisi ; un nom inconnu vaut le modèle par défaut.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    meaning_model: Option<String>,
    /// La langue de la saisie vocale (fiche 0103), ex. `fr-FR` ; absente tant qu'on suit la langue
    /// du Mac.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    voice_language: Option<String>,
}

impl Stored {
    fn workspaces(self) -> Workspaces {
        if self.workspaces.is_empty() {
            return self
                .last_workspace
                .map_or_else(Workspaces::default, |folder| {
                    let name = folder_name(&folder);
                    let active = WorkspaceName::new(&name).ok();
                    Workspaces::from_saved(workspace(&name, folder).into_iter().collect(), active)
                });
        }
        let active = self.active.and_then(|name| WorkspaceName::new(&name).ok());
        let allowed: Vec<WorkspaceName> = self
            .workspaces
            .iter()
            .filter(|w| w.allowed)
            .filter_map(|w| WorkspaceName::new(&w.name).ok())
            .collect();
        let templates: Vec<(WorkspaceName, Folder)> = self
            .workspaces
            .iter()
            .filter_map(|w| {
                let folder = Folder::parse(w.templates.as_deref()?).ok()?;
                Some((WorkspaceName::new(&w.name).ok()?, folder))
            })
            .collect();
        let favorites: Vec<(WorkspaceName, NotePath)> = self
            .workspaces
            .iter()
            .filter_map(|w| {
                let note = NotePath::parse(w.favorites.as_deref()?).ok()?;
                Some((WorkspaceName::new(&w.name).ok()?, note))
            })
            .collect();
        let list = self
            .workspaces
            .into_iter()
            .filter_map(|w| workspace(&w.name, w.folder))
            .collect();
        Workspaces::from_saved(list, active)
            .with_allowed(&allowed)
            .with_templates_folders(&templates)
            .with_favorites_notes(&favorites)
    }

    fn of(workspaces: &Workspaces) -> Self {
        Self {
            last_workspace: None,
            workspaces: workspaces
                .list()
                .iter()
                .map(|w| StoredWorkspace {
                    name: w.name.as_str().to_owned(),
                    folder: w.location.as_str().to_owned(),
                    allowed: workspaces.is_allowed(&w.name),
                    templates: workspaces.templates_folder(&w.name).map(Folder::to_path),
                    favorites: workspaces.favorites_note(&w.name).map(NotePath::to_path),
                })
                .collect(),
            active: workspaces.active().map(|w| w.name.as_str().to_owned()),
            meaning_model: None,
            voice_language: None,
        }
    }
}

/// Un espace de travail lu dans le fichier ; rien si son nom ou son dossier est vide.
fn workspace(name: &str, folder: String) -> Option<Workspace> {
    Some(Workspace {
        name: WorkspaceName::new(name).ok()?,
        location: WorkspaceLocation::new(folder).ok()?,
    })
}

/// Le nom du dossier, dernier élément de son emplacement.
fn folder_name(folder: &str) -> String {
    Path::new(folder)
        .file_name()
        .map_or_else(|| folder.to_owned(), |n| n.to_string_lossy().into_owned())
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
    fn workspaces(&self) -> Result<Workspaces, StoreError> {
        Ok(self.load()?.workspaces())
    }

    fn save_workspaces(&self, workspaces: &Workspaces) -> Result<(), StoreError> {
        let kept = self.load()?;
        self.save(&Stored {
            meaning_model: kept.meaning_model,
            voice_language: kept.voice_language,
            ..Stored::of(workspaces)
        })
    }

    fn meaning_model(&self) -> Result<MeaningModel, StoreError> {
        Ok(self
            .load()?
            .meaning_model
            .and_then(|name| MeaningModel::from_name(&name))
            .unwrap_or(MeaningModel::DEFAULT))
    }

    fn save_meaning_model(&self, model: MeaningModel) -> Result<(), StoreError> {
        // Un fichier d'avant les espaces de travail les garde sous sa forme actuelle : on ne
        // réécrit pas l'ancienne clé.
        let kept = self.load()?;
        let voice_language = kept.voice_language.clone();
        self.save(&Stored {
            meaning_model: Some(model.name().to_owned()),
            voice_language,
            ..Stored::of(&kept.workspaces())
        })
    }

    fn voice_language(&self) -> Result<Option<String>, StoreError> {
        Ok(self.load()?.voice_language)
    }

    fn save_voice_language(&self, language: Option<&str>) -> Result<(), StoreError> {
        let kept = self.load()?;
        let meaning_model = kept.meaning_model.clone();
        self.save(&Stored {
            meaning_model,
            voice_language: language.map(str::to_owned),
            ..Stored::of(&kept.workspaces())
        })
    }
}

fn unavailable(error: &dyn std::error::Error) -> StoreError {
    StoreError::Unavailable(error.to_string())
}
