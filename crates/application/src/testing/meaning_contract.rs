//! Contrats du moteur de sens et des modèles de sens : joués à l'identique sur le faux et sur
//! l'adaptateur réel. Le moteur a deux contrats : celui de la forme (valable pour tout modèle,
//! même de poids tirés au hasard) et celui du sens (pour les vrais modèles et le faux).

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::ops::ControlFlow;

use domain::{MeaningModel, MeaningVector};

use crate::{DownloadProgress, Embedder, MeaningError, MeaningModels, ModelState};

/// Le contraire de [`MeaningVector::similarity`] vers 1 : à quel point deux vecteurs diffèrent.
fn gap(a: &MeaningVector, b: &MeaningVector) -> f32 {
    1.0 - a.similarity(b)
}

fn texts(list: &[&str]) -> Vec<String> {
    list.iter().map(|text| (*text).to_owned()).collect()
}

/// Joue le contrat de la forme sur `embedder` : combien de vecteurs, de quelle longueur, dans
/// quel ordre, et pareils qu'on calcule seul ou en lot.
pub fn embedder_shape_contract(embedder: &dyn Embedder) {
    no_segment_gives_no_vector(embedder);
    each_vector_has_the_model_dimensions_and_length_one(embedder);
    the_same_text_gives_the_same_vector(embedder);
    a_segment_has_the_same_vector_alone_or_in_a_batch_in_the_same_order(embedder);
    a_question_is_not_a_segment(embedder);
}

fn no_segment_gives_no_vector(embedder: &dyn Embedder) {
    assert_eq!(embedder.embed_segments(&[]).unwrap(), vec![]);
}

fn each_vector_has_the_model_dimensions_and_length_one(embedder: &dyn Embedder) {
    let vectors = embedder
        .embed_segments(&texts(&["premier", "deuxième segment", "t"]))
        .unwrap();
    assert_eq!(vectors.len(), 3);
    for vector in &vectors {
        assert_eq!(vector.values().len(), embedder.model().dimensions());
        assert!(gap(vector, vector).abs() < 1e-4);
    }
    let query = embedder.embed_query("une question").unwrap();
    assert_eq!(query.values().len(), embedder.model().dimensions());
    assert!(gap(&query, &query).abs() < 1e-4);
}

fn the_same_text_gives_the_same_vector(embedder: &dyn Embedder) {
    let segment = texts(&["la tarte aux pommes"]);
    let first = embedder.embed_segments(&segment).unwrap();
    let second = embedder.embed_segments(&segment).unwrap();
    assert!(gap(&first[0], &second[0]).abs() < 1e-5);
    let first = embedder.embed_query("des pommes").unwrap();
    let second = embedder.embed_query("des pommes").unwrap();
    assert!(gap(&first, &second).abs() < 1e-5);
}

fn a_segment_has_the_same_vector_alone_or_in_a_batch_in_the_same_order(embedder: &dyn Embedder) {
    // Du plus long au plus court dans l'entrée : un moteur qui trie par longueur doit rendre
    // les résultats dans l'ordre reçu.
    let long = "une phrase assez longue pour être la plus grande des trois. ".repeat(8);
    let segments = vec![
        long,
        "Une phrase de longueur moyenne, avec quelques mots de plus.".to_owned(),
        "Courte.".to_owned(),
    ];
    let batch = embedder.embed_segments(&segments).unwrap();
    assert_eq!(batch.len(), 3);
    for (segment, in_batch) in segments.iter().zip(&batch) {
        let alone = embedder
            .embed_segments(std::slice::from_ref(segment))
            .unwrap();
        assert!(gap(&alone[0], in_batch).abs() < 1e-3, "{segment}");
    }
    assert!(gap(&batch[0], &batch[1]) > 1e-3);
    assert!(gap(&batch[1], &batch[2]) > 1e-3);
    assert!(gap(&batch[0], &batch[2]) > 1e-3);
}

