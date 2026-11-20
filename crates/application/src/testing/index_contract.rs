//! Tests de contrat de l'index : joués à l'identique sur l'index en mémoire et sur le vrai.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::search::SearchQuery;
use domain::{ContentType, Folder, Modified, NotePath, NoteSummary};

use crate::{IndexedNote, NoteIndex, NoteStamp};

fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap_or_else(|e| unreachable!("{e}"))
}

fn folder(text: &str) -> Folder {
    Folder::parse(text).unwrap_or_else(|e| unreachable!("{e}"))
}

/// Une note de chemin `name`, de contenu `content`, modifiée à `modified`.
fn note(name: &str, content: &str, modified: u64) -> IndexedNote {
    IndexedNote {
        stamp: NoteStamp {
            path: path(name),
            modified: Modified(modified),
            size: content.len() as u64 + 1,
        },
        content: content.to_owned(),
    }
}

fn paths(mut notes: Vec<NoteSummary>) -> Vec<String> {
    notes.sort_by(|a, b| a.path().cmp(b.path()));
    notes.iter().map(|n| n.path().to_path()).collect()
}

fn found(index: &impl NoteIndex, query: &str) -> Vec<String> {
    let query = SearchQuery::parse(query).unwrap();
    let mut found: Vec<(NoteSummary, String)> = index.search(&query, &ContentType::ALL).unwrap();
    found.sort_by(|(a, _), (b, _)| a.path().cmp(b.path()));
    found.into_iter().map(|(n, _)| n.path().to_path()).collect()
}

/// Joue tout le contrat ; `empty_index` fabrique un index vide à chaque appel.
pub fn note_index_contract<I: NoteIndex>(empty_index: impl Fn() -> I) {
    a_new_index_knows_no_note(&empty_index());
    kept_notes_give_back_their_stamp(&empty_index());
    a_kept_note_is_summarised_from_its_content(&empty_index());
    keeping_a_note_again_replaces_what_was_known(&empty_index());
    removed_notes_are_forgotten(&empty_index());
    clearing_forgets_every_note(&empty_index());
    a_folder_lists_its_own_notes_only(&empty_index());
    tagged_notes_carry_the_tag_as_written(&empty_index());
    search_finds_notes_with_every_word(&empty_index());
    search_ignores_case_and_accents_and_finds_parts_of_words(&empty_index());
    search_finds_short_words(&empty_index());
    search_takes_symbols_as_written(&empty_index());
    search_gives_back_the_content(&empty_index());
    a_kept_note_gives_back_its_last_text(&empty_index());
    every_note_is_of_the_note_type_without_container(&empty_index());
    search_keeps_to_the_types_asked(&empty_index());
}

fn a_new_index_knows_no_note(index: &impl NoteIndex) {
    assert!(index.stamps().unwrap().is_empty());
    assert!(index.all_notes().unwrap().is_empty());
    assert!(index.notes_in(&Folder::root()).unwrap().is_empty());
    assert!(index.tagged("perso").unwrap().is_empty());
    assert!(found(index, "pain").is_empty());
}

fn kept_notes_give_back_their_stamp(index: &impl NoteIndex) {
    let notes = [
        note("a.md", "# A", 3),
        note(
            "Été/Réunion du lundi/b.md",
            "# B",
            u64::from(u32::MAX) * 1000,
        ),
    ];
    index.put(&notes).unwrap();
    let mut stamps = index.stamps().unwrap();
    stamps.sort_by(|a, b| a.path.cmp(&b.path));
    assert_eq!(stamps, [notes[0].stamp.clone(), notes[1].stamp.clone()]);
}

fn a_kept_note_is_summarised_from_its_content(index: &impl NoteIndex) {
    let content = "---\ntags: [perso, Loisirs]\npinned: true\n---\n# Titre\ntexte";
    index.put(&[note("x.md", content, 9)]).unwrap();
    index.put(&[note("y.md", "sans titre", 2)]).unwrap();
    let mut all = index.all_notes().unwrap();
    all.sort_by(|a, b| a.path().cmp(b.path()));
    assert_eq!(
        all,
        [
            NoteSummary::new(path("x.md"), content, Modified(9)),
            NoteSummary::new(path("y.md"), "sans titre", Modified(2)),
        ]
    );
}

