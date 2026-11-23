//! Les modèles de sens du disque : téléchargement contre un serveur local (jamais le vrai
//! réseau), vérification des fichiers, reprise, suppression.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::ops::ControlFlow;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use application::testing::meaning_contract::meaning_models_contract;
use application::{MeaningError, MeaningModels, ModelState};
use domain::{MeaningModel, ModelFile, ModelFileInfo};
use infrastructure::ModelFolder;
use sha2::{Digest, Sha256};
use tempfile::TempDir;

use crate::http_server::{Reply, Server};
use crate::tiny_model::write_tiny_model;

const MODEL: MeaningModel = MeaningModel::Small;

/// Un tout petit modèle prêt à être servi : ses fichiers, et leur description.
struct Served {
    files: Vec<(ModelFile, Vec<u8>)>,
    infos: &'static [ModelFileInfo],
}

fn served() -> Served {
    let folder = TempDir::new().unwrap();
    write_tiny_model(MODEL, folder.path(), 21);
    let files: Vec<(ModelFile, Vec<u8>)> = ModelFile::ALL
        .iter()
        .map(|file| (*file, fs::read(folder.path().join(file.name())).unwrap()))
        .collect();
    let infos: Vec<ModelFileInfo> = files
        .iter()
        .map(|(file, bytes)| {
            let sum: &'static str =
                Box::leak(format!("{:x}", Sha256::digest(bytes)).into_boxed_str());
            ModelFileInfo::new(*file, bytes.len() as u64, sum)
        })
        .collect();
    Served {
        files,
        infos: Box::leak(infos.into_boxed_slice()),
    }
}

impl Served {
    fn server(&self) -> Server {
        Server::start(
            self.files
                .iter()
                .map(|(file, bytes)| (format!("/{}", file.name()), Reply::Body(bytes.clone())))
                .collect(),
        )
    }

    fn folder(&self, support: &Path, server: &Server) -> ModelFolder {
        ModelFolder::with_source(support, server.base(), self.infos)
    }

    fn bytes(&self, file: ModelFile) -> Vec<u8> {
        self.files
            .iter()
            .find(|(f, _)| *f == file)
            .unwrap()
            .1
            .clone()
    }
}

