use super::*;

fn at(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> Moment {
    Moment::new(year, month, day, hour, minute).unwrap()
}

fn notebook() -> String {
    new_notebook("Levures")
}

const HEADER: &str = "---\ntype: cahier-de-recherche\n---\n# Levures\n";

fn added(content: &str, moment: Moment, text: &str) -> String {
    with_entry(content, &moment, text).unwrap()
}

#[test]
fn a_new_notebook_declares_its_type_under_its_title() {
    assert_eq!(notebook(), HEADER);
    assert_eq!(
        new_notebook("  Mon\n cahier  "),
        "---\ntype: cahier-de-recherche\n---\n# Mon cahier\n"
    );
    assert_eq!(
        new_notebook(" \n "),
        "---\ntype: cahier-de-recherche\n---\n# Cahier de recherche\n"
    );
    assert_eq!(ContentType::of(&notebook()), ContentType::ResearchNotebook);
}

#[test]
fn the_first_entry_writes_its_year_month_and_day_headings() {
    assert_eq!(
        added(&notebook(), at(2026, 11, 20, 9, 42), "Levure A : rien"),
        format!(
            "{HEADER}\n## 2026\n\n### Novembre\n\n#### Vendredi 20\n\n- 09:42 - Levure A : rien\n"
        )
    );
}

#[test]
fn entries_of_the_same_day_follow_each_other_oldest_first() {
    let first = added(&notebook(), at(2026, 11, 20, 9, 42), "un");
    let second = added(&first, at(2026, 11, 20, 10, 5), "deux");
    assert_eq!(second, format!("{first}- 10:05 - deux\n"));
}

#[test]
fn only_the_missing_headings_are_written() {
    let first = added(&notebook(), at(2026, 11, 20, 9, 42), "un");
    let next_day = added(&first, at(2026, 11, 21, 8, 0), "deux");
    assert_eq!(
        next_day,
        format!("{first}\n#### Samedi 21\n\n- 08:00 - deux\n")
    );
    let next_month = added(&next_day, at(2026, 12, 1, 8, 0), "trois");
    assert_eq!(
        next_month,
        format!("{next_day}\n### Décembre\n\n#### Mardi 1er\n\n- 08:00 - trois\n")
    );
    let next_year = added(&next_month, at(2027, 1, 1, 0, 1), "quatre");
    assert_eq!(
        next_year,
        format!("{next_month}\n## 2027\n\n### Janvier\n\n#### Vendredi 1er\n\n- 00:01 - quatre\n")
    );
}

#[test]
fn a_heading_of_another_kind_makes_the_day_headings_written_again() {
    let content = format!("{HEADER}\n## 2026\n\n### Novembre\n\n#### Vendredi 20\n\n## Notes\n");
    assert_eq!(
        added(&content, at(2026, 11, 20, 9, 42), "un"),
        format!("{content}\n## 2026\n\n### Novembre\n\n#### Vendredi 20\n\n- 09:42 - un\n")
    );
}

#[test]
fn an_entry_after_a_paragraph_starts_a_new_list() {
    let content =
        format!("{HEADER}\n## 2026\n\n### Novembre\n\n#### Vendredi 20\n\nDu texte\n\n\n");
    assert_eq!(
        added(&content, at(2026, 11, 20, 9, 42), "un"),
        format!(
            "{HEADER}\n## 2026\n\n### Novembre\n\n#### Vendredi 20\n\nDu texte\n\n- 09:42 - un\n"
        )
    );
}

#[test]
fn an_entry_of_several_lines_is_indented_under_its_first_line() {
    let text = "\n\n  Première ligne  \r\n    code en retrait\r\n\r\ndernière\n\n";
    let content = added(&notebook(), at(2026, 11, 20, 9, 42), text);
    assert!(content.ends_with("- 09:42 - Première ligne\n      code en retrait\n\n  dernière\n"));
    let read = entries(&content);
    assert_eq!(read.len(), 1);
    assert_eq!(
        read[0].text(),
        "Première ligne\n    code en retrait\n\ndernière"
    );
    let next = added(&content, at(2026, 11, 20, 9, 50), "suite");
    assert!(next.ends_with("  dernière\n- 09:50 - suite\n"));
}

#[test]
fn a_notebook_written_with_crlf_keeps_its_line_endings() {
    let content = notebook().replace('\n', "\r\n");
    let written = added(&content, at(2026, 11, 20, 9, 42), "un\ndeux");
    assert_eq!(
        written,
        format!(
            "{}\r\n## 2026\r\n\r\n### Novembre\r\n\r\n#### Vendredi 20\r\n\r\n- 09:42 - un\r\n  deux\r\n",
            content
        )
    );
    assert_eq!(entries(&written)[0].text(), "un\ndeux");
}

#[test]
fn an_empty_entry_or_a_note_that_is_not_a_notebook_is_refused() {
    let moment = at(2026, 11, 20, 9, 42);
    assert_eq!(
        with_entry(&notebook(), &moment, " \n\t\r\n "),
        Err(RefusedEntry::Empty)
    );
    assert_eq!(
        with_entry("# Une note", &moment, "texte"),
        Err(RefusedEntry::NotANotebook)
    );
    assert_eq!(
        RefusedEntry::NotANotebook.to_string(),
        "cette note n'est pas un cahier de recherche"
    );
    assert_eq!(RefusedEntry::Empty.to_string(), "l'entrée est vide");
}

#[test]
fn each_entry_is_read_with_its_anchor_label_text_and_line() {
    let mut content = notebook();
    for (moment, text) in [
        (at(2026, 11, 20, 9, 42), "un"),
        (at(2026, 11, 20, 9, 42), "deux\nsuite"),
        (at(2026, 11, 20, 9, 42), "trois"),
        (at(2026, 12, 1, 18, 5), "quatre"),
    ] {
        content = added(&content, moment, text);
    }
    let read = entries(&content);
    let anchors: Vec<String> = read.iter().map(Entry::anchor).collect();
    assert_eq!(
        anchors,
        [
            "2026-11-20-09h42",
            "2026-11-20-09h42-2",
            "2026-11-20-09h42-3",
            "2026-12-01-18h05"
        ]
    );
    assert_eq!(read[0].label(), "20 novembre 2026 à 09:42");
    assert_eq!(read[3].label(), "1er décembre 2026 à 18:05");
    let texts: Vec<&str> = read.iter().map(Entry::text).collect();
    assert_eq!(texts, ["un", "deux\nsuite", "trois", "quatre"]);
    let lines: Vec<&str> = content.split('\n').collect();
    for entry in &read {
        let (_, _, _, hour, minute) = entry.at.parts();
        assert!(lines[entry.line()].starts_with(&format!("- {hour:02}:{minute:02} - ")));
    }
    assert_eq!(read[0].line(), 11);
}

#[test]
fn each_entry_is_numbered_by_its_position_in_the_notebook_starting_at_one() {
    let mut content = notebook();
    assert!(entries(&content).is_empty());
    for (moment, text) in [
        (at(2026, 11, 20, 9, 42), "un"),
        (at(2026, 11, 20, 9, 42), "deux\nsuite"),
        (at(2026, 12, 1, 18, 5), "trois"),
    ] {
        content = added(&content, moment, text);
    }
    let numbers: Vec<usize> = entries(&content).iter().map(Entry::number).collect();
    assert_eq!(numbers, [1, 2, 3]);
}

#[test]
fn only_entries_under_a_complete_day_are_read() {
    let content = format!(
        "{HEADER}\n- 09:00 - sans jour\n\n## 2026\n\n### Novembre\n\n- 09:01 - sans jour\n\n\
         #### Vendredi 20\n\n- 9:02 - heure mal écrite\n- 09:03 -collé\n- 25:00 - hors bornes\n\
         - 09:04 - bonne\nDu texte\n  pas une suite\n#### Vendredi 32\n- 09:05 - jour inconnu\n\
         ### Brumaire\n- 09:06 - mois inconnu\n#### Jeudi\n- 09:07 - jour sans numéro\n"
    );
    let read = entries(&content);
    let texts: Vec<&str> = read.iter().map(Entry::text).collect();
    assert_eq!(texts, ["bonne"]);
}

#[test]
fn a_year_heading_has_exactly_four_digits() {
    for year in ["20266", "+026"] {
        let content = format!("{HEADER}## {year}\n### Novembre\n#### Vendredi 20\n- 09:42 - un\n");
        assert!(entries(&content).is_empty(), "{year}");
    }
}

#[test]
fn headings_are_read_whatever_the_case_of_the_month_or_the_weekday() {
    let content = format!(
        "{HEADER}## 2026\n### novembre\n#### 20\n- 09:42 - a\n\tsuite\n #### pas un titre\n"
    );
    let read = entries(&content);
    assert_eq!(read.len(), 1);
    assert_eq!(read[0].anchor(), "2026-11-20-09h42");
    assert_eq!(read[0].text(), "a\nsuite\n#### pas un titre");
}

#[test]
fn the_index_keeps_each_entry_with_its_notebook_for_container() {
    let path = NotePath::parse("Labo/levures.md").unwrap();
    let mut content = notebook();
    content = added(&content, at(2026, 11, 20, 9, 42), "un");
    content = added(&content, at(2026, 11, 20, 10, 0), "deux");
    let summary = NoteSummary::new(path.clone(), &content, Modified(7));
    let indexed = indexed_entries(&summary, &content);
    let expected = |title: &str, text: &str| {
        (
            NoteSummary::indexed(
                path.clone(),
                title.to_owned(),
                Modified(7),
                false,
                Vec::new(),
            )
            .of_type(ContentType::Entry, Some(path.clone())),
            text.to_owned(),
        )
    };
    assert_eq!(
        indexed,
        [
            expected("20 novembre 2026 à 09:42", "un"),
            expected("20 novembre 2026 à 10:00", "deux")
        ]
    );
    let note = NoteSummary::new(path, "# Note\n- 09:42 - un", Modified(7));
    assert!(indexed_entries(&note, "# Note\n- 09:42 - un").is_empty());
}
