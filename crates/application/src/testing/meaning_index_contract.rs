//! Contrat de l'index de sens : joué à l'identique sur l'index en mémoire et sur la base SQLite.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::segments::{Segment, segments};
use domain::{MeaningModel, MeaningVector, NotePath};

use crate::{MeaningIndex, MeaningIndexError, MeaningSearch, PendingSegment, SegmentId};

const SMALL: MeaningModel = MeaningModel::Small;
const LARGE: MeaningModel = MeaningModel::Large;

fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

/// Les segments d'une note de titre `Titre` : un par paragraphe sous un titre `## <mot>`.
fn parts(words: &[&str]) -> Vec<Segment> {
    let content: String = words
        .iter()
        .map(|word| format!("## {word}\n\ntexte {word}\n\n"))
        .collect();
    segments("Titre", &content)
}

/// Un vecteur de `model` : 1 sur l'axe `axis`, plus `side` sur l'axe suivant ; ramené à 1.
fn vector(model: MeaningModel, axis: usize, side: f32) -> MeaningVector {
    let mut values = vec![0.0; model.dimensions()];
    values[axis] = 1.0;
    values[axis + 1] = side;
    MeaningVector::new(values).unwrap()
}

fn axis(model: MeaningModel, axis: usize) -> MeaningVector {
    vector(model, axis, 0.0)
}

fn pending(index: &dyn MeaningIndex, model: MeaningModel) -> Vec<PendingSegment> {
    index.without_vector(model, usize::MAX).unwrap()
}

fn headings(pending: &[PendingSegment]) -> Vec<String> {
    pending.iter().map(|p| p.segment.heading()).collect()
}

/// Range les segments de `note` et leur donne à tous le vecteur `axis(model, n)`, n suivant
/// leur ordre, à partir de `first`. Rend leurs identifiants.
fn store<I: MeaningIndex>(
    index: &I,
    note: &str,
    words: &[&str],
    model: MeaningModel,
    first: usize,
) -> Vec<SegmentId> {
    let before: Vec<SegmentId> = pending(index, model).iter().map(|p| p.id).collect();
    index.replace_segments(&path(note), &parts(words)).unwrap();
    let added: Vec<SegmentId> = pending(index, model)
        .iter()
        .map(|p| p.id)
        .filter(|id| !before.contains(id))
        .collect();
    let vectors: Vec<(SegmentId, MeaningVector)> = added
        .iter()
        .enumerate()
        .map(|(n, id)| (*id, axis(model, first + n * 2)))
        .collect();
    index.put_vectors(model, &vectors).unwrap();
    added
}

/// Joue tout le contrat ; `empty_index` fabrique un index vide à chaque appel.
pub fn meaning_index_contract<I: MeaningIndex + MeaningSearch>(empty_index: impl Fn() -> I) {
    a_new_index_is_empty(&empty_index());
    replacing_counts_new_and_changed_segments(&empty_index());
    an_unchanged_segment_keeps_its_vectors_for_every_model(&empty_index());
    a_vanished_segment_loses_its_vectors(&empty_index());
    notes_do_not_touch_each_other(&empty_index());
    without_vector_lists_the_oldest_first_within_the_limit(&empty_index());
    vectors_are_kept_per_model(&empty_index());
    wrong_dimensions_are_refused_and_nothing_is_kept(&empty_index());
    a_vector_for_a_vanished_segment_is_ignored(&empty_index());
    a_vector_put_again_replaces_the_old_one(&empty_index());
    nearest_orders_by_score_and_breaks_ties_by_place(&empty_index());
    nearest_counts_only_the_vectors_of_the_model(&empty_index());
    nearest_refuses_a_question_of_another_model(&empty_index());
    related_notes_use_the_best_pair_and_exclude_the_note(&empty_index());
    related_notes_are_limited_and_break_ties_by_path(&empty_index());
    related_notes_count_only_the_vectors_of_the_model(&empty_index());
    status_counts_per_model(&empty_index());
    removing_a_note_and_clearing_forget_everything(&empty_index());
    clearing_the_vectors_of_a_model_keeps_the_others_and_the_segments(&empty_index());
}

