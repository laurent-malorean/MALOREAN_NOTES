use proptest::prelude::*;

use super::*;

fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

/// Les contenus de l'espace : Courses, Agenda, un canvas et deux homonymes « Idée ».
fn links() -> LinkIndex {
    LinkIndex::new([
        (path("courses.md"), "Courses".to_owned()),
        (path("agenda.md"), "Agenda".to_owned()),
        (path("plan.canvas"), "plan".to_owned()),
        (path("A/idee.md"), "Idée".to_owned()),
        (path("B/idee.md"), "Idée".to_owned()),
    ])
}

fn favorites(text: &str) -> Vec<String> {
    favorites_of(text, &links())
        .iter()
        .map(NotePath::to_path)
        .collect()
}

#[test]
fn a_line_made_of_a_link_alone_is_a_favorite_with_or_without_a_list_mark() {
    for line in [
        "[[Courses]]",
        "- [[Courses]]",
        "* [[Courses]]",
        "1. [[Courses]]",
        "12. [[Courses]]",
        "  - [[Courses]]  ",
        "\t- [[Courses]]",
        "-   [[Courses]]",
        "  [[Courses]] ",
    ] {
        assert_eq!(favorites(line), ["courses.md"], "{line:?}");
    }
}

#[test]
fn a_link_in_a_sentence_or_with_other_links_or_marks_is_not_a_favorite() {
    for line in [
        "Voir [[Courses]]",
        "[[Courses]] à faire",
        "- voir [[Courses]] demain",
        "[[Courses]] [[Agenda]]",
        "[[Courses]], [[Agenda]]",
        "- [ ] [[Courses]]",
        "+ [[Courses]]",
        "-[[Courses]]",
        "1.[[Courses]]",
        ". [[Courses]]",
        "# [[Courses]]",
        "[[Courses]]]]",
        "[[[[Courses]]",
        "[[Courses",
        "[[]]",
        "[[ ]]",
        "- ",
        "",
    ] {
        assert!(favorites(line).is_empty(), "{line:?}");
    }
}

#[test]
fn a_link_with_a_shown_text_designates_its_target() {
    assert_eq!(favorites("- [[Courses|ma liste]]"), ["courses.md"]);
}

#[test]
fn a_canvas_and_a_folder_qualified_link_designate_their_content() {
    assert_eq!(
        favorites("- [[plan.canvas]]\n- [[A/Idée]]"),
        ["plan.canvas", "A/idee.md"]
    );
}

#[test]
fn a_link_to_nothing_or_to_twins_designates_no_content() {
    assert!(favorites("- [[Inconnu]]\n- [[Idée]]").is_empty());
}

#[test]
fn favorites_come_in_the_order_of_the_note_each_once() {
    let text = "# Favoris\n\n## Travail\n- [[Agenda]]\n\n## Maison\n- [[Courses]]\n- [[agenda]]\n";
    assert_eq!(favorites(text), ["agenda.md", "courses.md"]);
}

#[test]
fn a_note_without_favorites_or_empty_has_none() {
    assert!(favorites("").is_empty());
    assert!(favorites("# Favoris\n\nRien encore.").is_empty());
}

#[test]
fn the_header_is_not_read() {
    let text = "---\ntags:\n- [[Courses]]\n---\n- [[Agenda]]\n";
    assert_eq!(favorites(text), ["agenda.md"]);
}

#[test]
fn lines_ending_with_crlf_are_read() {
    assert_eq!(
        favorites("# Favoris\r\n- [[Courses]]\r\n- [[Agenda]]\r\n"),
        ["courses.md", "agenda.md"]
    );
}

#[test]
fn a_content_is_a_favorite_only_when_a_line_designates_it() {
    let text = "- [[Courses]]\nvoir [[Agenda]]\n";
    assert!(is_favorite(text, &links(), &path("courses.md")));
    assert!(!is_favorite(text, &links(), &path("agenda.md")));
    assert!(!is_favorite("", &links(), &path("courses.md")));
}

#[test]
fn a_favorite_is_added_at_the_end_on_its_own_line() {
    assert_eq!(
        with_favorite("# Favoris\n\n- [[Agenda]]\n", "Courses"),
        "# Favoris\n\n- [[Agenda]]\n- [[Courses]]\n"
    );
}

#[test]
fn a_favorite_is_added_after_a_last_line_without_line_end() {
    assert_eq!(
        with_favorite("# Favoris", "Courses"),
        "# Favoris\n- [[Courses]]\n"
    );
}

#[test]
fn a_favorite_is_added_to_an_empty_note() {
    assert_eq!(with_favorite("", "Courses"), "- [[Courses]]\n");
}

#[test]
fn a_favorite_is_added_with_the_line_ends_of_the_note() {
    assert_eq!(
        with_favorite("# Favoris\r\n- [[Agenda]]", "Courses"),
        "# Favoris\r\n- [[Agenda]]\r\n- [[Courses]]\r\n"
    );
}

#[test]
fn a_favorite_is_added_after_a_header_alone() {
    assert_eq!(
        with_favorite("---\ntags: [a]\n---", "Courses"),
        "---\ntags: [a]\n---\n- [[Courses]]\n"
    );
}