fn names(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(folder.join("models").join(MODEL.name()))
        .map(|entries| {
            entries
                .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

fn download(models: &ModelFolder) -> Result<(), MeaningError> {
    models.download(MODEL, &mut |_| ControlFlow::Continue(()))
}

const ALL_FILES: [&str; 3] = ["config.json", "model.safetensors", "tokenizer.json"];

#[test]
fn the_model_folder_keeps_the_contract_on_a_local_server() {
    let model = served();
    let server = model.server();
    let support = TempDir::new().unwrap();
    meaning_models_contract(&model.folder(support.path(), &server), MODEL);
}

#[test]
fn a_downloaded_model_is_kept_under_its_name_with_nothing_else() {
    let model = served();
    let server = model.server();
    let support = TempDir::new().unwrap();
    let models = model.folder(support.path(), &server);
    assert_eq!(models.state(MODEL), ModelState::NotDownloaded);
    download(&models).unwrap();
    assert_eq!(models.state(MODEL), ModelState::Downloaded);
    assert_eq!(names(support.path()), ALL_FILES);
    for file in ModelFile::ALL {
        let path = support.path().join("models/e5-small").join(file.name());
        assert_eq!(fs::read(path).unwrap(), model.bytes(file));
    }
    assert_eq!(
        server
            .hits()
            .iter()
            .map(|h| h.rsplit('/').next().unwrap().to_owned())
            .collect::<Vec<_>>(),
        ["config.json", "tokenizer.json", "model.safetensors"]
    );
    // Même chemin que l'adresse officielle, sous l'adresse de base remplacée.
    assert!(server.hits()[0].starts_with("/intfloat/multilingual-e5-small/resolve/"));
}

#[test]
fn the_progress_counts_every_byte_of_every_file_up_to_the_total() {
    let model = served();
    let server = model.server();
    let support = TempDir::new().unwrap();
    let models = model.folder(support.path(), &server);
    let total: u64 = model.infos.iter().map(ModelFileInfo::size).sum();
    let mut seen = vec![];
    models
        .download(MODEL, &mut |step| {
            seen.push((step.done, step.total));
            ControlFlow::Continue(())
        })
        .unwrap();
    assert!(
        seen.len() > 3,
        "un avancement par morceau reçu : {}",
        seen.len()
    );
    assert!(seen.iter().all(|(_, t)| *t == total));
    assert!(seen.windows(2).all(|pair| pair[0].0 < pair[1].0));
    assert_eq!(seen.last().unwrap().0, total);
}

#[test]
fn a_wrong_checksum_is_refused_and_nothing_is_kept() {
    let model = served();
    let server = model.server();
    let mut bytes = model.bytes(ModelFile::Weights);
    bytes[10] ^= 1;
    server.reply("/model.safetensors", Reply::Body(bytes));
    let support = TempDir::new().unwrap();
    let models = model.folder(support.path(), &server);
    assert_eq!(
        download(&models),
        Err(MeaningError::FileRefused {
            model: MODEL,
            file: ModelFile::Weights
        })
    );
    assert_eq!(models.state(MODEL), ModelState::NotDownloaded);
    assert_eq!(names(support.path()), ["config.json", "tokenizer.json"]);
}

#[test]
fn a_file_too_short_or_too_long_is_refused() {
    let model = served();
    let server = model.server();
    let support = TempDir::new().unwrap();
    let models = model.folder(support.path(), &server);
    let weights = model.bytes(ModelFile::Weights);
    let refused = Err(MeaningError::FileRefused {
        model: MODEL,
        file: ModelFile::Weights,
    });
    server.reply(
        "/model.safetensors",
        Reply::Unsized(weights[..weights.len() - 1].to_vec()),
    );
    assert_eq!(download(&models), refused);
    let mut longer = weights.clone();
    longer.push(0);
    server.reply("/model.safetensors", Reply::Unsized(longer));
    assert_eq!(download(&models), refused);
    assert_eq!(names(support.path()), ["config.json", "tokenizer.json"]);
}

#[test]
fn a_connection_cut_on_the_way_leaves_no_half_written_file() {
    let model = served();
    let server = model.server();
    let weights = model.bytes(ModelFile::Weights);
    server.reply(
        "/model.safetensors",
        Reply::Cut {
            declared: weights.len(),
            sent: weights[..weights.len() / 2].to_vec(),
        },
    );
    let support = TempDir::new().unwrap();
    let models = model.folder(support.path(), &server);
    assert!(matches!(
        download(&models),
        Err(MeaningError::DownloadFailed { model: MODEL, .. })
    ));
    assert_eq!(models.state(MODEL), ModelState::NotDownloaded);
    assert_eq!(names(support.path()), ["config.json", "tokenizer.json"]);
}

#[test]
fn a_refusing_server_and_an_absent_server_are_failed_downloads_that_say_why() {
    let model = served();
    let server = model.server();
    server.reply("/config.json", Reply::Status(503));
    let support = TempDir::new().unwrap();
    let error = download(&model.folder(support.path(), &server)).unwrap_err();
    assert!(
        matches!(&error, MeaningError::DownloadFailed { reason, .. } if reason.contains("503")),
        "{error}"
    );
    assert!(error.to_string().contains("E5 petit"));
    assert_eq!(names(support.path()), Vec::<String>::new());
    let address = server.base();
    drop(server);
    let models = ModelFolder::with_source(support.path(), address, model.infos);
    assert!(matches!(
        download(&models),
        Err(MeaningError::DownloadFailed { .. })
    ));
}

#[test]
fn an_interrupted_download_keeps_no_partial_file() {
    let model = served();
    let server = model.server();
    let support = TempDir::new().unwrap();
    let models = model.folder(support.path(), &server);
    let mut calls = 0;
    let result = models.download(MODEL, &mut |_| {
        calls += 1;
        if calls < 3 {
            ControlFlow::Continue(())
        } else {
            ControlFlow::Break(())
        }
    });
    assert_eq!(result, Err(MeaningError::DownloadInterrupted(MODEL)));
    assert_eq!(calls, 3);
    assert!(
        !names(support.path())
            .iter()
            .any(|name| name.ends_with(".part"))
    );
    assert_eq!(models.state(MODEL), ModelState::NotDownloaded);
}

#[test]
fn a_new_attempt_after_a_failure_only_fetches_what_is_missing() {
    let model = served();
    let server = model.server();
    let good = model.bytes(ModelFile::Weights);
    server.reply("/model.safetensors", Reply::Status(500));
    let support = TempDir::new().unwrap();
    let models = model.folder(support.path(), &server);
    assert!(download(&models).is_err());
    server.reply("/model.safetensors", Reply::Body(good));
    let total: u64 = model.infos.iter().map(ModelFileInfo::size).sum();
    let mut first = None;
    let mut last = 0;
    models
        .download(MODEL, &mut |step| {
            first.get_or_insert(step.done);
            last = step.done;
            ControlFlow::Continue(())
        })
        .unwrap();
    assert_eq!(models.state(MODEL), ModelState::Downloaded);
    assert_eq!(last, total);
    let hits = server.hits();
    let count = |name: &str| hits.iter().filter(|h| h.ends_with(name)).count();
    assert_eq!(
        (
            count("/config.json"),
            count("/tokenizer.json"),
            count("/model.safetensors")
        ),
        (1, 1, 2)
    );
    // Les fichiers déjà là comptent dans l'avancement : il ne repart pas de zéro.
    let kept = model.infos[0].size() + model.infos[1].size();
    assert!(first.unwrap() > kept && first.unwrap() <= total);
}

#[test]
fn a_leftover_temporary_file_is_replaced_by_the_next_attempt() {
    let model = served();
    let server = model.server();
    let support = TempDir::new().unwrap();
    let folder = support.path().join("models/e5-small");
    fs::create_dir_all(&folder).unwrap();
    fs::write(
        folder.join("model.safetensors.part"),
        b"reste d'un arret brutal",
    )
    .unwrap();
    let models = model.folder(support.path(), &server);
    download(&models).unwrap();
    assert_eq!(names(support.path()), ALL_FILES);
}

#[test]
fn a_file_missing_or_of_the_wrong_size_means_not_downloaded() {
    let model = served();
    let server = model.server();
    let support = TempDir::new().unwrap();
    let models = model.folder(support.path(), &server);
    download(&models).unwrap();
    let weights = support.path().join("models/e5-small/model.safetensors");
    let good = fs::read(&weights).unwrap();
    fs::write(&weights, &good[..good.len() - 1]).unwrap();
    assert_eq!(models.state(MODEL), ModelState::NotDownloaded);
    assert_eq!(
        models.open(MODEL).err(),
        Some(MeaningError::ModelMissing(MODEL))
    );
    fs::remove_file(&weights).unwrap();
    assert_eq!(models.state(MODEL), ModelState::NotDownloaded);
    assert_eq!(models.state(MeaningModel::Large), ModelState::NotDownloaded);
}

#[test]
fn removing_a_model_deletes_its_folder_only() {
    let model = served();
    let server = model.server();
    let support = TempDir::new().unwrap();
    let models = model.folder(support.path(), &server);
    download(&models).unwrap();
    let other = support.path().join("models/e5-large");
    fs::create_dir_all(&other).unwrap();
    models.remove(MODEL).unwrap();
    assert!(!support.path().join("models/e5-small").exists());
    assert!(other.exists());
    models.remove(MODEL).unwrap();
}

#[test]
fn a_disk_that_refuses_the_removal_says_so() {
    let model = served();
    let server = model.server();
    let support = TempDir::new().unwrap();
    let models = model.folder(support.path(), &server);
    download(&models).unwrap();
    let root = support.path().join("models");
    fs::set_permissions(&root, fs::Permissions::from_mode(0o500)).unwrap();
    let result = models.remove(MODEL);
    fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
    assert!(
        matches!(
            result,
            Err(MeaningError::RemovalFailed { model: MODEL, .. })
        ),
        "{result:?}"
    );
}