fn clearing_the_vectors_of_a_model_keeps_the_others_and_the_segments<
    I: MeaningIndex + MeaningSearch,
>(
    index: &I,
) {
    store(index, "a.md", &["un", "deux"], SMALL, 0);
    let large: Vec<(SegmentId, MeaningVector)> = pending(index, LARGE)
        .iter()
        .enumerate()
        .map(|(n, p)| (p.id, axis(LARGE, n * 2)))
        .collect();
    index.put_vectors(LARGE, &large).unwrap();
    index.clear_vectors(SMALL).unwrap();
    let small = index.status(SMALL).unwrap();
    assert_eq!((small.segments, small.with_vector, small.notes), (2, 0, 1));
    assert_eq!(pending(index, SMALL).len(), 2);
    assert!(index.nearest(SMALL, &axis(SMALL, 0), 5).unwrap().is_empty());
    assert_eq!(index.status(LARGE).unwrap().with_vector, 2);
    assert_eq!(index.nearest(LARGE, &axis(LARGE, 0), 5).unwrap().len(), 2);
    // Rien à effacer : sans erreur.
    index.clear_vectors(SMALL).unwrap();
}

fn a_new_index_is_empty<I: MeaningIndex + MeaningSearch>(index: &I) {
    let status = index.status(SMALL).unwrap();
    assert_eq!(
        (status.segments, status.with_vector, status.notes),
        (0, 0, 0)
    );
    assert!(pending(index, SMALL).is_empty());
    assert!(index.nearest(SMALL, &axis(SMALL, 0), 5).unwrap().is_empty());
    assert!(
        index
            .related_notes(SMALL, &path("a.md"), 5)
            .unwrap()
            .is_empty()
    );
}

fn replacing_counts_new_and_changed_segments<I: MeaningIndex + MeaningSearch>(index: &I) {
    let note = path("a.md");
    assert_eq!(
        index
            .replace_segments(&note, &parts(&["un", "deux"]))
            .unwrap(),
        2
    );
    assert_eq!(
        index
            .replace_segments(&note, &parts(&["un", "deux"]))
            .unwrap(),
        0
    );
    assert_eq!(
        index
            .replace_segments(&note, &parts(&["un", "trois"]))
            .unwrap(),
        1
    );
    assert_eq!(
        index
            .replace_segments(&note, &parts(&["deux", "un"]))
            .unwrap(),
        1
    );
    assert_eq!(index.replace_segments(&note, &[]).unwrap(), 0);
    assert_eq!(index.status(SMALL).unwrap().segments, 0);
    identical_segments_count_each(index);
}

fn identical_segments_count_each<I: MeaningIndex + MeaningSearch>(index: &I) {
    let note = path("a.md");
    // Deux segments identiques dans la même note comptent chacun.
    assert_eq!(
        index.replace_segments(&note, &parts(&["x", "x"])).unwrap(),
        2
    );
    assert_eq!(
        index
            .replace_segments(&note, &parts(&["x", "x", "x"]))
            .unwrap(),
        1
    );
    assert_eq!(index.status(SMALL).unwrap().segments, 3);
    assert_eq!(index.replace_segments(&note, &parts(&["x"])).unwrap(), 0);
    assert_eq!(index.status(SMALL).unwrap().segments, 1);
}

