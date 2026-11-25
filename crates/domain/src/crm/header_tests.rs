use super::*;

fn note(yaml: &str) -> String {
    format!("---\n{yaml}\n---\n# T\n")
}

fn scalar_of(yaml: &str, key: &str) -> Option<String> {
    scalar(&note(yaml), key)
}

fn items_of(yaml: &str, key: &str) -> Vec<String> {
    items(&note(yaml), key)
}

#[test]
fn a_single_value_is_read_without_its_quotes_nor_its_comment() {
    assert_eq!(
        scalar_of("site: https://acme.fr", "site"),
        Some("https://acme.fr".to_owned())
    );
    assert_eq!(
        scalar_of("site : \"a b\"  # c", "site"),
        Some("a b".to_owned())
    );
    assert_eq!(scalar_of("site: 'l''an'", "site"), Some("l'an".to_owned()));
    assert_eq!(
        scalar_of("site: \"a\\\"b\\\\\"", "site"),
        Some("a\"b\\".to_owned())
    );
    assert_eq!(
        scalar_of("date: '2026-11-24'", "date"),
        Some("2026-11-24".to_owned())
    );
    assert_eq!(
        scalar_of("adresse: 12 rue des Lilas, Lyon", "adresse"),
        Some("12 rue des Lilas, Lyon".to_owned())
    );
    assert_eq!(scalar_of("a: 'x # y'", "a"), Some("x # y".to_owned()));
    assert_eq!(scalar_of("a: x#y", "a"), Some("x#y".to_owned()));
    assert_eq!(scalar_of("a: [[acme]]", "a"), Some("[[acme]]".to_owned()));
}

#[test]
fn a_missing_empty_or_longer_key_gives_no_value() {
    assert_eq!(scalar_of("site:", "site"), None);
    assert_eq!(scalar_of("site: ''", "site"), None);
    assert_eq!(scalar_of("site: # rien", "site"), None);
    assert_eq!(scalar_of("sites: a", "site"), None);
    assert_eq!(scalar_of("autre: a", "site"), None);
    assert_eq!(scalar_of("  site: a", "site"), None);
    assert_eq!(scalar("# T\nsite: a", "site"), None);
    assert_eq!(scalar("---\nsite: a", "site"), None);
}

#[test]
fn a_key_is_present_even_without_a_value() {
    assert!(has_key(&note("k:"), "k"));
    assert!(has_key(&note("k: []"), "k"));
    assert!(!has_key(&note("autre: 1"), "k"));
    assert!(!has_key("# T", "k"));
}

#[test]
fn the_first_occurrence_of_a_key_counts() {
    assert_eq!(scalar_of("a: 1\na: 2", "a"), Some("1".to_owned()));
}

#[test]
fn a_list_is_read_in_brackets_in_yaml_or_as_a_single_value() {
    let expected = ["a", "b c"].map(str::to_owned).to_vec();
    assert_eq!(items_of("k: [a, 'b c']", "k"), expected);
    assert_eq!(
        items_of("k:\n  - a\n  - \"b c\" # c\nautre: x", "k"),
        expected
    );
    assert_eq!(items_of("k:\n- a\n- b c", "k"), expected);
    assert_eq!(items_of("k: a", "k"), ["a"].map(str::to_owned).to_vec());
    assert_eq!(items_of("k: [ a ,, '' , b c ]", "k"), expected);
    assert_eq!(items_of("k: []", "k"), Vec::<String>::new());
    assert_eq!(items_of("k:", "k"), Vec::<String>::new());
    assert_eq!(items_of("autre: [a]", "k"), Vec::<String>::new());
}

#[test]
fn a_list_item_keeps_its_commas_and_brackets_when_quoted() {
    assert_eq!(
        items_of("k: ['[[a]] · [[b]]', \"x, y\", '[[c]]']", "k"),
        ["[[a]] · [[b]]", "x, y", "[[c]]"]
            .map(str::to_owned)
            .to_vec()
    );
    assert_eq!(
        items_of("k: [[[a]], [[b]]]", "k"),
        ["[[a]]", "[[b]]"].map(str::to_owned).to_vec()
    );
}

#[test]
fn a_comma_inside_nested_brackets_does_not_split_an_item() {
    assert_eq!(
        items_of("k: [[[a, b]], c]", "k"),
        ["[[a, b]]", "c"].map(str::to_owned).to_vec()
    );
    assert_eq!(
        items_of("k: [[x], [y, z], w]", "k"),
        ["[x]", "[y, z]", "w"].map(str::to_owned).to_vec()
    );
}

#[test]
fn a_closing_bracket_without_opening_one_does_not_break_the_next_comma() {
    assert_eq!(
        items_of("k: [a], b, c]", "k"),
        ["a]", "b", "c"].map(str::to_owned).to_vec()
    );
}

#[test]
fn a_reference_written_without_quotes_is_a_single_value_not_a_list() {
    assert_eq!(
        items_of("k: [[acme]]", "k"),
        ["[[acme]]"].map(str::to_owned).to_vec()
    );
}

#[test]
fn a_block_list_stops_at_the_next_property() {
    assert_eq!(
        items_of("k:\n  - a\nautre:\n  - b", "k"),
        ["a"].map(str::to_owned).to_vec()
    );
}

