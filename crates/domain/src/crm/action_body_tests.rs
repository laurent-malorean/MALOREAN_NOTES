use super::*;

const SPEC: &str = "\nPour 3 postes. Voir le [[plan de la salle]].\n\n#### Liste à cocher : Préparation\n- [x] Relire la demande\n- [ ] Chiffrer\n\n#### Commentaires\n- 2026-11-24 10:32 · Rappelé, pas de réponse.\n  Retenter jeudi.\n";

fn at(text: &str) -> DayTime {
    DayTime::parse(text).unwrap()
}

fn item(done: bool, text: &str) -> ChecklistItem {
    ChecklistItem {
        done,
        text: text.to_owned(),
    }
}

fn checklist(name: &str, items: Vec<ChecklistItem>) -> Checklist {
    Checklist {
        name: name.to_owned(),
        items,
    }
}

fn comment(moment: &str, text: &str) -> Comment {
    Comment {
        at: at(moment),
        text: text.to_owned(),
    }
}

#[test]
fn an_action_text_is_read_as_description_checklists_and_comments() {
    let body = Body::parse(SPEC);
    assert_eq!(
        body.description,
        "Pour 3 postes. Voir le [[plan de la salle]]."
    );
    assert_eq!(
        body.checklists,
        vec![checklist(
            "Préparation",
            vec![item(true, "Relire la demande"), item(false, "Chiffrer")]
        )]
    );
    assert_eq!(
        body.comments,
        vec![comment(
            "2026-11-24 10:32",
            "Rappelé, pas de réponse.\nRetenter jeudi."
        )]
    );
}

#[test]
fn an_empty_text_says_nothing() {
    assert_eq!(Body::parse(""), Body::default());
    assert_eq!(Body::parse("\n\n  \n"), Body::default());
}

#[test]
fn the_progress_of_a_checklist_counts_the_checked_items() {
    let list = checklist(
        "L",
        vec![item(true, "a"), item(false, "b"), item(true, "c")],
    );
    assert_eq!(list.progress(), (2, 3));
    assert_eq!(checklist("L", vec![]).progress(), (0, 0));
}

#[test]
fn the_parts_can_follow_each_other_in_any_order() {
    let text = "Début\n\n#### Commentaires\n- 2026-11-24 10:32 · Un\n\n#### Liste à cocher : A\n- [ ] x\n\n#### Liste à cocher : B\n- [x] y\n\n#### Commentaires\n- 2026-11-25 09:00 · Deux\n";
    let body = Body::parse(text);
    assert_eq!(body.description, "Début");
    assert_eq!(
        body.checklists
            .iter()
            .map(|l| l.name.as_str())
            .collect::<Vec<_>>(),
        ["A", "B"]
    );
    assert_eq!(
        body.comments,
        vec![
            comment("2026-11-24 10:32", "Un"),
            comment("2026-11-25 09:00", "Deux")
        ]
    );
}

#[test]
fn a_description_may_hold_other_headings_and_lists() {
    let text = "#### Contexte\n- [ ] pas une liste\n\nSuite.\n";
    let body = Body::parse(text);
    assert_eq!(
        body.description,
        "#### Contexte\n- [ ] pas une liste\n\nSuite."
    );
    assert!(body.checklists.is_empty());
}

#[test]
fn a_heading_that_only_starts_like_a_part_is_text() {
    for line in [
        "#### Liste à cocherz",
        "#### Liste à cocher supplémentaire",
        "#### Commentaires bis",
        "### Commentaires",
        "#### commentaires",
    ] {
        let body = Body::parse(&format!("{line}\n- [ ] a\n"));
        assert_eq!(body.description, format!("{line}\n- [ ] a"), "{line}");
    }
}

#[test]
fn a_checklist_name_is_whatever_follows_the_colon() {
    let name = |line: &str| {
        Body::parse(&format!("{line}\n- [ ] a\n")).checklists[0]
            .name
            .clone()
    };
    assert_eq!(name("#### Liste à cocher : Préparation"), "Préparation");
    assert_eq!(name("#### Liste à cocher:Préparation"), "Préparation");
    assert_eq!(name("#### Liste à cocher :  Un : deux  "), "Un : deux");
    assert_eq!(name("#### Liste à cocher :"), "");
    assert_eq!(name("#### Liste à cocher"), "");
}