fn an_unchanged_segment_keeps_its_vectors_for_every_model<I: MeaningIndex + MeaningSearch>(
    index: &I,
) {
    let note = path("a.md");
    let ids = store(index, "a.md", &["un", "deux", "trois"], SMALL, 0);
    let all = pending(index, LARGE);
    let large: Vec<(SegmentId, MeaningVector)> = all
        .iter()
        .enumerate()
        .map(|(n, p)| (p.id, axis(LARGE, n * 2)))
        .collect();
    index.put_vectors(LARGE, &large).unwrap();
    // « deux » change et « un » passe après « trois » : seul le nouveau est à calculer.
    assert_eq!(
        index
            .replace_segments(&note, &parts(&["trois", "un", "quatre"]))
            .unwrap(),
        1
    );
    for model in [SMALL, LARGE] {
        let waiting = pending(index, model);
        assert_eq!(headings(&waiting), ["Titre > quatre"]);
        assert_eq!(waiting[0].segment.text(), "texte quatre");
        assert!(!ids.contains(&waiting[0].id));
    }
    // Les vecteurs gardés suivent leur segment à sa nouvelle place.
    let first = &index.nearest(SMALL, &axis(SMALL, 0), 1).unwrap()[0];
    assert_eq!(first.segment.heading(), "Titre > un");
    let second = &index.nearest(LARGE, &axis(LARGE, 4), 1).unwrap()[0];
    assert_eq!(second.segment.heading(), "Titre > trois");
}

fn a_vanished_segment_loses_its_vectors<I: MeaningIndex + MeaningSearch>(index: &I) {
    store(index, "a.md", &["un", "deux"], SMALL, 0);
    index
        .replace_segments(&path("a.md"), &parts(&["un"]))
        .unwrap();
    let status = index.status(SMALL).unwrap();
    assert_eq!((status.segments, status.with_vector), (1, 1));
    // Il revient : sans vecteur, il est à recalculer.
    index
        .replace_segments(&path("a.md"), &parts(&["un", "deux"]))
        .unwrap();
    assert_eq!(headings(&pending(index, SMALL)), ["Titre > deux"]);
}

fn notes_do_not_touch_each_other<I: MeaningIndex + MeaningSearch>(index: &I) {
    store(index, "a.md", &["un"], SMALL, 0);
    store(index, "b.md", &["un"], SMALL, 2);
    index.replace_segments(&path("a.md"), &[]).unwrap();
    let found = index.nearest(SMALL, &axis(SMALL, 2), 10).unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].note, path("b.md"));
    // Les mêmes segments dans deux notes sont deux segments.
    index
        .replace_segments(&path("a.md"), &parts(&["un"]))
        .unwrap();
    assert_eq!(index.status(SMALL).unwrap().segments, 2);
}

fn without_vector_lists_the_oldest_first_within_the_limit<I: MeaningIndex + MeaningSearch>(
    index: &I,
) {
    index
        .replace_segments(&path("b.md"), &parts(&["un", "deux"]))
        .unwrap();
    index
        .replace_segments(&path("a.md"), &parts(&["trois"]))
        .unwrap();
    let all = pending(index, SMALL);
    assert_eq!(
        headings(&all),
        ["Titre > un", "Titre > deux", "Titre > trois"]
    );
    assert_eq!(all[2].segment.text(), "texte trois");
    let two = index.without_vector(SMALL, 2).unwrap();
    assert_eq!(headings(&two), ["Titre > un", "Titre > deux"]);
    assert!(index.without_vector(SMALL, 0).unwrap().is_empty());
    let one = index.without_vector(SMALL, 1).unwrap();
    assert_eq!(one[0].id, all[0].id);
    index
        .put_vectors(SMALL, &[(all[0].id, axis(SMALL, 0))])
        .unwrap();
    assert_eq!(
        headings(&pending(index, SMALL)),
        ["Titre > deux", "Titre > trois"]
    );
}

fn vectors_are_kept_per_model<I: MeaningIndex + MeaningSearch>(index: &I) {
    store(index, "a.md", &["un", "deux"], SMALL, 0);
    assert_eq!(pending(index, LARGE).len(), 2);
    store_large_for_first(index);
    assert_eq!(pending(index, SMALL).len(), 0);
    assert_eq!(pending(index, LARGE).len(), 1);
    assert_eq!(index.nearest(SMALL, &axis(SMALL, 0), 5).unwrap().len(), 2);
    assert_eq!(index.nearest(LARGE, &axis(LARGE, 0), 5).unwrap().len(), 1);
    let small = index.status(SMALL).unwrap();
    let large = index.status(LARGE).unwrap();
    assert_eq!((small.with_vector, large.with_vector), (2, 1));
}

