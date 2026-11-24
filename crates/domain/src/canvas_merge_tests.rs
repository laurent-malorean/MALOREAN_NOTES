use crate::canvas::{Canvas, CardKind};

fn canvas(cards: &[(&str, i64)], arrows: &[(&str, &str, &str)]) -> Canvas {
    let nodes: Vec<String> = cards
        .iter()
        .map(|(id, x)| {
            format!(r#"{{"id":"{id}","type":"text","text":"","x":{x},"y":0,"width":1,"height":1}}"#)
        })
        .collect();
    let edges: Vec<String> = arrows
        .iter()
        .map(|(id, from, to)| format!(r#"{{"id":"{id}","fromNode":"{from}","toNode":"{to}"}}"#))
        .collect();
    Canvas::parse(&format!(
        r#"{{"nodes":[{}],"edges":[{}]}}"#,
        nodes.join(","),
        edges.join(",")
    ))
    .unwrap()
}

fn cards(canvas: &Canvas) -> Vec<(String, i64)> {
    canvas.cards.iter().map(|c| (c.id.clone(), c.x)).collect()
}

fn pairs(list: &[(&str, i64)]) -> Vec<(String, i64)> {
    list.iter().map(|(id, x)| ((*id).to_owned(), *x)).collect()
}

#[test]
fn what_changed_on_one_side_only_is_kept() {
    let base = canvas(&[("a", 0), ("b", 0)], &[]);
    let mine = canvas(&[("a", 5), ("b", 0)], &[]);
    let theirs = canvas(&[("a", 0), ("b", 7)], &[]);
    let merged = Canvas::merged(&base, &mine, &theirs);
    assert_eq!(cards(&merged), pairs(&[("a", 5), ("b", 7)]));
}

#[test]
fn a_card_changed_on_both_sides_takes_my_version() {
    let base = canvas(&[("a", 0)], &[]);
    let mine = canvas(&[("a", 5)], &[]);
    let theirs = canvas(&[("a", 9)], &[]);
    assert_eq!(
        cards(&Canvas::merged(&base, &mine, &theirs)),
        pairs(&[("a", 5)])
    );
}

#[test]
fn added_cards_from_both_sides_are_all_kept() {
    let base = canvas(&[("a", 0)], &[]);
    let mine = canvas(&[("a", 0), ("m", 1)], &[]);
    let theirs = canvas(&[("a", 0), ("t", 2)], &[]);
    let merged = Canvas::merged(&base, &mine, &theirs);
    assert_eq!(cards(&merged), pairs(&[("a", 0), ("m", 1), ("t", 2)]));
}

#[test]
fn a_card_deleted_on_one_side_goes_unless_the_other_side_changed_it() {
    let base = canvas(&[("a", 0), ("b", 0)], &[]);
    let mine = canvas(&[("b", 0)], &[]);
    let theirs = canvas(&[("a", 0), ("b", 0)], &[]);
    assert_eq!(
        cards(&Canvas::merged(&base, &mine, &theirs)),
        pairs(&[("b", 0)])
    );
    let theirs_changed = canvas(&[("a", 3), ("b", 0)], &[]);
    assert_eq!(
        cards(&Canvas::merged(&base, &mine, &theirs_changed)),
        pairs(&[("b", 0), ("a", 3)])
    );
    assert_eq!(
        cards(&Canvas::merged(&base, &theirs, &mine)),
        pairs(&[("b", 0)])
    );
    let mine_changed = canvas(&[("a", 4), ("b", 0)], &[]);
    let theirs_deleted = canvas(&[("b", 0)], &[]);
    assert_eq!(
        cards(&Canvas::merged(&base, &mine_changed, &theirs_deleted)),
        pairs(&[("a", 4), ("b", 0)])
    );
}

#[test]
fn a_card_deleted_on_both_sides_is_gone() {
    let base = canvas(&[("a", 0), ("b", 0)], &[]);
    let both = canvas(&[("b", 0)], &[]);
    assert_eq!(
        cards(&Canvas::merged(&base, &both, &both)),
        pairs(&[("b", 0)])
    );
}

#[test]
fn an_arrow_follows_its_cards() {
    let base = canvas(&[("a", 0), ("b", 0)], &[("e", "a", "b")]);
    let mine = canvas(&[("a", 0)], &[]);
    let theirs = canvas(&[("a", 0), ("b", 0)], &[("e", "a", "b"), ("f", "b", "a")]);
    let merged = Canvas::merged(&base, &mine, &theirs);
    assert!(merged.arrows.is_empty());
    let kept = Canvas::merged(&base, &base, &theirs);
    assert_eq!(kept.arrows.len(), 2);
}

#[test]
fn the_stacking_order_is_mine() {
    let base = canvas(&[("a", 0), ("b", 0)], &[]);
    let mine = canvas(&[("b", 0), ("a", 0)], &[]);
    let merged = Canvas::merged(&base, &mine, &base);
    assert_eq!(cards(&merged), pairs(&[("b", 0), ("a", 0)]));
    assert!(matches!(merged.cards[0].kind, CardKind::Text { .. }));
}

#[test]
fn unknown_root_properties_follow_the_side_that_changed_them() {
    let with =
        |extra: &str| Canvas::parse(&format!(r#"{{"nodes":[],"edges":[]{extra}}}"#)).unwrap();
    let base = with("");
    let theirs = with(r#","k":1"#);
    assert_eq!(Canvas::merged(&base, &base, &theirs).extra, theirs.extra);
    assert_eq!(Canvas::merged(&base, &theirs, &base).extra, theirs.extra);
}
