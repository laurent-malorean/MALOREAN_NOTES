//! Les outils de l'application qui créent, changent, rangent ou jettent une note, joués par leur
//! protocole sur des faux (fiche 0040).

use std::sync::Arc;

use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};
use domain::Folder;
use serde_json::json;

use super::tests::{found, notes_workspace, opened, refused};
use crate::session::Session;

/// Joue `tool` avec `arguments` pendant un tour, dans le dossier des modèles `Modèles` ; rend ce
/// qu'il rend, lu en JSON.
fn done(session: &Session, tool: &str, arguments: serde_json::Value) -> serde_json::Value {
    let folder = Folder::parse("Modèles").ok();
    let tools = session.open_tools(notes_workspace(), folder).unwrap();
    found(session, tools.key().as_str(), tool, arguments)
}

/// Joue `tool`, qui échoue ; rend pourquoi.
fn failed(session: &Session, tool: &str, arguments: serde_json::Value) -> String {
    let tools = session.open_tools(notes_workspace(), None).unwrap();
    refused(session, tools.key().as_str(), tool, arguments)
}

fn text(session: &Session, path: &str) -> String {
    session.read_note(path).unwrap().content
}

#[test]
fn a_note_is_created_with_its_title_its_text_and_a_file_name_taken_from_its_title() {
    let session = opened(&[("Travail/plan.md", "# Plan")]);
    let created = done(
        &session,
        "create_note",
        json!({ "title": " Plan ", "folder": "Travail", "text": "Les étapes." }),
    );
    assert_eq!(created, json!({ "path": "Travail/plan-2.md" }));
    assert_eq!(text(&session, "Travail/plan-2.md"), "# Plan\nLes étapes.");
    let at_root = done(&session, "create_note", json!({ "title": "Idée" }));
    assert_eq!(at_root, json!({ "path": "idee.md" }));
    assert_eq!(text(&session, "idee.md"), "# Idée\n");
    assert_eq!(
        failed(&session, "create_note", json!({})),
        "il manque « title »"
    );
    assert_eq!(
        failed(
            &session,
            "create_note",
            json!({ "title": "X", "folder": "../x" })
        ),
        "nom de dossier invalide : « ../x »"
    );
}

#[test]
fn a_note_is_created_from_a_template_named_by_its_title_or_its_file_name() {
    let session = opened(&[(
        "Modèles/reunion.md",
        "# Réunion du {{date}}\n## Ordre du jour",
    )]);
    let created = done(
        &session,
        "create_note_from_template",
        json!({ "template": "réunion du {{date}}", "title": "Point équipe", "folder": "" }),
    );
    assert_eq!(created, json!({ "path": "point-equipe.md" }));
    assert_eq!(
        text(&session, "point-equipe.md"),
        "# Point équipe\n## Ordre du jour"
    );
    let by_file = done(
        &session,
        "create_note_from_template",
        json!({ "template": "reunion", "title": "Bilan" }),
    );
    assert_eq!(by_file, json!({ "path": "bilan.md" }));
    let tools = session
        .open_tools(notes_workspace(), Folder::parse("Modèles").ok())
        .unwrap();
    assert_eq!(
        refused(
            &session,
            tools.key().as_str(),
            "create_note_from_template",
            json!({ "template": "Journal", "title": "X" })
        ),
        "aucun modèle « Journal » : voyez list_templates"
    );
    drop(tools);
    assert_eq!(
        failed(
            &session,
            "create_note_from_template",
            json!({ "template": "reunion", "title": "X" })
        ),
        "aucun dossier des modèles n'est choisi : l'utilisateur peut en choisir un dans les \
         réglages de MALOREAN Notes"
    );
}

#[test]
fn a_note_goes_to_the_trash_never_erased() {
    let session = opened(&[("a.md", "# A")]);
    assert_eq!(
        done(&session, "trash_note", json!({ "path": "a.md" })),
        json!({ "trashed": "a.md" })
    );
    assert!(session.read_note("a.md").is_err());
    assert_eq!(session.list_trash().unwrap().notes.len(), 1);
    assert_eq!(
        failed(&session, "trash_note", json!({ "path": "a.md" })),
        session.trash_note("a.md").unwrap_err().message
    );
}