fn store_large_for_first<I: MeaningIndex>(index: &I) {
    let first = pending(index, LARGE)[0].id;
    index
        .put_vectors(LARGE, &[(first, axis(LARGE, 0))])
        .unwrap();
}

fn wrong_dimensions_are_refused_and_nothing_is_kept<I: MeaningIndex + MeaningSearch>(index: &I) {
    index
        .replace_segments(&path("a.md"), &parts(&["un", "deux"]))
        .unwrap();
    let waiting = pending(index, SMALL);
    let wrong = index.put_vectors(
        SMALL,
        &[
            (waiting[0].id, axis(SMALL, 0)),
            (waiting[1].id, axis(LARGE, 0)),
        ],
    );
    assert_eq!(
        wrong,
        Err(MeaningIndexError::WrongDimensions {
            model: SMALL,
            expected: 384,
            found: 1_024
        })
    );
    assert_eq!(pending(index, SMALL).len(), 2);
    let too_short = MeaningVector::new(vec![1.0; 383]).unwrap();
    assert!(matches!(
        index.put_vectors(SMALL, &[(waiting[0].id, too_short)]),
        Err(MeaningIndexError::WrongDimensions { found: 383, .. })
    ));
    let too_long = MeaningVector::new(vec![1.0; 385]).unwrap();
    assert!(matches!(
        index.put_vectors(SMALL, &[(waiting[0].id, too_long)]),
        Err(MeaningIndexError::WrongDimensions { found: 385, .. })
    ));
    assert!(matches!(
        index.put_vectors(LARGE, &[(waiting[0].id, axis(SMALL, 0))]),
        Err(MeaningIndexError::WrongDimensions {
            expected: 1_024,
            found: 384,
            ..
        })
    ));
    assert_eq!(index.status(SMALL).unwrap().with_vector, 0);
}

fn a_vector_for_a_vanished_segment_is_ignored<I: MeaningIndex + MeaningSearch>(index: &I) {
    index
        .replace_segments(&path("a.md"), &parts(&["un"]))
        .unwrap();
    let id = pending(index, SMALL)[0].id;
    index.replace_segments(&path("a.md"), &[]).unwrap();
    index.put_vectors(SMALL, &[(id, axis(SMALL, 0))]).unwrap();
    let status = index.status(SMALL).unwrap();
    assert_eq!((status.segments, status.with_vector), (0, 0));
    index
        .put_vectors(SMALL, &[(SegmentId::new(987_654), axis(SMALL, 0))])
        .unwrap();
    assert_eq!(index.status(SMALL).unwrap().with_vector, 0);
}

fn a_vector_put_again_replaces_the_old_one<I: MeaningIndex + MeaningSearch>(index: &I) {
    let id = store(index, "a.md", &["un"], SMALL, 0)[0];
    index.put_vectors(SMALL, &[(id, axis(SMALL, 10))]).unwrap();
    assert!(
        index.nearest(SMALL, &axis(SMALL, 0), 1).unwrap()[0]
            .score
            .abs()
            < 1e-6
    );
    let best = &index.nearest(SMALL, &axis(SMALL, 10), 1).unwrap()[0];
    assert!((best.score - 1.0).abs() < 1e-6);
    assert_eq!(index.status(SMALL).unwrap().with_vector, 1);
}

