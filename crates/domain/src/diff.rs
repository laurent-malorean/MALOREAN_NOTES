//! Différences entre deux textes : ligne par ligne, ce que l'historique surligne entre une
//! version et la note actuelle ; mot par mot, ce que l'aide à l'écriture surligne entre une
//! sélection et sa proposition.

/// Au-delà de ce nombre de lignes ajoutées ou retirées, la recherche des différences s'arrête :
/// le texte est montré comme entièrement remplacé, plutôt que de faire attendre.
pub const MAX_CHANGED_LINES: usize = 1_000;

/// Une ligne de la comparaison de deux textes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Difference {
    /// La ligne est dans les deux textes.
    Same(String),
    /// La ligne n'est que dans le premier texte.
    Removed(String),
    /// La ligne n'est que dans le second texte.
    Added(String),
}

/// Ce qui change d'`old` à `new`, ligne par ligne, dans l'ordre des deux textes : le moins de
/// lignes ajoutées ou retirées possible (algorithme de Myers), les lignes retirées avant les
/// lignes ajoutées à leur place.
#[must_use]
pub fn differences(old: &str, new: &str) -> Vec<Difference> {
    let old: Vec<&str> = old.lines().collect();
    let new: Vec<&str> = new.lines().collect();
    compared(&old, &new)
}

/// Ce qui change d'`old` à `new`, mot par mot : chaque morceau garde ses espaces et ses retours à
/// la ligne, si bien que les morceaux mis bout à bout redonnent les textes ; les morceaux voisins
/// de même sorte sont réunis.
#[must_use]
pub fn word_differences(old: &str, new: &str) -> Vec<Difference> {
    let mut merged: Vec<Difference> = Vec::new();
    for difference in compared(&words(old), &words(new)) {
        match (merged.last_mut(), difference) {
            (Some(Difference::Same(last)), Difference::Same(next))
            | (Some(Difference::Removed(last)), Difference::Removed(next))
            | (Some(Difference::Added(last)), Difference::Added(next)) => last.push_str(&next),
            (_, difference) => merged.push(difference),
        }
    }
    merged
}

/// Les mots et les suites d'espaces du texte, dans l'ordre.
fn words(text: &str) -> Vec<&str> {
    let mut result = Vec::new();
    let mut start = 0;
    let mut previous_space = None;
    for (at, character) in text.char_indices() {
        let space = character.is_whitespace();
        if previous_space.is_some_and(|previous| previous != space) {
            result.push(&text[start..at]);
            start = at;
        }
        previous_space = Some(space);
    }
    if start < text.len() {
        result.push(&text[start..]);
    }
    result
}

