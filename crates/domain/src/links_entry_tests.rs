//! Le lien vers une entrée d'un cahier de recherche : `[[Titre du cahier#0007]]` (fiche 0107).

use super::*;

fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

/// Les contenus de l'espace : deux cahiers, une note, un canvas, et deux cahiers homonymes.
fn links() -> LinkIndex {
    LinkIndex::new([
        (path("Labo/levures.md"), "Levures".to_owned()),
        (path("courses.md"), "Courses".to_owned()),
        (path("plan.canvas"), "Sans titre".to_owned()),
        (path("A/journal.md"), "Journal".to_owned()),
        (path("B/journal.md"), "Journal".to_owned()),
        (path("langages.md"), "C#".to_owned()),
        (path("cahier-dieze.md"), "Dièse #3".to_owned()),
    ])
    .with_notebooks([
        path("Labo/levures.md"),
        path("A/journal.md"),
        path("B/journal.md"),
        path("cahier-dieze.md"),
    ])
}

fn entry(notebook: &str, number: usize) -> Resolution {
    Resolution::Entry {
        notebook: path(notebook),
        number,
    }
}

#[test]
fn a_number_after_a_hash_designates_an_entry_of_the_notebook() {
    let links = links();
    assert_eq!(links.resolve("Levures#0007"), entry("Labo/levures.md", 7));
    assert_eq!(links.resolve("levures#7"), entry("Labo/levures.md", 7));
    assert_eq!(links.resolve("Levures#00012"), entry("Labo/levures.md", 12));
    assert_eq!(
        links.resolve("  LEVURES  #0001 "),
        entry("Labo/levures.md", 1)
    );
}

#[test]
fn the_folder_works_before_the_title_as_in_any_link() {
    let links = links();
    assert_eq!(
        links.resolve("Labo/Levures#0002"),
        entry("Labo/levures.md", 2)
    );
    assert_eq!(links.resolve("Autre/Levures#0002"), Resolution::Missing);
}

#[test]
fn a_number_that_does_not_exist_still_designates_the_notebook_for_the_screen_to_say_so() {
    let links = links();
    assert_eq!(links.resolve("Levures#0000"), entry("Labo/levures.md", 0));
    assert_eq!(
        links.resolve("Levures#99999"),
        entry("Labo/levures.md", 99_999)
    );
}

#[test]
fn a_hash_without_digits_alone_is_not_a_number() {
    let links = links();
    for target in [
        "Levures#abc",
        "Levures#",
        "Levures#12a",
        "Levures#-3",
        "Levures# 7",
        "Levures#1#2",
        "#0007",
        "Levures#99999999999999999999999999",
    ] {
        assert_eq!(links.resolve(target), Resolution::Missing, "{target}");
    }
}

#[test]
fn a_number_leads_nowhere_when_the_content_is_not_a_notebook_or_does_not_exist() {
    let links = links();
    assert_eq!(links.resolve("Courses#0003"), Resolution::Missing);
    assert_eq!(links.resolve("plan.canvas#0003"), Resolution::Missing);
    assert_eq!(links.resolve("Absent#0003"), Resolution::Missing);
}

#[test]
fn two_notebooks_with_the_same_title_make_the_link_ambiguous_until_the_folder_is_given() {
    let links = links();
    assert_eq!(
        links.resolve("Journal#0001"),
        Resolution::Ambiguous(vec![path("A/journal.md"), path("B/journal.md")])
    );
    assert_eq!(links.resolve("B/Journal#0001"), entry("B/journal.md", 1));
}

#[test]
fn a_title_with_a_hash_is_never_broken() {
    let links = links();
    // Le texte entier est un titre : lien ordinaire, même s'il finit par `#` et des chiffres.
    assert_eq!(links.resolve("C#"), Resolution::Found(path("langages.md")));
    assert_eq!(
        links.resolve("Dièse #3"),
        Resolution::Found(path("cahier-dieze.md"))
    );
    // Le titre d'un cahier qui contient `#`, suivi d'un numéro d'entrée.
    assert_eq!(links.resolve("Dièse #3#0002"), entry("cahier-dieze.md", 2));
    // Titre entier gagnant : `C#` est une note, `C#0007` ne vise aucune entrée d'un cahier.
    assert_eq!(links.resolve("C#0007"), Resolution::Missing);
}

#[test]
fn the_whole_text_wins_over_an_entry_when_a_title_reads_like_one() {
    let links = LinkIndex::new([
        (path("a.md"), "Cahier".to_owned()),
        (path("b.md"), "Cahier#0007".to_owned()),
    ])
    .with_notebooks([path("a.md")]);
    assert_eq!(
        links.resolve("Cahier#0007"),
        Resolution::Found(path("b.md"))
    );
    assert_eq!(links.resolve("Cahier#0008"), entry("a.md", 8));
}

#[test]
fn the_index_without_notebooks_knows_no_entry() {
    let links = LinkIndex::new([(path("a.md"), "Cahier".to_owned())]);
    assert_eq!(links.resolve("Cahier#0001"), Resolution::Missing);
}

#[test]
fn a_link_to_an_entry_is_read_as_a_link_whose_target_carries_the_number() {
    assert_eq!(
        linked_targets("voir [[Levures#0007]] et [[Levures#0002|l'entrée 2]]"),
        ["Levures#0007", "Levures#0002"]
    );
}

#[test]
fn an_entry_designates_its_notebook_for_the_incoming_links() {
    assert_eq!(
        entry("Labo/levures.md", 7).designated(),
        Some(&path("Labo/levures.md"))
    );
    assert_eq!(
        Resolution::Found(path("a.md")).designated(),
        Some(&path("a.md"))
    );
    assert_eq!(Resolution::Missing.designated(), None);
    assert_eq!(
        Resolution::Ambiguous(vec![path("a.md"), path("b.md")]).designated(),
        None
    );
}

#[test]
fn the_written_link_of_a_notebook_is_still_its_title_alone() {
    let links = links();
    assert_eq!(
        links.written(&path("Labo/levures.md")).as_deref(),
        Some("Levures")
    );
    assert_eq!(
        links.written(&path("cahier-dieze.md")).as_deref(),
        Some("Dièse #3")
    );
}