fn nearest_orders_by_score_and_breaks_ties_by_place<I: MeaningIndex + MeaningSearch>(index: &I) {
    // b.md : deux segments de même vecteur ; a.md : un segment identique, un autre plus loin.
    index
        .replace_segments(&path("b.md"), &parts(&["un", "deux"]))
        .unwrap();
    index
        .replace_segments(&path("a.md"), &parts(&["trois", "quatre"]))
        .unwrap();
    let waiting = pending(index, SMALL);
    let by_heading = |heading: &str| {
        waiting
            .iter()
            .find(|p| p.segment.heading() == heading)
            .unwrap()
            .id
    };
    let ids = [
        (by_heading("Titre > un"), axis(SMALL, 0)),
        (by_heading("Titre > deux"), axis(SMALL, 0)),
        (by_heading("Titre > trois"), vector(SMALL, 0, 1.0)),
        (by_heading("Titre > quatre"), axis(SMALL, 5)),
    ];
    // Le même mot dans deux notes : les deux ont leur propre identifiant (même titre complet).
    index.put_vectors(SMALL, &ids).unwrap();
    let found = index.nearest(SMALL, &axis(SMALL, 0), 10).unwrap();
    let order: Vec<(String, String)> = found
        .iter()
        .map(|f| (f.note.to_path(), f.segment.heading()))
        .collect();
    let expected: Vec<(String, String)> = [
        ("b.md", "Titre > un"),
        ("b.md", "Titre > deux"),
        ("a.md", "Titre > trois"),
        ("a.md", "Titre > quatre"),
    ]
    .iter()
    .map(|(note, heading)| ((*note).to_owned(), (*heading).to_owned()))
    .collect();
    assert_eq!(order, expected);
    assert!((found[0].score - 1.0).abs() < 1e-6);
    assert!((found[2].score - std::f32::consts::FRAC_1_SQRT_2).abs() < 1e-5);
    assert!(found[3].score.abs() < 1e-6);
    assert_eq!(found[1].segment.text(), "texte deux");
    assert_eq!(index.nearest(SMALL, &axis(SMALL, 0), 3).unwrap().len(), 3);
    assert!(index.nearest(SMALL, &axis(SMALL, 0), 0).unwrap().is_empty());
}

fn nearest_counts_only_the_vectors_of_the_model<I: MeaningIndex + MeaningSearch>(index: &I) {
    store(index, "a.md", &["un"], SMALL, 0);
    index
        .replace_segments(&path("b.md"), &parts(&["deux"]))
        .unwrap();
    let found = index.nearest(SMALL, &axis(SMALL, 0), 10).unwrap();
    assert_eq!(found.len(), 1, "le segment sans vecteur ne compte pas");
    assert!(
        index
            .nearest(LARGE, &axis(LARGE, 0), 10)
            .unwrap()
            .is_empty()
    );
}

fn nearest_refuses_a_question_of_another_model<I: MeaningIndex + MeaningSearch>(index: &I) {
    store(index, "a.md", &["un"], SMALL, 0);
    assert_eq!(
        index.nearest(SMALL, &axis(LARGE, 0), 10),
        Err(MeaningIndexError::WrongDimensions {
            model: SMALL,
            expected: 384,
            found: 1_024
        })
    );
    assert!(matches!(
        index.nearest(LARGE, &axis(SMALL, 0), 10),
        Err(MeaningIndexError::WrongDimensions { .. })
    ));
}

fn related_notes_use_the_best_pair_and_exclude_the_note<I: MeaningIndex + MeaningSearch>(
    index: &I,
) {
    // a.md : axes 0 et 10. b.md : axe 0 (parfait) et axe 30. c.md : mi-chemin de l'axe 10. d.md : loin.
    store(index, "a.md", &["un", "deux"], SMALL, 0);
    let a = pending(index, SMALL);
    assert!(a.is_empty());
    let a_ids = index.nearest(SMALL, &axis(SMALL, 0), 10).unwrap();
    assert_eq!(a_ids.len(), 2);
    index
        .replace_segments(&path("b.md"), &parts(&["trois", "quatre"]))
        .unwrap();
    index
        .replace_segments(&path("c.md"), &parts(&["cinq"]))
        .unwrap();
    index
        .replace_segments(&path("d.md"), &parts(&["six"]))
        .unwrap();
    let waiting = pending(index, SMALL);
    let vectors = [
        (waiting[0].id, axis(SMALL, 0)),
        (waiting[1].id, axis(SMALL, 30)),
        (waiting[2].id, vector(SMALL, 2, 1.0)),
        (waiting[3].id, axis(SMALL, 50)),
    ];
    index.put_vectors(SMALL, &vectors).unwrap();
    // a.md a ses axes à 0 et 2 (store avance de 2 en 2) : « cinq » (axes 2 et 3) en est à 0,707.
    let related = index.related_notes(SMALL, &path("a.md"), 10).unwrap();
    let order: Vec<String> = related.iter().map(|r| r.note.to_path()).collect();
    assert_eq!(order, ["b.md", "c.md", "d.md"]);
    assert!((related[0].score - 1.0).abs() < 1e-6);
    assert!((related[1].score - std::f32::consts::FRAC_1_SQRT_2).abs() < 1e-5);
    assert!(related[2].score.abs() < 1e-6);
    assert!(related.iter().all(|r| r.note != path("a.md")));
    assert!(
        index
            .related_notes(SMALL, &path("inconnue.md"), 10)
            .unwrap()
            .is_empty()
    );
}