#[test]
fn a_renamed_note_takes_its_new_file_name_and_names_the_notes_whose_links_to_update() {
    let session = opened(&[
        ("a.md", "---\npinned: true\n---\n# Alpha\ntexte"),
        ("b.md", "# Bêta\nvoir [[Alpha]]"),
    ]);
    let renamed = done(
        &session,
        "rename_note",
        json!({ "path": "a.md", "title": "Gamma" }),
    );
    assert_eq!(
        renamed,
        json!({ "path": "gamma.md",
                "linking_notes_to_update": [{ "path": "b.md", "title": "Bêta", "folder": "" }] })
    );
    assert_eq!(
        text(&session, "gamma.md"),
        "---\npinned: true\n---\n# Gamma\ntexte"
    );
    assert_eq!(
        failed(&session, "rename_note", json!({ "path": "gamma.md" })),
        "il manque « title »"
    );
    assert!(
        failed(
            &session,
            "rename_note",
            json!({ "path": "x.md", "title": "Y" })
        )
        .contains("x.md")
    );
}

#[test]
fn a_moved_note_keeps_its_name_in_its_new_folder() {
    let session = opened(&[("a.md", "# A"), ("Travail/b.md", "# B")]);
    let moved = done(
        &session,
        "move_note",
        json!({ "path": "a.md", "folder": "Travail" }),
    );
    assert_eq!(moved, json!({ "path": "Travail/a.md" }));
    let back = done(&session, "move_note", json!({ "path": "Travail/b.md" }));
    assert_eq!(back, json!({ "path": "b.md" }));
}

#[test]
fn a_version_is_restored_after_the_current_text_is_kept() {
    let session = opened(&[("a.md", "# A\nancien")]);
    session.keep_version("a.md").unwrap();
    let read = session.read_note("a.md").unwrap();
    session
        .save_note("a.md", "# A\nnouveau", &read.fingerprint)
        .unwrap();
    let restored = done(
        &session,
        "restore_version",
        json!({ "path": "a.md", "version": "2026-11-16 18h30" }),
    );
    assert_eq!(restored, json!({ "path": "a.md" }));
    assert_eq!(text(&session, "a.md"), "# A\nancien");
    assert_eq!(session.list_versions("a.md").unwrap().len(), 2);
    assert_eq!(
        failed(&session, "restore_version", json!({ "path": "a.md" })),
        "il manque « version »"
    );
}

#[test]
fn tags_are_added_and_removed_in_the_header_without_touching_the_rest() {
    let session = opened(&[("a.md", "---\npinned: true\ntags: [maison]\n---\n# A\ntexte")]);
    let added = done(
        &session,
        "add_tags",
        json!({ "path": "a.md", "tags": ["#jardin", "Maison"] }),
    );
    assert_eq!(
        added,
        json!({ "path": "a.md", "tags": ["maison", "jardin"] })
    );
    assert_eq!(
        text(&session, "a.md"),
        "---\npinned: true\ntags: [maison, jardin]\n---\n# A\ntexte"
    );
    let removed = done(
        &session,
        "remove_tags",
        json!({ "path": "a.md", "tags": ["MAISON"] }),
    );
    assert_eq!(removed, json!({ "path": "a.md", "tags": ["jardin"] }));
    assert_eq!(session.list_tags().unwrap()[0].name, "jardin");
    done(
        &session,
        "remove_tags",
        json!({ "path": "a.md", "tags": ["jardin"] }),
    );
    assert_eq!(text(&session, "a.md"), "---\npinned: true\n---\n# A\ntexte");
}

#[test]
fn unchanged_tags_leave_the_note_as_it_is() {
    let store = Arc::new(InMemoryNoteStore::with_notes(&[("a.md", "# A")]));
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::clone(&store))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    let before = session.read_note("a.md").unwrap().fingerprint;
    let unchanged = done(
        &session,
        "remove_tags",
        json!({ "path": "a.md", "tags": ["x"] }),
    );
    assert_eq!(unchanged, json!({ "path": "a.md", "tags": [] }));
    assert_eq!(session.read_note("a.md").unwrap().fingerprint, before);
}

#[test]
fn tags_must_be_a_list_of_writable_tags() {
    let session = opened(&[("a.md", "# A")]);
    let missing = "il manque « tags » : une liste d'étiquettes";
    assert_eq!(
        failed(&session, "add_tags", json!({ "path": "a.md" })),
        missing
    );
    assert_eq!(
        failed(&session, "add_tags", json!({ "path": "a.md", "tags": [] })),
        missing
    );
    assert_eq!(
        failed(&session, "add_tags", json!({ "path": "a.md", "tags": "x" })),
        missing
    );
    assert_eq!(
        failed(
            &session,
            "add_tags",
            json!({ "path": "a.md", "tags": ["a, b"] })
        ),
        "étiquette invalide : « a, b »"
    );
    assert_eq!(
        failed(&session, "add_tags", json!({ "path": "a.md", "tags": [3] })),
        "étiquette invalide : «  »"
    );
    assert_eq!(text(&session, "a.md"), "# A");
}