fn keeping_a_note_again_replaces_what_was_known(index: &impl NoteIndex) {
    index
        .put(&[note("x.md", "---\ntags: [perso]\n---\n# Avant\npain", 1)])
        .unwrap();
    let after = note("x.md", "---\ntags: [travail]\n---\n# Après\nlait", 2);
    index.put(std::slice::from_ref(&after)).unwrap();
    assert_eq!(index.stamps().unwrap(), std::slice::from_ref(&after.stamp));
    assert_eq!(index.all_notes().unwrap()[0].title(), "Après");
    assert!(index.tagged("perso").unwrap().is_empty());
    assert_eq!(paths(index.tagged("travail").unwrap()), ["x.md"]);
    assert!(found(index, "pain").is_empty());
    assert!(found(index, "avant").is_empty());
    assert_eq!(found(index, "lait"), ["x.md"]);
}

fn removed_notes_are_forgotten(index: &impl NoteIndex) {
    index
        .put(&[
            note("a.md", "---\ntags: [perso]\n---\npain", 1),
            note("b.md", "pain", 2),
            note("c.md", "pain", 3),
        ])
        .unwrap();
    index
        .remove(&[path("a.md"), path("c.md"), path("absente.md")])
        .unwrap();
    assert_eq!(paths(index.all_notes().unwrap()), ["b.md"]);
    assert_eq!(index.stamps().unwrap().len(), 1);
    assert!(index.tagged("perso").unwrap().is_empty());
    assert_eq!(found(index, "pain"), ["b.md"]);
}

fn clearing_forgets_every_note(index: &impl NoteIndex) {
    index
        .put(&[
            note("a.md", "---\ntags: [perso]\n---\npain", 1),
            note("d/b.md", "x", 2),
        ])
        .unwrap();
    index.clear().unwrap();
    a_new_index_knows_no_note(index);
    index.put(&[note("a.md", "pain", 1)]).unwrap();
    assert_eq!(found(index, "pain"), ["a.md"]);
}

fn a_folder_lists_its_own_notes_only(index: &impl NoteIndex) {
    index
        .put(&[
            note("a.md", "# A", 1),
            note("Travail/b.md", "# B", 2),
            note("Travail/c.md", "# C", 3),
            note("Travail/Archives/d.md", "# D", 4),
            note("Travaux/e.md", "# E", 5),
        ])
        .unwrap();
    assert_eq!(paths(index.notes_in(&Folder::root()).unwrap()), ["a.md"]);
    assert_eq!(
        paths(index.notes_in(&folder("Travail")).unwrap()),
        ["Travail/b.md", "Travail/c.md"]
    );
    assert_eq!(
        paths(index.notes_in(&folder("Travail/Archives")).unwrap()),
        ["Travail/Archives/d.md"]
    );
    assert!(index.notes_in(&folder("Autre")).unwrap().is_empty());
    assert_eq!(index.all_notes().unwrap().len(), 5);
}

fn tagged_notes_carry_the_tag_as_written(index: &impl NoteIndex) {
    index
        .put(&[
            note("a.md", "---\ntags: [perso, été]\n---\n# A", 1),
            note("d/b.md", "---\ntags: [Perso]\n---\n# B", 2),
            note("c.md", "---\ntags: [personnel]\n---\n# C", 3),
            note("e.md", "# E\nperso", 4),
        ])
        .unwrap();
    let tagged = index.tagged("perso").unwrap();
    assert_eq!(paths(tagged.clone()), ["a.md"]);
    assert_eq!(tagged[0].tags(), ["perso", "été"]);
    assert_eq!(paths(index.tagged("Perso").unwrap()), ["d/b.md"]);
    assert_eq!(paths(index.tagged("été").unwrap()), ["a.md"]);
    assert!(index.tagged("pers").unwrap().is_empty());
    assert!(index.tagged("ete").unwrap().is_empty());
}

fn search_finds_notes_with_every_word(index: &impl NoteIndex) {
    index
        .put(&[
            note("a.md", "# Courses\nacheter du pain et du lait", 1),
            note("d/b.md", "# Pain\nrassis", 2),
            note("c.md", "---\ntags: [lait]\n---\n# Autre\npain", 3),
        ])
        .unwrap();
    assert_eq!(found(index, "pain"), ["a.md", "c.md", "d/b.md"]);
    assert_eq!(found(index, "pain lait"), ["a.md", "c.md"]);
    assert_eq!(found(index, "lait pain acheter"), ["a.md"]);
    assert!(found(index, "pain beurre").is_empty());
}