#[test]
fn a_value_is_quoted_only_when_yaml_would_read_it_differently() {
    let line = |value| rendered(value, Style::Line);
    assert_eq!(line("https://acme.fr"), "https://acme.fr");
    assert_eq!(line("12 rue des Lilas, Lyon"), "12 rue des Lilas, Lyon");
    assert_eq!(line("01 23 45 67 89"), "01 23 45 67 89");
    assert_eq!(line("réseau social"), "réseau social");
    assert_eq!(line("e-mail"), "e-mail");
    for risky in [
        "",
        " a",
        "a ",
        "[a]",
        "{a}",
        "&a",
        "*a",
        "!a",
        "|a",
        ">a",
        "'a",
        "\"a",
        "%a",
        "@a",
        "`a",
        "#a",
        ",a",
        "?a",
        "- a",
        "-",
        "a: b",
        "a:",
        "a #b",
        "true",
        "No",
        "null",
        "~",
        "y",
        "123",
        "0612345678",
        "1.5",
        "NaN",
    ] {
        assert_eq!(
            line(risky),
            format!("'{}'", risky.replace('\'', "''")),
            "{risky:?}"
        );
    }
    assert_eq!(line("l'an"), "l'an");
    assert_eq!(rendered("l'an", Style::Always), "'l''an'");
}

#[test]
fn a_bare_value_is_never_quoted() {
    assert_eq!(rendered("12", Style::Bare), "12");
    assert_eq!(scalar_line("rang", "2", Style::Bare), "rang: 2");
    assert_eq!(rendered("12", Style::Line), "'12'");
}

#[test]
fn an_item_of_a_list_in_brackets_is_also_quoted_for_its_signs() {
    assert_eq!(rendered("a, b", Style::Flow), "'a, b'");
    assert_eq!(rendered("a[b", Style::Flow), "'a[b'");
    assert_eq!(rendered("a]b", Style::Flow), "'a]b'");
    assert_eq!(rendered("a{b", Style::Flow), "'a{b'");
    assert_eq!(rendered("a}b", Style::Flow), "'a}b'");
    assert_eq!(rendered("a b", Style::Flow), "a b");
    assert_eq!(rendered("a, b", Style::Line), "a, b");
    assert_eq!(rendered("[[a]]", Style::Always), "'[[a]]'");
}

#[test]
fn a_line_break_in_a_value_becomes_a_space() {
    assert_eq!(rendered("a\nb\r\nc", Style::Line), "a b  c");
}

#[test]
fn what_is_written_is_read_back() {
    for value in [
        "a", "x: y", "l'an", "", "12", "true", "[a]", "a #b", "- a", "é",
    ] {
        let written = with_scalar(&note("type: crm"), "k", Some(value), Style::Line);
        let read = scalar(&written, "k");
        assert_eq!(
            read,
            (!value.is_empty()).then(|| value.to_owned()),
            "{value:?}"
        );
    }
    let list = ["a, b", "[[c]]", "d", "e'f", "g: h"]
        .map(str::to_owned)
        .to_vec();
    for style in [Style::Always, Style::Flow] {
        let written = with_items(&note("type: crm"), "k", &list, style);
        assert_eq!(items(&written, "k"), list);
    }
}

#[test]
fn writing_a_value_changes_only_its_lines() {
    let content = "---\ntype: crm-action\n# un commentaire\nstatut: TODO   \ntags:\n  - a\n  - b\nautre: 1\n---\n# T\ntexte\n";
    let changed = with_scalar(content, "statut", Some("Done"), Style::Line);
    assert_eq!(
        changed,
        "---\ntype: crm-action\n# un commentaire\nstatut: Done\ntags:\n  - a\n  - b\nautre: 1\n---\n# T\ntexte\n"
    );
    let removed = with_items(content, "tags", &[], Style::Flow);
    assert_eq!(
        removed,
        "---\ntype: crm-action\n# un commentaire\nstatut: TODO   \nautre: 1\n---\n# T\ntexte\n"
    );
    let replaced = with_items(content, "tags", &["x".to_owned()], Style::Flow);
    assert_eq!(
        replaced,
        "---\ntype: crm-action\n# un commentaire\nstatut: TODO   \ntags: [x]\nautre: 1\n---\n# T\ntexte\n"
    );
}

#[test]
fn a_new_value_goes_after_the_other_keys_and_an_empty_value_removes_the_key() {
    let content = "---\ntype: crm-personne\n---\n# Jean\n";
    let added = with_scalar(content, "fonction", Some("  Chef  "), Style::Line);
    assert_eq!(
        added,
        "---\ntype: crm-personne\nfonction: Chef\n---\n# Jean\n"
    );
    assert_eq!(
        with_scalar(&added, "fonction", Some("  "), Style::Line),
        content
    );
    assert_eq!(with_scalar(&added, "fonction", None, Style::Line), content);
    assert_eq!(with_scalar(content, "fonction", None, Style::Line), content);
}

#[test]
fn a_header_is_created_for_a_text_without_one() {
    assert_eq!(
        with_scalar("# T\n", "k", Some("v"), Style::Line),
        "---\nk: v\n---\n# T\n"
    );
}
