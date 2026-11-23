//! Les modèles de sens rangés sur le Mac : `<dossier de support>/models/<nom du modèle>/`
//! (jamais dans iCloud), téléchargés une fois depuis Hugging Face (fiche 0042). Chaque fichier
//! est écrit dans un fichier temporaire, vérifié (taille et somme SHA-256), puis renommé : un
//! fichier qui porte son vrai nom est entier et vérifié, jamais à moitié écrit.

use std::fs::{self, File};
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use application::{
    DownloadProgress, Embedder, MeaningError, MeaningModels, ModelState, ProgressListener,
};
use domain::{MeaningModel, ModelFileInfo};
use reqwest::blocking::Client;
use sha2::{Digest, Sha256};

use crate::candle_embedder::CandleEmbedder;

/// L'adresse de base des modèles : celle de `MeaningModel::download_url`.
const HUGGING_FACE: &str = "https://huggingface.co";

/// Le nombre d'octets lus d'un coup (et donc l'écart entre deux annonces d'avancement).
const CHUNK: usize = 262_144;

/// Le temps au bout duquel un téléchargement est abandonné, même lent (le client bloquant ne sait
/// pas mesurer le silence entre deux octets) : 2,2 Go à 1 Mb/s tiennent dedans.
const DURATION_LIMIT: Duration = Duration::from_secs(21_600);

/// Le temps laissé pour joindre le serveur.
const CONNECTION: Duration = Duration::from_secs(30);

/// D'où viennent les fichiers, quand ce n'est pas Hugging Face (les tests).
#[derive(Debug, Clone)]
struct Source {
    base: String,
    files: &'static [ModelFileInfo],
}

/// Les modèles de sens d'un dossier de support : état, téléchargement, suppression, ouverture.
#[derive(Debug, Clone)]
pub struct ModelFolder {
    root: PathBuf,
    source: Option<Source>,
}

impl ModelFolder {
    /// Les modèles rangés sous `support_dir/models/`, téléchargés depuis Hugging Face.
    #[must_use]
    pub fn new(support_dir: impl AsRef<Path>) -> Self {
        Self {
            root: support_dir.as_ref().join("models"),
            source: None,
        }
    }

    /// Comme [`Self::new`], mais les fichiers se téléchargent à `base` (au lieu de
    /// `https://huggingface.co`) et sont ceux de `files` : pour jouer le téléchargement contre
    /// un serveur local, sans jamais joindre le vrai réseau.
    #[must_use]
    pub fn with_source(
        support_dir: impl AsRef<Path>,
        base: impl Into<String>,
        files: &'static [ModelFileInfo],
    ) -> Self {
        Self {
            root: support_dir.as_ref().join("models"),
            source: Some(Source {
                base: base.into(),
                files,
            }),
        }
    }

    /// Le dossier d'un modèle.
    fn folder(&self, model: MeaningModel) -> PathBuf {
        self.root.join(model.name())
    }

    /// Les fichiers d'un modèle, avec leur taille et leur somme.
    fn files(&self, model: MeaningModel) -> &'static [ModelFileInfo] {
        self.source
            .as_ref()
            .map_or_else(|| model.files(), |source| source.files)
    }

    /// L'adresse d'un fichier.
    fn address(&self, model: MeaningModel, info: &ModelFileInfo) -> String {
        let official = model.download_url(info.file());
        match &self.source {
            Some(source) => official.replacen(HUGGING_FACE, &source.base, 1),
            None => official,
        }
    }

    /// Le fichier est-il là, de la bonne taille ?
    fn is_complete(&self, model: MeaningModel, info: &ModelFileInfo) -> bool {
        fs::metadata(self.folder(model).join(info.file().name()))
            .is_ok_and(|found| found.len() == info.size())
    }
}

/// Un échec de téléchargement.
fn failed(model: MeaningModel, reason: impl std::fmt::Display) -> MeaningError {
    MeaningError::DownloadFailed {
        model,
        reason: reason.to_string(),
    }
}

/// Un fichier en cours de réception : son avancement, sa somme, et l'appelant à prévenir.
struct Reception<'a> {
    model: MeaningModel,
    total: u64,
    done: u64,
    progress: ProgressListener<'a>,
}

