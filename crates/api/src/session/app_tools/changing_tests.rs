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
    ] {
        assert_eq!(
            failed(&session, tool, json!({})),
            "il manque « path »",
            "{tool}"
        );
    }
}