fn a_question_is_not_a_segment(embedder: &dyn Embedder) {
    let text = "recette de la tarte aux pommes";
    let query = embedder.embed_query(text).unwrap();
    let segment = embedder.embed_segments(&texts(&[text])).unwrap();
    assert!(gap(&query, &segment[0]) > 1e-5);
}

/// Joue le contrat du sens sur `embedder` : une question ressemble plus au segment qui parle de
/// la même chose qu'à celui qui parle d'autre chose.
pub fn embedder_meaning_contract(embedder: &dyn Embedder) {
    let segments = texts(&[
        "Compte rendu de la réunion budgétaire du lundi : les dépenses de l'équipe commerciale.",
        "Recette de la tarte aux pommes : éplucher les pommes, étaler la pâte, cuire quarante minutes.",
        "Liste de courses : du lait, du pain et du fromage.",
    ]);
    let vectors = embedder.embed_segments(&segments).unwrap();
    let query = embedder
        .embed_query("comment faire une tarte aux pommes")
        .unwrap();
    let scores: Vec<f32> = vectors.iter().map(|v| query.similarity(v)).collect();
    assert!(scores[1] > scores[0], "{scores:?}");
    assert!(scores[1] > scores[2], "{scores:?}");
}

/// Joue le contrat des modèles de sens sur `models`, où `model` n'est pas encore téléchargé :
/// états, avancement croissant jusqu'au total, interruption, suppression, ouverture.
pub fn meaning_models_contract(models: &dyn MeaningModels, model: MeaningModel) {
    assert_eq!(models.state(model), ModelState::NotDownloaded);
    assert_eq!(
        models.open(model).err(),
        Some(MeaningError::ModelMissing(model))
    );
    models.remove(model).unwrap();
    an_interrupted_download_leaves_nothing(models, model);
    a_download_reports_its_progress_up_to_the_total(models, model);
    a_downloaded_model_opens_and_is_removed(models, model);
}

fn an_interrupted_download_leaves_nothing(models: &dyn MeaningModels, model: MeaningModel) {
    let mut calls = 0;
    let result = models.download(model, &mut |_| {
        calls += 1;
        ControlFlow::Break(())
    });
    assert_eq!(result, Err(MeaningError::DownloadInterrupted(model)));
    assert_eq!(calls, 1);
    assert_eq!(models.state(model), ModelState::NotDownloaded);
    assert_eq!(
        models.open(model).err(),
        Some(MeaningError::ModelMissing(model))
    );
}

fn a_download_reports_its_progress_up_to_the_total(
    models: &dyn MeaningModels,
    model: MeaningModel,
) {
    let mut seen: Vec<DownloadProgress> = vec![];
    models
        .download(model, &mut |step| {
            seen.push(step);
            ControlFlow::Continue(())
        })
        .unwrap();
    assert!(!seen.is_empty());
    let total = seen[0].total;
    assert!(total > 0);
    assert!(seen.iter().all(|step| step.total == total));
    assert!(seen.windows(2).all(|pair| pair[0].done <= pair[1].done));
    assert!(seen.iter().all(|step| step.done <= total));
    assert_eq!(seen.last().unwrap().done, total);
    assert_eq!(models.state(model), ModelState::Downloaded);
    let mut again = 0;
    models
        .download(model, &mut |_| {
            again += 1;
            ControlFlow::Continue(())
        })
        .unwrap();
    assert_eq!(again, 0, "un modèle déjà là n'est pas retéléchargé");
}

fn a_downloaded_model_opens_and_is_removed(models: &dyn MeaningModels, model: MeaningModel) {
    let embedder = models.open(model).unwrap();
    assert_eq!(embedder.model(), model);
    embedder_shape_contract(embedder.as_ref());
    models.remove(model).unwrap();
    assert_eq!(models.state(model), ModelState::NotDownloaded);
    models.remove(model).unwrap();
}
