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
    a_research_notebook_is_of_its_type_and_lists_no_entry(&empty_index());
    each_entry_is_searched_on_its_own_with_its_notebook_for_container(&empty_index());
    entries_follow_their_notebook_kept_again_removed_or_cleared(&empty_index());
    a_mind_map_is_searched_by_title_and_tags_and_each_node_on_its_own(&empty_index());
    a_canvas_is_searched_by_its_name_and_the_texts_it_shows(&empty_index());
    the_crm_and_its_fiches_are_kept_with_their_type_container_and_useful_text(&empty_index());
    nodes_follow_their_mind_map_kept_again_removed_or_cleared(&empty_index());
}

/// Un cahier de recherche du 16 novembre 2026 : une entrée sur le pain, une sur le levain.
const NOTEBOOK: &str = "---\ntype: cahier-de-recherche\ntags: [labo]\n---\n# Levures\n\n\
                        ## 2026\n\n### Novembre\n\n#### Lundi 16\n\n- 09:42 - du pain\n\
                        - 10:00 - du levain\n  qui monte\n";

fn entry(title: &str, modified: u64) -> NoteSummary {
    NoteSummary::indexed(
        path("Labo/levures.md"),
        title.to_owned(),
        Modified(modified),
        false,
        Vec::new(),
    )
    .of_type(ContentType::Entry, Some(path("Labo/levures.md")))
}

fn found_items(
    index: &dyn NoteIndex,
    query: &str,
    types: &[ContentType],
) -> Vec<(NoteSummary, String)> {
    let query = SearchQuery::parse(query).unwrap();
    let mut found = index.search(&query, types).unwrap();
    found.sort_by(|(a, x), (b, y)| a.path().cmp(b.path()).then_with(|| x.cmp(y)));
    found
}

fn a_research_notebook_is_of_its_type_and_lists_no_entry(index: &impl NoteIndex) {
    index.put(&[note("Labo/levures.md", NOTEBOOK, 5)]).unwrap();
    for notes in [
        index.all_notes().unwrap(),
        index.notes_in(&folder("Labo")).unwrap(),
        index.tagged("labo").unwrap(),
    ] {
        assert_eq!(
            notes,
            [NoteSummary::new(
                path("Labo/levures.md"),
                NOTEBOOK,
                Modified(5)
            )]
        );
        assert_eq!(notes[0].content_type(), ContentType::ResearchNotebook);
    }
}

fn each_entry_is_searched_on_its_own_with_its_notebook_for_container(index: &impl NoteIndex) {
    index
        .put(&[
            note("Labo/levures.md", NOTEBOOK, 5),
            note("pain.md", "# Pain\n- 09:42 - du pain", 6),
        ])
        .unwrap();
    let notebook = NoteSummary::new(path("Labo/levures.md"), NOTEBOOK, Modified(5));
    assert_eq!(
        found_items(index, "pain", &ContentType::ALL),
        [
            (
                NoteSummary::new(path("pain.md"), "# Pain\n- 09:42 - du pain", Modified(6)),
                "# Pain\n- 09:42 - du pain".to_owned()
            ),
            (notebook.clone(), NOTEBOOK.to_owned()),
            (entry("16 novembre 2026 à 09:42", 5), "du pain".to_owned()),
        ]
    );
    assert_eq!(
        found_items(index, "levain monte", &[ContentType::Entry]),
        [(
            entry("16 novembre 2026 à 10:00", 5),
            "du levain\nqui monte".to_owned()
        )]
    );
    // Les mots de deux entrées ne trouvent que le cahier, qui les a tous.
    assert_eq!(
        found_items(index, "pain levain", &ContentType::ALL),
        [(notebook, NOTEBOOK.to_owned())]
    );
    assert_eq!(found_items(index, "pain", &[ContentType::Note]).len(), 1);
}