fn search_ignores_case_and_accents_and_finds_parts_of_words(index: &impl NoteIndex) {
    index
        .put(&[
            note("a.md", "Un BEL Été à la Plage", 1),
            note("b.md", "Œuvre complète", 2),
            note("c.md", "recommencer", 3),
        ])
        .unwrap();
    assert_eq!(found(index, "ete"), ["a.md", "b.md"]);
    assert_eq!(found(index, "ÉTÉ plage"), ["a.md"]);
    assert_eq!(found(index, "œuvre COMPLETE"), ["b.md"]);
    assert_eq!(found(index, "commen"), ["c.md"]);
    assert!(found(index, "oeuvre").is_empty());
}

fn symbols(index: &impl NoteIndex) {
    index
        .put(&[
            note("a.md", "il a dit \"oui\" (vraiment) : x*y - z^2 OR NOT", 1),
            note("b.md", "Le ciel", 2),
            note("c.md", "100 % sûr, 1_000 c'est ça", 3),
        ])
        .unwrap();
}

fn search_finds_short_words(index: &impl NoteIndex) {
    symbols(index);
    assert_eq!(found(index, "le"), ["b.md"]);
    assert_eq!(found(index, "ci"), ["b.md"]);
    assert_eq!(found(index, "ca"), ["c.md"]);
    assert_eq!(found(index, ":"), ["a.md"]);
    assert_eq!(found(index, "%"), ["c.md"]);
}

fn search_takes_symbols_as_written(index: &impl NoteIndex) {
    symbols(index);
    assert_eq!(found(index, "\"oui\""), ["a.md"]);
    assert_eq!(found(index, "(vraiment)"), ["a.md"]);
    assert_eq!(found(index, "x*y z^2"), ["a.md"]);
    assert_eq!(found(index, "or not"), ["a.md"]);
    assert_eq!(found(index, "1_000 c'est"), ["c.md"]);
    assert!(found(index, "_00 0%").is_empty());
}

fn search_gives_back_the_content(index: &impl NoteIndex) {
    let content = "---\npinned: true\n---\n# Titre\ndu pain";
    index.put(&[note("a.md", content, 4)]).unwrap();
    let query = SearchQuery::parse("pain").unwrap();
    assert_eq!(
        index.search(&query, &ContentType::ALL).unwrap(),
        [(
            NoteSummary::new(path("a.md"), content, Modified(4)),
            content.to_owned()
        )]
    );
}

fn a_kept_note_gives_back_its_last_text(index: &impl NoteIndex) {
    index.put(&[note("Travail/a.md", "# Avant", 1)]).unwrap();
    index.put(&[note("Travail/a.md", "# Après", 2)]).unwrap();
    assert_eq!(
        index.content(&path("Travail/a.md")).unwrap(),
        Some("# Après".to_owned())
    );
    assert_eq!(index.content(&path("a.md")).unwrap(), None);
}

/// Tant qu'un seul type existe, toute note est du type note, que son en-tête nomme un type ou
/// non : aucune ne disparaît de la liste ni de la recherche (fiches 0034 et 0037).
fn every_note_is_of_the_note_type_without_container(index: &impl NoteIndex) {
    index
        .put(&[
            note("a.md", "---\ntags: [crm]\n---\n# A\npain", 1),
            note("b.md", "---\ntype: note\ntags: [crm]\n---\n# B\npain", 2),
            note("c.md", "---\ntype: kanban\ntags: [crm]\n---\n# C\npain", 3),
        ])
        .unwrap();
    let of_note_type = |notes: &[NoteSummary]| {
        notes
            .iter()
            .all(|n| n.content_type() == ContentType::Note && n.container().is_none())
    };
    let query = SearchQuery::parse("pain").unwrap();
    let found: Vec<NoteSummary> = index
        .search(&query, &ContentType::ALL)
        .unwrap()
        .into_iter()
        .map(|(n, _)| n)
        .collect();
    for notes in [
        index.all_notes().unwrap(),
        index.notes_in(&Folder::root()).unwrap(),
        index.tagged("crm").unwrap(),
        found,
    ] {
        assert_eq!(notes.len(), 3);
        assert!(of_note_type(&notes));
    }
}

fn search_keeps_to_the_types_asked(index: &impl NoteIndex) {
    index.put(&[note("a.md", "# A\npain", 1)]).unwrap();
    let query = SearchQuery::parse("pain").unwrap();
    assert_eq!(index.search(&query, &[ContentType::Note]).unwrap().len(), 1);
    assert!(index.search(&query, &[]).unwrap().is_empty());
}