#[test]
fn an_item_is_a_bullet_with_a_checkbox() {
    let items = |text: &str| {
        Body::parse(&format!("#### Liste à cocher : L\n{text}\n")).checklists[0]
            .items
            .clone()
    };
    assert_eq!(
        items("- [ ] a\n* [x] b\n+ [X] c\n  - [ ]   d  "),
        vec![
            item(false, "a"),
            item(true, "b"),
            item(true, "c"),
            item(false, "d")
        ]
    );
    assert_eq!(items("- [ ]"), vec![item(false, "")]);
}

#[test]
fn a_line_that_has_no_place_in_a_checklist_ends_the_description() {
    let text = "Début\n\n#### Liste à cocher : L\n- [ ] a\nun texte perdu\n- [x] b\n- [?] c\n\n#### Commentaires\n- 2026-11-24 10:32 · Un\nretrait manquant\n  Suite\n";
    let body = Body::parse(text);
    assert_eq!(
        body.description,
        "Début\n\nun texte perdu\n- [?] c\nretrait manquant"
    );
    assert_eq!(
        body.checklists[0].items,
        vec![item(false, "a"), item(true, "b")]
    );
    assert_eq!(
        body.comments,
        vec![comment("2026-11-24 10:32", "Un\nSuite")]
    );
}

#[test]
fn an_indented_line_right_after_the_comments_title_has_no_comment_to_continue() {
    let body = Body::parse("#### Commentaires\n  orphelin\n- 2026-11-24 10:32 · Un\n");
    assert_eq!(body.description, "  orphelin");
    assert_eq!(body.comments, vec![comment("2026-11-24 10:32", "Un")]);
}

#[test]
fn a_comment_starts_with_a_valid_moment_and_a_dot() {
    let body = Body::parse(
        "#### Commentaires\n- 2026-13-24 10:32 · mois faux\n- hier · pas de date\n- 2026-11-24 10:32 sans point\n- 2026-11-24 10:32 · ok\n",
    );
    assert_eq!(body.comments, vec![comment("2026-11-24 10:32", "ok")]);
    assert_eq!(
        body.description,
        "- 2026-13-24 10:32 · mois faux\n- hier · pas de date\n- 2026-11-24 10:32 sans point"
    );
}

#[test]
fn a_comment_may_be_empty_hold_a_dot_and_span_lines_with_blank_ones() {
    let body = Body::parse(
        "#### Commentaires\n- 2026-11-24 10:32 ·\n- 2026-11-24 10:33 · a · b\n  ligne 2\n\n  ligne 4\n    indenté\n- 2026-11-24 10:34 · fin\n\n\n",
    );
    assert_eq!(
        body.comments,
        vec![
            comment("2026-11-24 10:32", ""),
            comment("2026-11-24 10:33", "a · b\nligne 2\n\nligne 4\n  indenté"),
            comment("2026-11-24 10:34", "fin"),
        ]
    );
}

#[test]
fn a_code_block_hides_the_titles_of_parts() {
    let text =
        "Avant\n```\n#### Commentaires\n- 2026-11-24 10:32 · pas un commentaire\n```\nAprès\n";
    let body = Body::parse(text);
    assert_eq!(body.description, text.trim());
    assert!(body.comments.is_empty());
}

#[test]
fn a_code_fence_inside_a_part_ends_up_in_the_description() {
    let text = "#### Liste à cocher : L\n- [ ] a\n~~~\n#### Commentaires\n~~~\n- [x] b\n";
    let body = Body::parse(text);
    assert_eq!(body.description, "~~~\n#### Commentaires\n~~~");
    assert_eq!(
        body.checklists[0].items,
        vec![item(false, "a"), item(true, "b")]
    );
    assert!(body.comments.is_empty());
}

#[test]
fn rewriting_without_change_keeps_each_part_as_it_was_written() {
    let text = "\nDescription.\n\n#### Commentaires\n- 2026-11-24 10:32 · Un\n    retrait de quatre\n\n#### Liste à cocher : L\n* [X] fait\n";
    let body = Body::parse(text);
    assert_eq!(
        rewritten(text, &body),
        "\nDescription.\n\n#### Liste à cocher : L\n* [X] fait\n\n#### Commentaires\n- 2026-11-24 10:32 · Un\n    retrait de quatre\n"
    );
}

#[test]
fn rewriting_puts_the_parts_in_order_description_checklists_comments() {
    let text = "\n#### Commentaires\n- 2026-11-24 10:32 · Un\n\n#### Liste à cocher : A\n- [ ] x\n\nDescription ignorée plus bas\n";
    let body = Body::parse(text);
    let new = rewritten(text, &body);
    assert_eq!(
        new,
        "\nDescription ignorée plus bas\n\n#### Liste à cocher : A\n- [ ] x\n\n#### Commentaires\n- 2026-11-24 10:32 · Un\n"
    );
    assert_eq!(Body::parse(&new), body);
}

