//! Le VRAI téléchargement du petit modèle depuis Hugging Face (environ 470 Mo), puis un calcul de
//! vecteurs. Manuel : ignoré par défaut, jamais joué par la CI.
//! `cargo test -p infrastructure --test meaning real_download -- --ignored --nocapture`

use std::ops::ControlFlow;

use application::{MeaningModels, ModelState};
use domain::MeaningModel;
use infrastructure::ModelFolder;
use tempfile::TempDir;

#[test]
#[ignore = "télécharge environ 470 Mo depuis Hugging Face"]
fn the_real_small_model_downloads_from_hugging_face_and_computes_vectors() {
    let support = TempDir::new().unwrap();
    let folder = ModelFolder::new(support.path());
    let model = MeaningModel::Small;
    assert_eq!(folder.state(model), ModelState::NotDownloaded);
    folder
        .download(model, &mut |_| ControlFlow::Continue(()))
        .unwrap();
    assert_eq!(folder.state(model), ModelState::Downloaded);
    let embedder = folder.open(model).unwrap();
    let texts = [
        "pommes sucre beurre".to_owned(),
        "farine levain eau".to_owned(),
    ];
    let vectors = embedder.embed_segments(&texts).unwrap();
    assert_eq!(vectors.len(), 2);
    let query = embedder.embed_query("dessert aux pommes").unwrap();
    assert!(query.similarity(&vectors[0]) > query.similarity(&vectors[1]));
}