#[test]
fn a_note_is_pinned_and_unpinned() {
    let session = opened(&[("a.md", "# A")]);
    assert_eq!(
        done(&session, "pin_note", json!({ "path": "a.md" })),
        json!({ "path": "a.md", "pinned": true })
    );
    assert_eq!(text(&session, "a.md"), "---\npinned: true\n---\n# A");
    assert_eq!(
        done(&session, "unpin_note", json!({ "path": "a.md" })),
        json!({ "path": "a.md", "pinned": false })
    );
    assert_eq!(text(&session, "a.md"), "# A");
    assert!(failed(&session, "pin_note", json!({ "path": "x.md" })).contains("x.md"));
    assert!(failed(&session, "unpin_note", json!({ "path": "x.md" })).contains("x.md"));
}

#[test]
fn a_file_of_the_workspace_becomes_an_attachment_of_the_note() {
    let store = Arc::new(InMemoryNoteStore::with_notes(&[("a.md", "# A")]).with_file(
        "Documents",
        "plan.pdf",
        b"PDF",
    ));
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::clone(&store))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    let attached = done(
        &session,
        "add_attachment",
        json!({ "path": "a.md", "file": "Documents/plan.pdf" }),
    );
    assert_eq!(
        attached,
        json!({ "path": "a.md", "link": "[plan.pdf](a.assets/plan.pdf)" })
    );
    assert_eq!(
        text(&session, "a.md"),
        "# A\n\n[plan.pdf](a.assets/plan.pdf)\n"
    );
    assert_eq!(
        failed(
            &session,
            "add_attachment",
            json!({ "path": "a.md", "file": "plan.pdf" })
        ),
        "la pièce jointe « plan.pdf » est introuvable"
    );
    assert!(
        failed(
            &session,
            "add_attachment",
            json!({ "path": "../a.md", "file": "x.pdf" })
        )
        .contains("../a.md")
    );
    assert_eq!(
        failed(
            &session,
            "add_attachment",
            json!({ "path": "a.md", "file": "../x.pdf" })
        ),
        "nom de dossier invalide : « .. »"
    );
}

#[test]
fn every_changing_tool_needs_the_note_it_changes() {
    let session = opened(&[]);
    for tool in [
        "trash_note",
        "move_note",
        "pin_note",
        "unpin_note",
        "add_attachment",
        "add_entry",
    ] {
        assert_eq!(
            failed(&session, tool, json!({})),
            "il manque « path »",
            "{tool}"
        );
    }
}

#[test]
fn an_entry_is_only_ever_added_at_the_end_of_a_research_notebook() {
    let notebook = "---\ntype: cahier-de-recherche\n---\n# Levures\n";
    let session = opened(&[("levures.md", notebook), ("note.md", "# Note")]);
    let added = done(
        &session,
        "add_entry",
        json!({ "path": "levures.md", "text": "Levure A\nmousse" }),
    );
    let entry = json!({
        "anchor": "2026-11-16-18h30",
        "label": "16 novembre 2026 à 18:30",
        "text": "Levure A\nmousse",
        "line": 11,
    });
    assert_eq!(added, json!({ "path": "levures.md", "entry": entry }));
    done(
        &session,
        "add_entry",
        json!({ "path": "levures.md", "text": "Levure B" }),
    );
    assert_eq!(
        text(&session, "levures.md"),
        format!(
            "{notebook}\n## 2026\n\n### Novembre\n\n#### Lundi 16\n\n- 18:30 - Levure A\n  \
             mousse\n- 18:30 - Levure B\n"
        )
    );
    assert_eq!(
        failed(
            &session,
            "add_entry",
            json!({ "path": "note.md", "text": "x" })
        ),
        "cette note n'est pas un cahier de recherche"
    );
    assert_eq!(text(&session, "note.md"), "# Note");
    assert_eq!(
        failed(&session, "add_entry", json!({ "path": "levures.md" })),
        "il manque « text »"
    );
}

