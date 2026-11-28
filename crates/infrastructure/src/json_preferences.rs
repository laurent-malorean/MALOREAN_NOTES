//! Préférences dans un petit fichier JSON, dans le dossier de configuration de l'application.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use application::{
    Preferences, StoreError, Workspace, WorkspaceLocation, WorkspaceName, Workspaces,
};
use domain::external_servers::ServerName;
use domain::voice_shortcut::VoiceShortcut;
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
    /// Le raccourci de la saisie vocale (fiche 0109), ex. `Ctrl+Maj+E` ; absent tant que c'est
    /// Ctrl+Maj+D. Un raccourci illisible vaut le raccourci par défaut.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    voice_shortcut: Option<String>,
    /// Les bips de la saisie vocale sont voulus (fiche 0109) ; absents tant qu'ils ne le sont pas.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    voice_beeps: bool,
    /// Les noms des serveurs MCP extérieurs permis à Claude dans la colonne Claude Code (fiche
    /// 0105) ; absents tant qu'aucun n'est coché.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    allowed_mcp_servers: Vec<String>,
}

impl Stored {
    fn workspaces(&self) -> Workspaces {
        if self.workspaces.is_empty() {
            return self
                .last_workspace
                .as_ref()
                .map_or_else(Workspaces::default, |folder| {
                    let name = folder_name(folder);
                    let active = WorkspaceName::new(&name).ok();
                    Workspaces::from_saved(
                        workspace(&name, folder.clone()).into_iter().collect(),
                        active,
                    )
                });
        }
        let active = self
            .active
            .as_ref()
            .and_then(|name| WorkspaceName::new(name).ok());
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
            .iter()
            .filter_map(|w| workspace(&w.name, w.folder.clone()))
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
            voice_shortcut: None,
            voice_beeps: false,
            allowed_mcp_servers: Vec::new(),
        }
    }

    /// Les mêmes préférences sous leur forme actuelle : un fichier d'avant les espaces de travail
    /// n'y réécrit pas l'ancienne clé.
    fn rewritten(self) -> Self {
        let workspaces = self.workspaces();
        self.replacing_workspaces(&workspaces)
    }

    /// Les mêmes choix (modèle de sens, saisie vocale, serveurs permis), avec ces
    /// espaces de travail à la place des siens.
    fn replacing_workspaces(self, workspaces: &Workspaces) -> Self {
        Self {
            meaning_model: self.meaning_model,
            voice_language: self.voice_language,
            voice_shortcut: self.voice_shortcut,
            voice_beeps: self.voice_beeps,
            allowed_mcp_servers: self.allowed_mcp_servers,
            ..Self::of(workspaces)
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
        self.save(&kept.replacing_workspaces(workspaces))
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
        let mut kept = self.load()?;
        kept.meaning_model = Some(model.name().to_owned());
        self.save(&kept.rewritten())
    }

    fn voice_language(&self) -> Result<Option<String>, StoreError> {
        Ok(self.load()?.voice_language)
    }

    fn save_voice_language(&self, language: Option<&str>) -> Result<(), StoreError> {
        let mut kept = self.load()?;
        kept.voice_language = language.map(str::to_owned);
        self.save(&kept.rewritten())
    }

    fn voice_shortcut(&self) -> Result<VoiceShortcut, StoreError> {
        Ok(self
            .load()?
            .voice_shortcut
            .and_then(|written| written.parse().ok())
            .unwrap_or_default())
    }

    fn save_voice_shortcut(&self, shortcut: &VoiceShortcut) -> Result<(), StoreError> {
        let mut kept = self.load()?;
        kept.voice_shortcut = (!shortcut.is_default()).then(|| shortcut.to_string());
        self.save(&kept.rewritten())
    }

    fn voice_beeps(&self) -> Result<bool, StoreError> {
        Ok(self.load()?.voice_beeps)
    }

    fn save_voice_beeps(&self, beeps: bool) -> Result<(), StoreError> {
        let mut kept = self.load()?;
        kept.voice_beeps = beeps;
        self.save(&kept.rewritten())
    }

    fn allowed_servers(&self) -> Result<Vec<ServerName>, StoreError> {
        Ok(self
            .load()?
            .allowed_mcp_servers
            .iter()
            .filter_map(|name| ServerName::new(name))
            .collect())
    }

    fn save_allowed_servers(&self, servers: &[ServerName]) -> Result<(), StoreError> {
        let mut kept = self.load()?;
        kept.allowed_mcp_servers = servers
            .iter()
            .map(|name| name.as_str().to_owned())
            .collect();
        self.save(&kept.rewritten())
    }
}

fn unavailable(error: &dyn std::error::Error) -> StoreError {
    StoreError::Unavailable(error.to_string())
}