/// Les différences entre deux suites de morceaux (lignes ou mots).
fn compared(old: &[&str], new: &[&str]) -> Vec<Difference> {
    let prefix = old.iter().zip(new).take_while(|(a, b)| a == b).count();
    let suffix = old[prefix..]
        .iter()
        .rev()
        .zip(new[prefix..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let same = |lines: &[&str]| {
        lines
            .iter()
            .map(|l| Difference::Same((*l).to_owned()))
            .collect::<Vec<_>>()
    };
    let mut result = same(&old[..prefix]);
    result.extend(middle(
        &old[prefix..old.len() - suffix],
        &new[prefix..new.len() - suffix],
    ));
    result.extend(same(&old[old.len() - suffix..]));
    result
}

/// Les différences entre deux suites de lignes qui ne commencent ni ne finissent pareil.
fn middle(old: &[&str], new: &[&str]) -> Vec<Difference> {
    match shortest_edit(old, new) {
        Some(trace) => backtrack(old, new, &trace),
        None => old
            .iter()
            .map(|l| Difference::Removed((*l).to_owned()))
            .chain(new.iter().map(|l| Difference::Added((*l).to_owned())))
            .collect(),
    }
}

/// Pour chaque nombre de changements `d`, la ligne d'`old` atteinte le plus loin sur chaque
/// diagonale `k` de `-d` à `d` (à l'indice `k + d`) ; rien au-delà de [`MAX_CHANGED_LINES`].
fn shortest_edit(old: &[&str], new: &[&str]) -> Option<Vec<Vec<usize>>> {
    let (n, m) = (old.len(), new.len());
    let mut trace: Vec<Vec<usize>> = Vec::new();
    // Il ne faut jamais plus de `n + m` changements : la boucle finit toujours avant.
    for d in 0..=MAX_CHANGED_LINES {
        let mut reached = vec![0; 2 * d + 1];
        for index in (0..=2 * d).step_by(2) {
            let mut x = match trace.last() {
                None => 0,
                Some(previous) => from_previous(previous, index, d).1,
            };
            let mut y = x + d - index;
            while x < n && y < m && old[x] == new[y] {
                x += 1;
                y += 1;
            }
            reached[index] = x;
            if x >= n && y >= m {
                trace.push(reached);
                return Some(trace);
            }
        }
        trace.push(reached);
    }
    None
}

/// D'où vient la diagonale `index` (sur `2d + 1`) au pas `d` : l'indice de la diagonale du pas
/// précédent, et la ligne d'`old` où elle arrive après ce changement.
fn from_previous(previous: &[usize], index: usize, d: usize) -> (usize, usize) {
    // Au pas précédent, la diagonale `k` est à l'indice `k + d - 1` : `index - 1`.
    let down = index == 0 || (index != 2 * d && previous[index - 2] < previous[index]);
    if down {
        (index, previous[index])
    } else {
        (index - 2, previous[index - 2] + 1)
    }
}

/// Le chemin trouvé, relu de la fin vers le début.
fn backtrack(old: &[&str], new: &[&str], trace: &[Vec<usize>]) -> Vec<Difference> {
    let (mut x, mut y) = (old.len(), new.len());
    let mut reversed = Vec::new();
    for d in (0..trace.len()).rev() {
        let index = x + d - y;
        let (previous_x, previous_y) = match d.checked_sub(1).map(|p| &trace[p]) {
            None => (0, 0),
            Some(previous) => {
                let (from, _) = from_previous(previous, index, d);
                let previous_x = previous[from];
                (previous_x, previous_x + d - 1 - from)
            }
        };
        while x > previous_x && y > previous_y {
            reversed.push(Difference::Same(old[x - 1].to_owned()));
            x -= 1;
            y -= 1;
        }
        if d > 0 {
            if x == previous_x {
                reversed.push(Difference::Added(new[y - 1].to_owned()));
            } else {
                reversed.push(Difference::Removed(old[x - 1].to_owned()));
            }
        }
        (x, y) = (previous_x, previous_y);
    }
    reversed.reverse();
    reversed
}

#[cfg(test)]
mod tests {
    use super::*;

    use Difference::{Added, Removed, Same};

    fn same(text: &str) -> Difference {
        Same(text.to_owned())
    }

    fn removed(text: &str) -> Difference {
        Removed(text.to_owned())
    }

    fn added(text: &str) -> Difference {
        Added(text.to_owned())
    }

    #[test]
    fn identical_texts_have_only_same_lines() {
        assert_eq!(differences("# A\nb", "# A\nb"), [same("# A"), same("b")]);
    }

    #[test]
    fn an_added_line_is_marked_where_it_appears() {
        assert_eq!(
            differences("# A\nc", "# A\nb\nc"),
            [same("# A"), added("b"), same("c")]
        );
    }

    #[test]
    fn a_removed_line_is_marked_where_it_was() {
        assert_eq!(
            differences("# A\nb\nc", "# A\nc"),
            [same("# A"), removed("b"), same("c")]
        );
    }

    #[test]
    fn a_changed_line_is_removed_then_added() {
        assert_eq!(
            differences("# A\nb\nc", "# A\nB\nc"),
            [same("# A"), removed("b"), added("B"), same("c")]
        );
    }

    #[test]
    fn the_fewest_lines_change_in_the_middle_of_both_texts() {
        assert_eq!(
            differences("a\nb\nc\na\nb\nb\na", "c\nb\na\nb\na\nc"),
            [
                removed("a"),
                removed("b"),
                same("c"),
                added("b"),
                same("a"),
                same("b"),
                removed("b"),
                same("a"),
                added("c"),
            ]
        );
    }

    #[test]
    fn an_empty_text_compares_to_all_lines() {
        assert_eq!(differences("", "a\nb"), [added("a"), added("b")]);
        assert_eq!(differences("a", ""), [removed("a")]);
        assert_eq!(differences("", ""), []);
    }

    #[test]
    fn a_changed_word_is_removed_then_added_in_its_sentence() {
        assert_eq!(
            word_differences("Les note sont là.", "Les notes sont là."),
            [
                same("Les "),
                removed("note"),
                added("notes"),
                same(" sont là.")
            ]
        );
    }

    #[test]
    fn words_compare_with_their_spaces_and_line_breaks() {
        assert_eq!(
            word_differences("un\ndeux  trois", "un\ndeux trois quatre"),
            [
                same("un\ndeux"),
                removed("  "),
                added(" "),
                same("trois"),
                added(" quatre"),
            ]
        );
    }

    #[test]
    fn identical_or_empty_texts_have_no_change() {
        assert_eq!(
            word_differences("même texte", "même texte"),
            [same("même texte")]
        );
        assert_eq!(word_differences("", ""), []);
        assert_eq!(word_differences("", "neuf"), [added("neuf")]);
    }

    #[test]
    fn too_many_changes_show_the_text_as_replaced() {
        let old = (0..=MAX_CHANGED_LINES)
            .map(|n| format!("a{n}\n"))
            .collect::<String>();
        let new = (0..=MAX_CHANGED_LINES)
            .map(|n| format!("b{n}\n"))
            .collect::<String>();
        let found = differences(&format!("x\n{old}y"), &format!("x\n{new}y"));
        assert_eq!(found.len(), 2 * (MAX_CHANGED_LINES + 1) + 2);
        assert_eq!(found[0], same("x"));
        assert_eq!(found[1], removed("a0"));
        assert_eq!(found[MAX_CHANGED_LINES + 2], added("b0"));
        assert_eq!(found[found.len() - 1], same("y"));
    }

    #[test]
    fn as_many_changes_as_allowed_are_still_found() {
        let old = (0..MAX_CHANGED_LINES / 2)
            .map(|n| format!("a{n}\n"))
            .collect::<String>();
        let new = (0..MAX_CHANGED_LINES / 2)
            .map(|n| format!("b{n}\n"))
            .collect::<String>();
        let found = differences(&format!("{old}z"), &format!("{new}z"));
        assert_eq!(found.len(), MAX_CHANGED_LINES + 1);
        assert_eq!(found[found.len() - 1], same("z"));
    }
}