impl Reception<'_> {
    /// Reçoit `info` depuis `client` dans `part` ; rend la somme SHA-256 et la taille reçues.
    fn receive(
        &mut self,
        client: &Client,
        url: &str,
        info: &ModelFileInfo,
        part: &mut File,
    ) -> Result<(), MeaningError> {
        let model = self.model;
        let mut response = client
            .get(url)
            .send()
            .map_err(|e| failed(model, e))?
            .error_for_status()
            .map_err(|e| failed(model, e))?;
        let refused = MeaningError::FileRefused {
            model,
            file: info.file(),
        };
        let mut hasher = Sha256::new();
        let mut received: u64 = 0;
        let mut buffer = vec![0_u8; CHUNK];
        loop {
            let read = response.read(&mut buffer).map_err(|e| failed(model, e))?;
            if read == 0 {
                break;
            }
            received += read as u64;
            if received > info.size() {
                return Err(refused);
            }
            let chunk = &buffer[..read];
            hasher.update(chunk);
            part.write_all(chunk).map_err(|e| failed(model, e))?;
            self.done += read as u64;
            let step = DownloadProgress {
                done: self.done,
                total: self.total,
            };
            if (self.progress)(step).is_break() {
                return Err(MeaningError::DownloadInterrupted(model));
            }
        }
        if received != info.size() || format!("{:x}", hasher.finalize()) != info.sha256() {
            return Err(refused);
        }
        part.sync_all().map_err(|e| failed(model, e))
    }
}

impl MeaningModels for ModelFolder {
    fn state(&self, model: MeaningModel) -> ModelState {
        if self
            .files(model)
            .iter()
            .all(|info| self.is_complete(model, info))
        {
            ModelState::Downloaded
        } else {
            ModelState::NotDownloaded
        }
    }

    fn download(
        &self,
        model: MeaningModel,
        progress: ProgressListener<'_>,
    ) -> Result<(), MeaningError> {
        if self.state(model) == ModelState::Downloaded {
            return Ok(());
        }
        let folder = self.folder(model);
        fs::create_dir_all(&folder).map_err(|e| failed(model, e))?;
        let client = Client::builder()
            .timeout(DURATION_LIMIT)
            .connect_timeout(CONNECTION)
            .user_agent("malorean-notes")
            .build()
            .map_err(|e| failed(model, e))?;
        let files = self.files(model);
        let mut reception = Reception {
            model,
            total: files.iter().map(ModelFileInfo::size).sum(),
            done: 0,
            progress,
        };
        for info in files {
            if self.is_complete(model, info) {
                // Reçu et vérifié lors d'un essai précédent : rien à refaire.
                reception.done += info.size();
                continue;
            }
            let name = info.file().name();
            let part = folder.join(format!("{name}.part"));
            let url = self.address(model, info);
            let mut file = File::create(&part).map_err(|e| failed(model, e))?;
            let received = reception.receive(&client, &url, info, &mut file);
            drop(file);
            let kept = received
                .and_then(|()| fs::rename(&part, folder.join(name)).map_err(|e| failed(model, e)));
            if let Err(error) = kept {
                // Ignoré exprès : si le fichier temporaire a déjà disparu, il n'y a rien à effacer.
                fs::remove_file(&part).ok();
                return Err(error);
            }
        }
        Ok(())
    }

    fn remove(&self, model: MeaningModel) -> Result<(), MeaningError> {
        match fs::remove_dir_all(self.folder(model)) {
            Err(e) if e.kind() != ErrorKind::NotFound => Err(MeaningError::RemovalFailed {
                model,
                reason: e.to_string(),
            }),
            _ => Ok(()),
        }
    }

    fn open(&self, model: MeaningModel) -> Result<Arc<dyn Embedder>, MeaningError> {
        if self.state(model) == ModelState::NotDownloaded {
            return Err(MeaningError::ModelMissing(model));
        }
        Ok(Arc::new(CandleEmbedder::load(model, &self.folder(model))?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::ModelFile;

    #[test]
    fn by_default_the_files_come_from_hugging_face_under_the_support_folder() {
        let folder = ModelFolder::new("/support");
        let weights = &MeaningModel::Small.files()[2];
        assert_eq!(
            folder.address(MeaningModel::Small, weights),
            MeaningModel::Small.download_url(ModelFile::Weights)
        );
        assert_eq!(
            folder.folder(MeaningModel::Large),
            Path::new("/support/models/e5-large")
        );
    }
}