fn entries_follow_their_notebook_kept_again_removed_or_cleared<I: NoteIndex>(index: &I) {
    let entries = |index: &dyn NoteIndex| found_items(index, "du", &[ContentType::Entry]).len();
    index.put(&[note("Labo/levures.md", NOTEBOOK, 5)]).unwrap();
    assert_eq!(entries(index), 2);
    let shorter = NOTEBOOK.replace("- 10:00 - du levain\n  qui monte\n", "");
    index.put(&[note("Labo/levures.md", &shorter, 6)]).unwrap();
    assert_eq!(
        found_items(index, "du", &[ContentType::Entry]),
        [(entry("16 novembre 2026 à 09:42", 6), "du pain".to_owned())]
    );
    index
        .put(&[note(
            "Labo/levures.md",
            "# Plus un cahier\n- 09:42 - du pain",
            7,
        )])
        .unwrap();
    assert_eq!(entries(index), 0);
    index.put(&[note("Labo/levures.md", NOTEBOOK, 8)]).unwrap();
    index.remove(&[path("Labo/levures.md")]).unwrap();
    assert_eq!(entries(index), 0);
    index.put(&[note("Labo/levures.md", NOTEBOOK, 9)]).unwrap();
    index.clear().unwrap();
    assert_eq!(entries(index), 0);
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

/// Une note dont l'en-tête ne déclare pas un type de note connu est du type note : aucune ne
/// disparaît de la liste ni de la recherche (fiches 0034, 0037 et 0041).
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

/// Une carte mentale : un nœud sur le pain avec détail, un autre sur le levain, un sous-nœud.
const MIND_MAP: &str = "---\ntype: carte-mentale\ntags: [labo]\n---\n# Recettes\n\n\
                        - Pain\n  > farine et eau\n  - Levain\n- Brioche\n";

fn node(title: &str, node: &str, modified: u64) -> NoteSummary {
    NoteSummary::indexed(
        path("Labo/recettes.md"),
        title.to_owned(),
        Modified(modified),
        false,
        Vec::new(),
    )
    .of_type(ContentType::Node, Some(path("Labo/recettes.md")))
    .of_node(node.to_owned())
}

fn a_mind_map_is_searched_by_title_and_tags_and_each_node_on_its_own(index: &impl NoteIndex) {
    index.put(&[note("Labo/recettes.md", MIND_MAP, 5)]).unwrap();
    // La carte n'est trouvée que par son titre et ses étiquettes, pas par ses nœuds.
    let by = |query: &str, types: &[ContentType]| found_items(index, query, types);
    assert_eq!(by("recettes", &[ContentType::MindMap]).len(), 1);
    assert_eq!(by("labo", &[ContentType::MindMap]).len(), 1);
    assert!(by("pain", &[ContentType::MindMap]).is_empty());
    assert_eq!(
        by("recettes", &[ContentType::MindMap])[0].0.content_type(),
        ContentType::MindMap
    );
    // Chaque nœud est un résultat à lui seul, avec sa carte pour conteneur et son chemin.
    assert_eq!(
        by("farine", &[ContentType::Node]),
        [(node("Pain", "0", 5), "Pain\nfarine et eau".to_owned())]
    );
    assert_eq!(
        by("levain", &[ContentType::Node]),
        [(node("Levain", "0.0", 5), "Levain\n".to_owned())]
    );
    assert_eq!(by("brioche", &ContentType::ALL).len(), 1);
    assert!(by("recettes", &[ContentType::Node]).is_empty());
}

fn nodes_follow_their_mind_map_kept_again_removed_or_cleared<I: NoteIndex>(index: &I) {
    let nodes = |index: &dyn NoteIndex| found_items(index, "pain", &[ContentType::Node]).len();
    index.put(&[note("Labo/recettes.md", MIND_MAP, 5)]).unwrap();
    assert_eq!(nodes(index), 1);
    index
        .put(&[note(
            "Labo/recettes.md",
            "---\ntype: carte-mentale\n---\n# Recettes\n\n- Tarte\n",
            6,
        )])
        .unwrap();
    assert_eq!(nodes(index), 0);
    assert_eq!(found_items(index, "tarte", &[ContentType::Node]).len(), 1);
    index
        .put(&[note("Labo/recettes.md", "# Plus une carte\n- pain\n", 7)])
        .unwrap();
    assert_eq!(found_items(index, "tarte", &[ContentType::Node]).len(), 0);
    index.put(&[note("Labo/recettes.md", MIND_MAP, 8)]).unwrap();
    index.remove(&[path("Labo/recettes.md")]).unwrap();
    assert_eq!(nodes(index), 0);
    index.put(&[note("Labo/recettes.md", MIND_MAP, 9)]).unwrap();
    index.clear().unwrap();
    assert_eq!(nodes(index), 0);
}

const CANVAS: &str = "{\n\t\"nodes\":[\n\t\t{\"id\":\"a3f9c2d41b7e8056\",\"type\":\"text\",\"text\":\"farine et eau\",\"x\":0,\"y\":0,\"width\":250,\"height\":60}\n\t],\n\t\"edges\":[]\n}";

fn a_canvas_is_searched_by_its_name_and_the_texts_it_shows(index: &impl NoteIndex) {
    index
        .put(&[note("Labo/recettes.canvas", CANVAS, 5)])
        .unwrap();
    let by = |query: &str| found_items(index, query, &[ContentType::Canvas]);
    assert_eq!(by("farine").len(), 1);
    assert_eq!(by("recettes").len(), 1);
    // Le JSON du fichier n'est pas cherché : seulement ce que le canvas montre.
    assert!(by("nodes").is_empty());
    assert!(by("width").is_empty());
    let found = &by("farine")[0];
    assert_eq!(found.0.content_type(), ContentType::Canvas);
    assert_eq!(found.0.title(), "recettes");
    assert_eq!(found.1, "recettes\nfarine et eau");
    assert!(found_items(index, "farine", &[ContentType::Note]).is_empty());
}

const CRM: &str = "---\ntype: crm\netapes: [Négo]\ntags: [b2b]\n---\n# Clients\n";
const CRM_ACTION: &str = "---\ntype: crm-action\nstatut: Négo\ndate: '2026-11-24'\nrang: 2\n---\n# Demande de devis\n\nPour trois postes.\n";

fn the_crm_and_its_fiches_are_kept_with_their_type_container_and_useful_text(
    index: &impl NoteIndex,
) {
    index
        .put(&[
            note("clients.md", CRM, 1),
            note("clients/actions/2026-11-24-devis.md", CRM_ACTION, 2),
        ])
        .unwrap();
    let all = index.all_notes().unwrap();
    let kind_of = |name: &str| {
        let summary = all.iter().find(|n| n.path().to_path() == name).unwrap();
        (
            summary.content_type(),
            summary.container().map(NotePath::to_path),
        )
    };
    assert_eq!(kind_of("clients.md"), (ContentType::Crm, None));
    assert_eq!(
        kind_of("clients/actions/2026-11-24-devis.md"),
        (ContentType::CrmAction, Some("clients.md".to_owned()))
    );
    only_the_useful_text_of_the_crm_and_its_fiches_is_searched(index);
}

fn only_the_useful_text_of_the_crm_and_its_fiches_is_searched(index: &impl NoteIndex) {
    let by = |query: &str, types: &[ContentType]| found_items(index, query, types);
    let action = by("trois postes", &[ContentType::CrmAction]);
    assert_eq!(action.len(), 1);
    assert_eq!(action[0].1, "Demande de devis\nPour trois postes.");
    // Les propriétés techniques d'une fiche ne sont pas cherchées.
    assert!(by("statut", &ContentType::ALL).is_empty());
    assert!(by("2026", &ContentType::ALL).is_empty());
    // Le CRM se trouve par son titre et ses étiquettes, pas par ses étapes.
    assert_eq!(by("b2b", &[ContentType::Crm]).len(), 1);
    assert_eq!(by("clients", &[ContentType::Crm]).len(), 1);
    assert!(by("négo", &[ContentType::Crm]).is_empty());
    assert!(by("trois postes", &[ContentType::Note]).is_empty());
}