#[test]
fn a_link_with_a_folder_is_written_as_the_link_menu_gives_it() {
    assert_eq!(with_favorite("", "A/Idée"), "- [[A/Idée]]\n");
}

#[test]
fn every_line_designating_the_content_is_removed_doubles_included() {
    let text = "# Favoris\n- [[Courses]]\n- [[Agenda]]\n1. [[courses]]\nvoir [[Courses]]\n";
    let removal = without_favorite(text, &links(), &path("courses.md"));
    assert_eq!(removal.text, "# Favoris\n- [[Agenda]]\nvoir [[Courses]]\n");
    assert_eq!(
        removal.removed,
        [
            RemovedLine {
                index: 1,
                text: "- [[Courses]]\n".to_owned()
            },
            RemovedLine {
                index: 3,
                text: "1. [[courses]]\n".to_owned()
            },
        ]
    );
}

#[test]
fn removing_a_content_that_is_not_a_favorite_changes_nothing() {
    let text = "# Favoris\nvoir [[Courses]]\n- [[Agenda]]";
    let removal = without_favorite(text, &links(), &path("courses.md"));
    assert_eq!(removal.text, text);
    assert!(removal.removed.is_empty());
}

#[test]
fn a_last_line_without_line_end_is_removed_with_what_it_is() {
    let removal = without_favorite("a\n- [[Courses]]", &links(), &path("courses.md"));
    assert_eq!(removal.text, "a\n");
    assert_eq!(
        removal.removed,
        [RemovedLine {
            index: 1,
            text: "- [[Courses]]".to_owned()
        }]
    );
}

#[test]
fn the_header_is_kept_when_a_favorite_is_removed() {
    let text = "---\ntags: [a]\n---\n- [[Courses]]\n";
    let removal = without_favorite(text, &links(), &path("courses.md"));
    assert_eq!(removal.text, "---\ntags: [a]\n---\n");
    assert_eq!(removal.removed[0].index, 0);
}

#[test]
fn removed_lines_are_put_back_where_they_were() {
    let text = "# Favoris\n- [[Courses]]\n- [[Agenda]]\n1. [[courses]]\nfin\n";
    let removal = without_favorite(text, &links(), &path("courses.md"));
    assert_eq!(with_lines_back(&removal.text, &removal.removed), text);
}

#[test]
fn a_last_line_without_line_end_is_put_back_as_it_was() {
    for text in [
        "a\n- [[Courses]]",
        "- [[Courses]]",
        "- [[Courses]]\n- [[Courses]]",
    ] {
        let removal = without_favorite(text, &links(), &path("courses.md"));
        assert_eq!(with_lines_back(&removal.text, &removal.removed), text);
    }
}

#[test]
fn lines_are_put_back_in_a_note_that_changed_since() {
    let removed = [
        RemovedLine {
            index: 4,
            text: "- [[Courses]]\n".to_owned(),
        },
        RemovedLine {
            index: 0,
            text: "- [[Agenda]]\n".to_owned(),
        },
    ];
    assert_eq!(
        with_lines_back("a\nb\n", &removed),
        "- [[Agenda]]\na\nb\n- [[Courses]]\n"
    );
    assert_eq!(
        with_lines_back("a\nb", &removed[..1]),
        "a\nb\n- [[Courses]]\n"
    );
}

#[test]
fn a_line_without_line_end_never_glues_to_the_next_one() {
    let removed = [RemovedLine {
        index: 0,
        text: "- [[Courses]]".to_owned(),
    }];
    assert_eq!(with_lines_back("a\n", &removed), "- [[Courses]]\na\n");
}

#[test]
fn nothing_put_back_changes_nothing() {
    assert_eq!(with_lines_back("a\nb", &[]), "a\nb");
}

fn line_pool() -> impl Strategy<Value = &'static str> {
    prop::sample::select(vec![
        "a",
        "",
        "- [[Courses]]",
        "[[Courses]]",
        "* [[Courses]]",
        "1. [[courses]]",
        "- [[Agenda]]",
        "voir [[Courses]] demain",
        "# Titre",
    ])
}

proptest! {
    #[test]
    fn removing_then_putting_back_gives_the_text_again(
        lines in prop::collection::vec(line_pool(), 0..8),
        windows in any::<bool>(),
        final_end in any::<bool>(),
    ) {
        let line_end = if windows { "\r\n" } else { "\n" };
        let mut text = lines.join(line_end);
        if final_end && !lines.is_empty() {
            text.push_str(line_end);
        }
        let removal = without_favorite(&text, &links(), &path("courses.md"));
        prop_assert!(!is_favorite(&removal.text, &links(), &path("courses.md")));
        prop_assert_eq!(with_lines_back(&removal.text, &removal.removed), text);
    }

    #[test]
    fn an_added_favorite_is_a_favorite_and_the_others_stay(
        lines in prop::collection::vec(line_pool(), 0..8),
    ) {
        let text = lines.join("\n");
        let added = with_favorite(&text, "plan.canvas");
        prop_assert!(is_favorite(&added, &links(), &path("plan.canvas")));
        prop_assert!(added.ends_with("- [[plan.canvas]]\n"));
        let mut expected = favorites_of(&text, &links());
        expected.push(path("plan.canvas"));
        prop_assert_eq!(favorites_of(&added, &links()), expected);
    }
}