#[test]
fn a_folder_is_created_with_every_missing_level_and_one_that_exists_is_left_alone() {
    let session = opened(&[("Travail/plan.md", "# Plan")]);
    let created = done(
        &session,
        "create_folder",
        json!({ "path": "Animaux/Chiens/Beagles" }),
    );
    assert_eq!(created, json!({ "path": "Animaux/Chiens/Beagles" }));
    let folders = session.list_folders().unwrap();
    for folder in ["Animaux", "Animaux/Chiens", "Animaux/Chiens/Beagles"] {
        assert!(folders.contains(&folder.to_owned()), "{folder}");
    }
    let again = done(&session, "create_folder", json!({ "path": "Travail" }));
    assert_eq!(again, json!({ "path": "Travail" }));
    let note = done(
        &session,
        "create_note",
        json!({ "title": "Beagle", "folder": "Animaux/Chiens/Beagles" }),
    );
    assert_eq!(note, json!({ "path": "Animaux/Chiens/Beagles/beagle.md" }));
}

#[test]
fn a_note_created_in_a_folder_that_does_not_exist_creates_the_folder_first() {
    let session = opened(&[]);
    let note = done(
        &session,
        "create_note",
        json!({ "title": "Beagle", "folder": "Animaux/Chiens", "text": "Un chien." }),
    );
    assert_eq!(note, json!({ "path": "Animaux/Chiens/beagle.md" }));
    assert!(
        session
            .list_folders()
            .unwrap()
            .contains(&"Animaux/Chiens".to_owned())
    );
    assert_eq!(
        text(&session, "Animaux/Chiens/beagle.md"),
        "# Beagle\nUn chien."
    );
}

#[test]
fn a_folder_with_an_invalid_name_is_refused() {
    let session = opened(&[]);
    assert_eq!(
        failed(&session, "create_folder", json!({})),
        "il manque « path »"
    );
    assert_eq!(
        failed(&session, "create_folder", json!({ "path": "../x" })),
        "nom de dossier invalide : « .. »"
    );
}

#[test]
fn a_mind_map_is_created_like_a_note_with_its_starting_list() {
    let session = opened(&[("Idees/projet.md", "# Autre")]);
    let created = done(
        &session,
        "create_mind_map",
        json!({ "title": "Projet", "folder": "Idees", "content": "- A\n    - B" }),
    );
    assert_eq!(created, json!({ "path": "Idees/projet-2.md" }));
    assert_eq!(
        text(&session, "Idees/projet-2.md"),
        "---\ntype: carte-mentale\nracines: [{x: 0, y: 0}]\n---\n# Projet\n\n- A\n  - B\n"
    );
    done(&session, "create_mind_map", json!({ "title": "Vide" }));
    assert_eq!(
        text(&session, "vide.md"),
        "---\ntype: carte-mentale\n---\n# Vide\n"
    );
    assert_eq!(
        failed(&session, "create_mind_map", json!({})),
        "il manque « title »"
    );
}

#[test]
fn a_crm_is_created_with_the_name_taken_from_its_title_in_a_folder_made_on_the_way() {
    let session = opened(&[("Ventes/clients.md", "# Autre")]);
    let created = done(
        &session,
        "create_crm",
        json!({ "title": "  Clients ", "folder": "Ventes" }),
    );
    assert_eq!(created, json!({ "path": "Ventes/clients-2.md" }));
    assert_eq!(
        text(&session, "Ventes/clients-2.md"),
        "---\ntype: crm\n---\n# Clients\n"
    );
    let at_root = done(&session, "create_crm", json!({ "title": "Mes clients" }));
    assert_eq!(at_root, json!({ "path": "mes-clients.md" }));
    let in_new_folder = done(
        &session,
        "create_crm",
        json!({ "title": "Prospects", "folder": "Ventes/2027" }),
    );
    assert_eq!(in_new_folder, json!({ "path": "Ventes/2027/prospects.md" }));
    assert!(
        session
            .list_folders()
            .unwrap()
            .contains(&"Ventes/2027".to_owned())
    );
}

#[test]
fn a_crm_without_a_valid_title_or_folder_is_refused_and_nothing_is_written() {
    let session = opened(&[]);
    assert_eq!(
        failed(&session, "create_crm", json!({})),
        "il manque « title »"
    );
    assert_eq!(
        failed(
            &session,
            "create_crm",
            json!({ "title": "  ", "folder": "Ventes" })
        ),
        "il manque « title »"
    );
    assert_eq!(
        failed(
            &session,
            "create_crm",
            json!({ "title": "A\nB", "folder": "Ventes" })
        ),
        "Le nom tient sur une seule ligne."
    );
    assert_eq!(
        failed(
            &session,
            "create_crm",
            json!({ "title": "X", "folder": "../x" })
        ),
        "nom de dossier invalide : « ../x »"
    );
    assert!(session.list_folders().unwrap().is_empty());
}
