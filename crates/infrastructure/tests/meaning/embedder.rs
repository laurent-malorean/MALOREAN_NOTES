//! Le moteur de sens sur de tout petits modèles : les deux familles d'architecture.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;

use application::testing::meaning_contract::embedder_shape_contract;
use application::{Embedder, MeaningError};
use domain::{MeaningModel, MeaningVector, ModelFile};
use infrastructure::CandleEmbedder;
use tempfile::TempDir;

use crate::tiny_model::write_tiny_model;

fn tiny(model: MeaningModel, seed: u64) -> (TempDir, CandleEmbedder) {
    let folder = TempDir::new().unwrap();
    write_tiny_model(model, folder.path(), seed);
    let embedder = CandleEmbedder::load(model, folder.path()).unwrap();
    (folder, embedder)
}

fn segment(embedder: &CandleEmbedder, text: &str) -> MeaningVector {
    embedder
        .embed_segments(&[text.to_owned()])
        .unwrap()
        .remove(0)
}

fn gap(a: &MeaningVector, b: &MeaningVector) -> f32 {
    1.0 - a.similarity(b)
}

#[test]
fn a_tiny_model_keeps_the_shape_contract() {
    for model in MeaningModel::ALL {
        let (_folder, embedder) = tiny(model, 7);
        assert_eq!(embedder.model(), model);
        embedder_shape_contract(&embedder);
    }
}

#[test]
fn many_segments_are_the_same_in_batches_as_alone_and_keep_their_order() {
    let (_folder, embedder) = tiny(MeaningModel::Small, 11);
    // 41 segments de longueurs en désordre : plus de deux lots de 16.
    let segments: Vec<String> = (0..41)
        .map(|i| format!("segment {i} {}", "mot ".repeat((i * 7) % 23)))
        .collect();
    let batch = embedder.embed_segments(&segments).unwrap();
    assert_eq!(batch.len(), 41);
    for (text, in_batch) in segments.iter().zip(&batch) {
        assert!(
            gap(&segment(&embedder, text), in_batch).abs() < 1e-3,
            "{text}"
        );
    }
}

#[test]
fn the_same_weights_give_the_same_vectors_and_other_weights_do_not() {
    let (_a, first) = tiny(MeaningModel::Small, 5);
    let (_b, second) = tiny(MeaningModel::Small, 5);
    let (_c, other) = tiny(MeaningModel::Small, 6);
    let text = "un texte";
    assert!(gap(&segment(&first, text), &segment(&second, text)).abs() < 1e-5);
    assert!(gap(&segment(&first, text), &segment(&other, text)) > 1e-3);
}

#[test]
fn a_text_is_cut_after_512_tokens() {
    for model in MeaningModel::ALL {
        let (_folder, embedder) = tiny(model, 9);
        // 512 jetons = <s>, « passage: » (9), 501 caractères du texte, </s>.
        let base = "a".repeat(700);
        let change_at = |index: usize| {
            let mut text = base.clone().into_bytes();
            text[index] = b'b';
            String::from_utf8(text).unwrap()
        };
        let plain = segment(&embedder, &base);
        assert!(gap(&plain, &segment(&embedder, &change_at(500))) > 1e-4);
        assert!(gap(&plain, &segment(&embedder, &change_at(501))).abs() < 1e-5);
        let query = |text: &str| embedder.embed_query(text).unwrap();
        // « query: » (7) laisse 503 caractères.
        assert!(gap(&query(&base), &query(&change_at(502))) > 1e-4);
        assert!(gap(&query(&base), &query(&change_at(503))).abs() < 1e-5);
    }
}

#[test]
fn a_question_and_a_segment_get_their_own_prefix() {
    let (_folder, embedder) = tiny(MeaningModel::Small, 4);
    // Chaque rôle a son préfixe : ce qui est dit dans l'un ne devient pas l'autre.
    let query = embedder.embed_query("passage: abc").unwrap();
    assert!(gap(&query, &segment(&embedder, "abc")) > 1e-4);
    let query = embedder.embed_query("abc").unwrap();
    assert!(gap(&query, &segment(&embedder, "query: abc")) > 1e-4);
}

#[test]
fn a_missing_or_broken_file_is_a_failed_computation() {
    for broken in ModelFile::ALL {
        let folder = TempDir::new().unwrap();
        write_tiny_model(MeaningModel::Small, folder.path(), 1);
        let file = folder.path().join(broken.name());
        fs::write(&file, b"pas du tout le bon contenu").unwrap();
        let broken_error = CandleEmbedder::load(MeaningModel::Small, folder.path()).unwrap_err();
        assert!(
            matches!(broken_error, MeaningError::ComputationFailed(_)),
            "{broken:?}"
        );
        fs::remove_file(&file).unwrap();
        let missing_error = CandleEmbedder::load(MeaningModel::Small, folder.path()).unwrap_err();
        assert!(
            matches!(missing_error, MeaningError::ComputationFailed(_)),
            "{broken:?}"
        );
    }
}

#[test]
fn a_loaded_model_shows_its_name_when_printed() {
    let (_folder, embedder) = tiny(MeaningModel::Large, 2);
    assert!(format!("{embedder:?}").contains("e5-large"));
}