fn related_notes_are_limited_and_break_ties_by_path<I: MeaningIndex + MeaningSearch>(index: &I) {
    store(index, "z.md", &["un"], SMALL, 0);
    store(index, "c.md", &["un"], SMALL, 0);
    store(index, "b.md", &["un"], SMALL, 0);
    store(index, "a.md", &["un"], SMALL, 0);
    let related = index.related_notes(SMALL, &path("z.md"), 2).unwrap();
    let order: Vec<String> = related.iter().map(|r| r.note.to_path()).collect();
    assert_eq!(order, ["a.md", "b.md"]);
    assert!(
        index
            .related_notes(SMALL, &path("z.md"), 0)
            .unwrap()
            .is_empty()
    );
}

fn related_notes_count_only_the_vectors_of_the_model<I: MeaningIndex + MeaningSearch>(index: &I) {
    store(index, "a.md", &["un"], SMALL, 0);
    store(index, "b.md", &["un"], SMALL, 0);
    index
        .replace_segments(&path("c.md"), &parts(&["deux"]))
        .unwrap();
    let related = index.related_notes(SMALL, &path("a.md"), 10).unwrap();
    assert_eq!(related.len(), 1, "c.md n'a pas de vecteur de sens");
    assert!(
        index
            .related_notes(LARGE, &path("a.md"), 10)
            .unwrap()
            .is_empty()
    );
}

fn status_counts_per_model<I: MeaningIndex + MeaningSearch>(index: &I) {
    store(index, "a.md", &["un", "deux"], SMALL, 0);
    index
        .replace_segments(&path("b.md"), &parts(&["trois"]))
        .unwrap();
    index.replace_segments(&path("c.md"), &[]).unwrap();
    let small = index.status(SMALL).unwrap();
    assert_eq!((small.segments, small.with_vector, small.notes), (3, 2, 2));
    let large = index.status(LARGE).unwrap();
    assert_eq!((large.segments, large.with_vector, large.notes), (3, 0, 2));
}

fn removing_a_note_and_clearing_forget_everything<I: MeaningIndex + MeaningSearch>(index: &I) {
    store(index, "a.md", &["un"], SMALL, 0);
    store(index, "b.md", &["un", "deux"], SMALL, 2);
    index.remove_note(&path("a.md")).unwrap();
    index.remove_note(&path("inconnue.md")).unwrap();
    let status = index.status(SMALL).unwrap();
    assert_eq!(
        (status.segments, status.with_vector, status.notes),
        (2, 2, 1)
    );
    assert!(
        index
            .nearest(SMALL, &axis(SMALL, 0), 10)
            .unwrap()
            .iter()
            .all(|f| f.note == path("b.md"))
    );
    index.clear().unwrap();
    let status = index.status(SMALL).unwrap();
    assert_eq!(
        (status.segments, status.with_vector, status.notes),
        (0, 0, 0)
    );
    assert!(
        index
            .nearest(SMALL, &axis(SMALL, 2), 10)
            .unwrap()
            .is_empty()
    );
    // Après l'effacement, l'index sert de nouveau.
    assert_eq!(
        index
            .replace_segments(&path("a.md"), &parts(&["un"]))
            .unwrap(),
        1
    );
}
