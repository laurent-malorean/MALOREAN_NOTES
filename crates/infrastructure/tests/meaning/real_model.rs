//! Le contrat sur le VRAI petit modèle, joué seulement s'il est sur ce Mac : dans le dossier des
//! modèles de l'application, sinon dans le cache de Hugging Face. Sinon le test dit pourquoi et
//! s'arrête. Les vecteurs de référence ont été calculés avec Python (`sentence-transformers`)
//! sur des textes neutres.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::path::{Path, PathBuf};

use application::Embedder;
use application::testing::meaning_contract::{embedder_meaning_contract, embedder_shape_contract};
use domain::{MeaningModel, MeaningVector};
use infrastructure::CandleEmbedder;
use serde_json::Value;

const MODEL: MeaningModel = MeaningModel::Small;

/// Le dossier est-il celui du modèle, entier (chaque fichier de la bonne taille) ?
fn is_whole(folder: &Path) -> bool {
    MODEL.files().iter().all(|info| {
        fs::metadata(folder.join(info.file().name())).is_ok_and(|m| m.len() == info.size())
    })
}

/// Le vrai modèle sur ce Mac, s'il y est : celui de l'application, sinon celui du cache de
/// Hugging Face (la révision choisie, ou n'importe quelle autre).
fn real_model_folder() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME")?);
    let application = home.join("Library/Application Support/com.malorean.notes/models/e5-small");
    let cache =
        home.join(".cache/huggingface/hub/models--intfloat--multilingual-e5-small/snapshots");
    let snapshots = fs::read_dir(cache)
        .into_iter()
        .flatten()
        .map(|e| e.unwrap().path());
    std::iter::once(application)
        .chain(snapshots)
        .find(|folder| is_whole(folder))
}

fn reference(values: &Value) -> MeaningVector {
    let numbers = values.as_array().unwrap().iter();
    MeaningVector::new(numbers.map(|n| n.as_f64().unwrap() as f32).collect()).unwrap()
}

#[test]
fn the_real_small_model_keeps_the_contracts_and_matches_the_python_vectors() {
    let Some(folder) = real_model_folder() else {
        #[expect(
            clippy::print_stderr,
            reason = "un test qui dépend du Mac le dit : le lanceur capture eprintln!"
        )]
        {
            eprintln!(
                "test ignoré : le modèle E5 petit n'est ni dans le dossier des modèles de l'application \
                 ni dans le cache de Hugging Face de ce Mac"
            );
        }
        return;
    };
    let embedder = CandleEmbedder::load(MODEL, &folder).unwrap();
    embedder_shape_contract(&embedder);
    embedder_meaning_contract(&embedder);

    let data: Value = serde_json::from_str(include_str!("reference_e5_small.json")).unwrap();
    let mut segments: Vec<String> = data["segments"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s.as_str().unwrap().to_owned())
        .collect();
    segments.push("Une phrase très longue, pour dépasser la limite de 512 jetons. ".repeat(60));
    let expected = data["segment_vectors"].as_array().unwrap();
    assert_eq!(segments.len(), expected.len());
    for ((text, ours), python) in segments
        .iter()
        .zip(embedder.embed_segments(&segments).unwrap())
        .zip(expected)
    {
        let similarity = ours.similarity(&reference(python));
        assert!(similarity >= 0.999, "{similarity} pour « {} »", &text[..20]);
    }
    for (query, python) in data["queries"]
        .as_array()
        .unwrap()
        .iter()
        .zip(data["query_vectors"].as_array().unwrap())
    {
        let ours = embedder.embed_query(query.as_str().unwrap()).unwrap();
        let similarity = ours.similarity(&reference(python));
        assert!(similarity >= 0.999, "{similarity} pour la question {query}");
    }
}
