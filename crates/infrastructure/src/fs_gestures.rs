//! Les gestes en attente sur disque : le dossier caché `.pending-gestures/` à la racine de
//! l'espace de travail, un fichier JSON par geste (`7.json`), que ni la liste, ni l'index, ni la
//! corbeille, ni la surveillance ne voient. Un geste est écrit dans un fichier temporaire puis
//! renommé : jamais de geste à moitié écrit.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use application::{
    Gesture, GestureId, GestureStep, PendingGestures, PendingGesturesOpener, StoreError,
    WorkspaceLocation,
};
use domain::NotePath;
use serde::{Deserialize, Serialize};

/// Le dossier des gestes en attente : caché, il n'est ni listé, ni cherché, ni indexé.
const FOLDER: &str = ".pending-gestures";
const EXTENSION: &str = "json";
const TEMPORARY_EXTENSION: &str = "tmp";

/// Un pas, tel qu'il est écrit dans le fichier du geste.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum StepFile {
    Rewrite { note: String, content: String },
    Trash { note: String },
}

impl From<&GestureStep> for StepFile {
    fn from(step: &GestureStep) -> Self {
        match step {
            GestureStep::Rewrite { note, content } => Self::Rewrite {
                note: note.to_path(),
                content: content.clone(),
            },
            GestureStep::Trash { note } => Self::Trash {
                note: note.to_path(),
            },
        }
    }
}

impl StepFile {
    fn step(self) -> Option<GestureStep> {
        Some(match self {
            Self::Rewrite { note, content } => GestureStep::Rewrite {
                note: NotePath::parse(&note).ok()?,
                content,
            },
            Self::Trash { note } => GestureStep::Trash {
                note: NotePath::parse(&note).ok()?,
            },
        })
    }
}

/// Les gestes en attente d'un espace de travail sur disque.
#[derive(Debug)]
pub struct FsPendingGestures {
    folder: PathBuf,
}

impl FsPendingGestures {
    /// Les gestes en attente de l'espace de travail dont le dossier est `root`.
    #[must_use]
    pub fn new(root: &Path) -> Self {
        Self {
            folder: root.join(FOLDER),
        }
    }

    fn file(&self, id: GestureId) -> PathBuf {
        self.folder.join(format!("{}.{EXTENSION}", id.0))
    }

    /// Les numéros des gestes gardés, du plus petit au plus grand ; un fichier qui n'est pas un geste
    /// (temporaire, étranger) n'en est pas un.
    fn ids(&self) -> Result<Vec<GestureId>, StoreError> {
        let entries = match fs::read_dir(&self.folder) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(unavailable(&error)),
        };
        let mut ids = Vec::new();
        for entry in entries {
            let name = entry.map_err(|e| unavailable(&e))?.file_name();
            let id = name
                .to_str()
                .and_then(|name| name.strip_suffix(&format!(".{EXTENSION}")))
                .and_then(|number| number.parse().ok());
            ids.extend(id.map(GestureId));
        }
        ids.sort_unstable();
        Ok(ids)
    }

    /// Le geste du fichier `id` ; rien s'il est illisible (il est alors retiré, et dit au journal).
    fn read(&self, id: GestureId) -> Result<Option<Gesture>, StoreError> {
        let text = fs::read_to_string(self.file(id)).map_err(|e| unavailable(&e))?;
        let steps: Option<Vec<GestureStep>> = serde_json::from_str::<Vec<StepFile>>(&text)
            .ok()
            .and_then(|steps| steps.into_iter().map(StepFile::step).collect());
        if steps.is_none() {
            tracing::warn!(geste = id.0, "geste en attente illisible : retiré");
            self.end(id)?;
        }
        Ok(steps.map(Gesture::new))
    }
}

impl PendingGestures for FsPendingGestures {
    /// Réserve le premier numéro libre par la création exclusive de son fichier temporaire, y écrit
    /// le geste, puis le renomme.
    fn begin(&self, gesture: &Gesture) -> Result<GestureId, StoreError> {
        fs::create_dir_all(&self.folder).map_err(|e| unavailable(&e))?;
        let steps: Vec<StepFile> = gesture.steps().iter().map(StepFile::from).collect();
        let text = serde_json::to_string(&steps).map_err(|e| unavailable(&e))?;
        let mut next = self.ids()?.last().map_or(1, |last| last.0 + 1);
        loop {
            let id = GestureId(next);
            let temporary = self.file(id).with_extension(TEMPORARY_EXTENSION);
            let created = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary);
            match created {
                Ok(mut file) => {
                    let written = file
                        .write_all(text.as_bytes())
                        .and_then(|()| fs::rename(&temporary, self.file(id)));
                    if let Err(error) = written {
                        if let Err(cleanup) = fs::remove_file(&temporary) {
                            tracing::debug!(%cleanup, "fichier temporaire déjà absent");
                        }
                        return Err(unavailable(&error));
                    }
                    return Ok(id);
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => next += 1,
                Err(error) => return Err(unavailable(&error)),
            }
        }
    }

    fn end(&self, id: GestureId) -> Result<(), StoreError> {
        match fs::remove_file(self.file(id)) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => Err(unavailable(&error)),
            _ => Ok(()),
        }
    }

    fn interrupted(&self) -> Result<Vec<(GestureId, Gesture)>, StoreError> {
        let mut gestures = Vec::new();
        for id in self.ids()? {
            if let Some(gesture) = self.read(id)? {
                gestures.push((id, gesture));
            }
        }
        Ok(gestures)
    }
}

/// Ouvre les gestes en attente de chaque espace de travail, dans son propre dossier.
#[derive(Debug, Default, Clone, Copy)]
pub struct FsPendingGesturesOpener;

impl PendingGesturesOpener for FsPendingGesturesOpener {
    fn open(&self, location: &WorkspaceLocation) -> Result<Arc<dyn PendingGestures>, StoreError> {
        Ok(Arc::new(FsPendingGestures::new(Path::new(
            location.as_str(),
        ))))
    }
}

fn unavailable(error: &impl std::fmt::Display) -> StoreError {
    StoreError::Unavailable(error.to_string())
}