#[test]
fn changing_the_description_rewrites_only_the_description() {
    let body = Body {
        description: "Nouvelle\n\ndescription.".to_owned(),
        ..Body::parse(SPEC)
    };
    assert_eq!(
        rewritten(SPEC, &body),
        SPEC.replace(
            "Pour 3 postes. Voir le [[plan de la salle]].",
            "Nouvelle\n\ndescription."
        )
    );
}

#[test]
fn changing_one_checklist_rewrites_only_that_one() {
    let text = "\n#### Liste à cocher : A\n* [X] a\n\n#### Liste à cocher : B\n* [ ] b\n";
    let mut body = Body::parse(text);
    body.checklists[1].items[0].done = true;
    assert_eq!(
        rewritten(text, &body),
        "\n#### Liste à cocher : A\n* [X] a\n\n#### Liste à cocher : B\n- [x] b\n"
    );
}

#[test]
fn removing_a_checklist_keeps_the_others_untouched_even_when_they_shift() {
    let text = "\n#### Liste à cocher : A\n* [X] a\n\n#### Liste à cocher : B\n* [ ] b\n";
    let mut body = Body::parse(text);
    body.checklists.remove(0);
    assert_eq!(
        rewritten(text, &body),
        "\n#### Liste à cocher : B\n* [ ] b\n"
    );
}

#[test]
fn a_new_checklist_is_written_after_the_others() {
    let text = "\n#### Liste à cocher : A\n* [X] a\n";
    let mut body = Body::parse(text);
    body.checklists.push(checklist(
        "  Deuxième\nliste ",
        vec![item(true, "un\ndeux"), item(false, "")],
    ));
    body.checklists.push(checklist("", vec![]));
    assert_eq!(
        rewritten(text, &body),
        "\n#### Liste à cocher : A\n* [X] a\n\n#### Liste à cocher : Deuxième liste\n- [x] un deux\n- [ ] \n\n#### Liste à cocher :\n"
    );
}

#[test]
fn changing_the_comments_rewrites_them_in_one_part() {
    let text = "\n#### Commentaires\n- 2026-11-24 10:32 · Un\n\n#### Commentaires\n- 2026-11-25 09:00 · Deux\n";
    let mut body = Body::parse(text);
    body.comments
        .push(comment("2026-11-26 08:05", "Trois\n\n  suite\nfin"));
    let new = rewritten(text, &body);
    assert_eq!(
        new,
        "\n#### Commentaires\n- 2026-11-24 10:32 · Un\n- 2026-11-25 09:00 · Deux\n- 2026-11-26 08:05 · Trois\n\n    suite\n  fin\n"
    );
    assert_eq!(Body::parse(&new), body);
}

#[test]
fn removing_every_comment_removes_the_part() {
    let mut body = Body::parse(SPEC);
    body.comments.clear();
    assert_eq!(
        rewritten(SPEC, &body),
        "\nPour 3 postes. Voir le [[plan de la salle]].\n\n#### Liste à cocher : Préparation\n- [x] Relire la demande\n- [ ] Chiffrer\n"
    );
}

#[test]
fn a_body_that_says_nothing_is_written_as_nothing() {
    assert_eq!(rewritten(SPEC, &Body::default()), "");
    assert_eq!(rewritten("", &Body::default()), "");
}

#[test]
fn a_new_body_is_written_and_read_back_the_same() {
    let body = Body {
        description: "\n\nUn texte.\n\nEt un autre.\n".to_owned(),
        checklists: vec![checklist("A", vec![item(false, "x")])],
        comments: vec![comment("2026-01-02 03:04", "ok")],
    };
    let written = rewritten("", &body);
    assert_eq!(
        written,
        "\nUn texte.\n\nEt un autre.\n\n#### Liste à cocher : A\n- [ ] x\n\n#### Commentaires\n- 2026-01-02 03:04 · ok\n"
    );
    let expected = Body {
        description: "Un texte.\n\nEt un autre.".to_owned(),
        ..body
    };
    assert_eq!(Body::parse(&written), expected);
}

#[test]
fn the_strays_of_a_part_move_to_the_description_when_the_action_is_rewritten() {
    let text = "\nDébut\n\n#### Liste à cocher : L\n- [ ] a\nperdu\n";
    let body = Body::parse(text);
    assert_eq!(body.description, "Début\n\nperdu");
    assert_eq!(
        rewritten(text, &body),
        "\nDébut\n\nperdu\n\n#### Liste à cocher : L\n- [ ] a\n"
    );
}
