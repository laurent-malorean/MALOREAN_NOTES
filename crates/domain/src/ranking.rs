//! Classer des notes : fusionner plusieurs listes par le rang réciproque, et ne garder que le
//! meilleur segment de chaque note (recherche par le sens, fiche 0042).

use std::collections::HashMap;

use crate::NotePath;

/// La constante du rang réciproque : plus elle est grande, moins la tête d'une liste pèse.
pub const RECIPROCAL_RANK_CONSTANT: f32 = 60.0;

/// Fusionne des listes de notes (la meilleure d'abord) en un seul classement : une note reçoit
/// 1 / (60 + rang) pour chaque liste où elle figure, rang 1 pour la tête ; les points
/// s'additionnent. À égalité, la note vue en premier (liste après liste) passe devant.
#[must_use]
pub fn fuse(lists: &[Vec<NotePath>]) -> Vec<NotePath> {
    let mut order: Vec<&NotePath> = Vec::new();
    let mut scores: HashMap<&NotePath, f32> = HashMap::new();
    for list in lists {
        let mut seen: Vec<&NotePath> = Vec::new();
        for note in list {
            if seen.contains(&note) {
                continue;
            }
            seen.push(note);
            #[expect(
                clippy::cast_precision_loss,
                reason = "un rang de liste tient dans f32"
            )]
            let points = 1.0 / (RECIPROCAL_RANK_CONSTANT + seen.len() as f32);
            *scores.entry(note).or_insert_with(|| {
                order.push(note);
                0.0
            }) += points;
        }
    }
    order.sort_by(|a, b| scores[b].total_cmp(&scores[a]));
    order.into_iter().cloned().collect()
}

/// Le score de chaque note, d'après ses segments : une note compte par son meilleur segment.
/// Triées par score décroissant ; à égalité, la note vue en premier passe devant.
#[must_use]
pub fn best_note_scores(
    scored_segments: impl IntoIterator<Item = (NotePath, f32)>,
) -> Vec<(NotePath, f32)> {
    let mut best: Vec<(NotePath, f32)> = Vec::new();
    let mut position: HashMap<NotePath, usize> = HashMap::new();
    for (note, score) in scored_segments {
        match position.get(&note) {
            Some(&index) => best[index].1 = best[index].1.max(score),
            None => {
                position.insert(note.clone(), best.len());
                best.push((note, score));
            }
        }
    }
    best.sort_by(|a, b| b.1.total_cmp(&a.1));
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(name: &str) -> NotePath {
        NotePath::parse(&format!("{name}.md")).unwrap()
    }

    fn notes(names: &[&str]) -> Vec<NotePath> {
        names.iter().map(|name| note(name)).collect()
    }

    #[test]
    fn fusing_nothing_gives_nothing() {
        assert!(fuse(&[]).is_empty());
        assert!(fuse(&[vec![], vec![]]).is_empty());
    }

    #[test]
    fn a_single_list_keeps_its_order() {
        assert_eq!(fuse(&[notes(&["b", "a", "c"])]), notes(&["b", "a", "c"]));
    }

    #[test]
    fn a_note_in_both_lists_beats_a_note_at_the_head_of_one() {
        let words = notes(&["a", "b", "c"]);
        let meaning = notes(&["c", "b", "d"]);
        assert_eq!(fuse(&[words, meaning]), notes(&["c", "b", "a", "d"]));
    }

    #[test]
    fn the_points_are_one_over_sixty_plus_the_rank() {
        // b : 1/62 + 1/62 ; a : 1/61. 2/62 > 1/61 : b devant.
        assert_eq!(
            fuse(&[notes(&["a", "b"]), notes(&["c", "b"])]),
            notes(&["b", "a", "c"])
        );
        // Avec 1/(60+rang+1) ou 1/rang le classement serait autre : b (rangs 2 et 2) contre a (rang 1).
        assert_eq!(RECIPROCAL_RANK_CONSTANT.to_bits(), 60.0_f32.to_bits());
    }

    #[test]
    fn a_tie_goes_to_the_note_seen_first() {
        assert_eq!(
            fuse(&[notes(&["a", "b"]), notes(&["b", "a"])]),
            notes(&["a", "b"])
        );
        assert_eq!(fuse(&[notes(&["a"]), notes(&["b"])]), notes(&["a", "b"]));
    }

    #[test]
    fn a_note_listed_twice_in_one_list_counts_once_at_its_first_rank() {
        assert_eq!(
            fuse(&[notes(&["a", "a", "b"]), notes(&["b"])]),
            notes(&["b", "a"])
        );
    }

    #[test]
    fn the_rank_counts_from_one_so_that_the_head_weighs_more_than_the_second() {
        // a est 1re d'une liste, b 2e de deux listes : 1/61 = 0,01639 contre 2/62 = 0,03226.
        assert_eq!(
            fuse(&[notes(&["a", "b"]), notes(&["c", "b"]), notes(&["d", "b"])]),
            notes(&["b", "a", "c", "d"])
        );
    }

    #[test]
    fn a_note_counts_by_its_best_segment() {
        let scored = vec![
            (note("a"), 0.2),
            (note("b"), 0.5),
            (note("a"), 0.9),
            (note("b"), 0.1),
        ];
        assert_eq!(
            best_note_scores(scored),
            vec![(note("a"), 0.9), (note("b"), 0.5)]
        );
    }

    #[test]
    fn a_later_lower_segment_does_not_lower_the_note() {
        let scored = vec![(note("a"), 0.9), (note("a"), 0.2)];
        assert_eq!(best_note_scores(scored), vec![(note("a"), 0.9)]);
    }

    #[test]
    fn an_equal_segment_score_changes_nothing() {
        let scored = vec![(note("a"), 0.5), (note("a"), 0.5)];
        assert_eq!(best_note_scores(scored), vec![(note("a"), 0.5)]);
    }

    #[test]
    fn equal_scores_keep_the_order_of_first_appearance() {
        let scored = vec![(note("b"), 0.5), (note("a"), 0.5), (note("c"), 0.7)];
        assert_eq!(
            best_note_scores(scored),
            vec![(note("c"), 0.7), (note("b"), 0.5), (note("a"), 0.5)]
        );
    }

    #[test]
    fn no_segment_means_no_note() {
        assert!(best_note_scores(Vec::new()).is_empty());
    }
}
