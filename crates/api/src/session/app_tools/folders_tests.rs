//! Les outils de dossier, joués par leur protocole sur des faux (fiche 0078) : l'arbre des
//! dossiers, renommer, déplacer, jeter à la corbeille ; mêmes règles et mêmes messages que
//! l'interface.

use std::sync::Arc;

use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};
use domain::{AttachmentName, NotePath};
use serde_json::{Value, json};

use super::tests::{found, notes_workspace, opened, refused};
use super::workspaces_tests::world;
use crate::session::Session;

/// Joue `tool` pendant un tour ; rend ce qu'il rend, lu en JSON.
fn call(session: &Session, tool: &str, arguments: Value) -> Value {
    let tools = session.open_tools(notes_workspace()).unwrap();
    found(session, tools.key().as_str(), tool, arguments)
}

/// Joue `tool`, qui échoue ; rend pourquoi.
fn fails(session: &Session, tool: &str, arguments: Value) -> String {
    let tools = session.open_tools(notes_workspace()).unwrap();
    refused(session, tools.key().as_str(), tool, arguments)
}

fn tree() -> Session {
    opened(&[
        ("Travail/Réunions/lundi.md", "# Lundi\n\nOrdre du jour"),
        ("Travail/plan.md", "# Plan"),
        ("perso/a.md", "# A"),
    ])
}

fn invalid(name: &str) -> String {
    format!("nom de dossier invalide : « {name} »")
}

#[test]
fn the_folders_are_listed_by_path_in_the_order_of_the_tree_without_the_root() {
    let session = tree();
    call(
        &session,
        "create_folder",
        json!({ "path": "archives/2025" }),
    );

    let listed = call(&session, "list_folders", json!({}));

    assert_eq!(
        listed,
        json!({ "folders": ["archives", "archives/2025", "perso", "Travail", "Travail/Réunions"] })
    );
}

fn with_a_crm() -> Session {
    opened(&[
        ("Clients/crm1.md", "---\ntype: crm\n---\n# CRM1\n"),
        (
            "Clients/crm1/actions/devis.md",
            "---\ntype: crm-action\n---\n# Devis\n",
        ),
        (
            "Clients/crm1/personnes/jean.md",
            "---\ntype: crm-personne\n---\n# Jean\n",
        ),
        ("Clients/notes/a.md", "# A"),
    ])
}

#[test]
fn the_folders_of_the_fiches_of_a_crm_are_not_listed() {
    let session = with_a_crm();

    assert_eq!(
        call(&session, "list_folders", json!({})),
        json!({ "folders": ["Clients", "Clients/notes"] })
    );
}

#[test]
fn a_folder_with_an_ordinary_note_is_listed_even_when_named_like_a_crm() {
    let session = opened(&[
        ("Clients/crm1.md", "---\ntype: crm\n---\n# CRM1\n"),
        ("Clients/crm1/ma-note.md", "# Ma note"),
    ]);

    assert_eq!(
        call(&session, "list_folders", json!({})),
        json!({ "folders": ["Clients", "Clients/crm1"] })
    );
}

#[test]
fn asking_for_a_folder_of_the_fiches_of_a_crm_to_exist_changes_nothing_and_does_not_fail() {
    let session = with_a_crm();

    assert_eq!(
        call(&session, "create_folder", json!({ "path": "Clients/crm1" })),
        json!({ "path": "Clients/crm1" })
    );
    assert_eq!(
        call(
            &session,
            "create_folder",
            json!({ "path": "Clients/crm1/archives" })
        ),
        json!({ "path": "Clients/crm1/archives" })
    );
}

#[test]
fn a_workspace_without_a_folder_lists_none() {
    let session = opened(&[("a.md", "# A")]);

    assert_eq!(
        call(&session, "list_folders", json!({})),
        json!({ "folders": [] })
    );
}

#[test]
fn a_folder_is_renamed_in_place_with_its_notes_its_versions_and_its_search_index() {
    let session = tree();
    call(
        &session,
        "replace_in_note",
        json!({ "path": "Travail/Réunions/lundi.md", "old_text": "Ordre", "new_text": "Plan et ordre" }),
    );

    let renamed = call(
        &session,
        "rename_folder",
        json!({ "path": "Travail/Réunions", "name": " Comptes rendus " }),
    );

    assert_eq!(renamed, json!({ "path": "Travail/Comptes rendus" }));
    assert_eq!(
        session
            .read_note("Travail/Comptes rendus/lundi.md")
            .unwrap()
            .content,
        "# Lundi\n\nPlan et ordre du jour"
    );
    assert!(session.read_note("Travail/Réunions/lundi.md").is_err());
    assert_eq!(
        session
            .list_versions("Travail/Comptes rendus/lundi.md")
            .unwrap()
            .len(),
        1
    );
    let found_by_words = call(&session, "search_notes", json!({ "query": "ordre" }));
    assert_eq!(found_by_words[0]["path"], "Travail/Comptes rendus/lundi.md");
    assert_eq!(
        call(&session, "list_folders", json!({}))["folders"],
        json!(["perso", "Travail", "Travail/Comptes rendus"])
    );
}

#[test]
fn renaming_a_folder_to_its_own_name_changes_nothing() {
    let session = tree();

    let renamed = call(
        &session,
        "rename_folder",
        json!({ "path": "perso", "name": "perso" }),
    );

    assert_eq!(renamed, json!({ "path": "perso" }));
    assert!(session.read_note("perso/a.md").is_ok());
}

#[test]
fn the_attachments_of_the_notes_follow_a_renamed_or_moved_folder() {
    let store = Arc::new(
        InMemoryNoteStore::with_notes(&[("Travail/a.md", "# A")])
            .with_file("Travail", "plan.pdf", b"PDF"),
    );
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::clone(&store))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    call(
        &session,
        "add_attachment",
        json!({ "path": "Travail/a.md", "file": "Travail/plan.pdf" }),
    );

    call(
        &session,
        "rename_folder",
        json!({ "path": "Travail", "name": "Boulot" }),
    );
    call(&session, "create_folder", json!({ "path": "Archives" }));
    let moved = call(
        &session,
        "move_folder",
        json!({ "path": "Boulot", "folder": "Archives" }),
    );

    assert_eq!(moved, json!({ "path": "Archives/Boulot" }));
    let note = NotePath::parse("Archives/Boulot/a.md").unwrap();
    let attachment = AttachmentName::existing("plan.pdf").unwrap();
    assert_eq!(
        application::NoteStore::read_attachment(&*store, &note, &attachment),
        Ok(b"PDF".to_vec())
    );
    assert_eq!(
        session.read_note("Archives/Boulot/a.md").unwrap().content,
        "# A\n\n[plan.pdf](a.assets/plan.pdf)\n"
    );
}

#[test]
fn the_links_between_notes_are_left_as_the_interface_leaves_them() {
    let session = opened(&[
        ("Travail/plan.md", "# Plan"),
        ("autre.md", "# Autre\n\nVoir [[Travail/Plan]] et [[Plan]]."),
    ]);

    call(
        &session,
        "rename_folder",
        json!({ "path": "Travail", "name": "Boulot" }),
    );

    assert_eq!(
        session.read_note("autre.md").unwrap().content,
        "# Autre\n\nVoir [[Travail/Plan]] et [[Plan]]."
    );
}

#[test]
fn a_folder_is_moved_into_another_or_back_to_the_root_with_its_content() {
    let session = tree();

    let moved = call(
        &session,
        "move_folder",
        json!({ "path": "Travail/Réunions", "folder": "perso" }),
    );
    let at_root = call(
        &session,
        "move_folder",
        json!({ "path": "perso/Réunions", "folder": "" }),
    );

    assert_eq!(moved, json!({ "path": "perso/Réunions" }));
    assert_eq!(at_root, json!({ "path": "Réunions" }));
    assert!(session.read_note("Réunions/lundi.md").is_ok());
    assert_eq!(
        call(&session, "list_folders", json!({}))["folders"],
        json!(["perso", "Réunions", "Travail"])
    );
}

#[test]
fn a_folder_moved_where_it_already_is_stays() {
    let session = tree();

    let moved = call(
        &session,
        "move_folder",
        json!({ "path": "Travail/Réunions", "folder": "Travail" }),
    );

    assert_eq!(moved, json!({ "path": "Travail/Réunions" }));
}

#[test]
fn a_trashed_folder_goes_to_the_trash_with_its_content_and_is_never_erased() {
    let session = tree();

    let trashed = call(&session, "trash_folder", json!({ "path": "Travail" }));

    assert_eq!(trashed, json!({ "trashed": "Travail" }));
    assert_eq!(
        call(&session, "list_folders", json!({}))["folders"],
        json!(["perso"])
    );
    assert!(session.read_note("Travail/plan.md").is_err());
    let trash = session.list_trash().unwrap();
    assert!(trash.folders.contains(&"Travail/Réunions".to_owned()));
    let in_trash: Vec<_> = trash.notes.iter().map(|note| note.path.as_str()).collect();
    assert!(in_trash.contains(&"Travail/plan.md"), "{in_trash:?}");
    assert!(
        in_trash.contains(&"Travail/Réunions/lundi.md"),
        "{in_trash:?}"
    );
    assert_eq!(session.restore_folder("Travail").unwrap(), "Travail");
    assert!(session.read_note("Travail/plan.md").is_ok());
}

#[test]
fn a_folder_trashed_twice_gets_a_numbered_name_in_the_trash() {
    let session = opened(&[("Travail/a.md", "# A")]);
    call(&session, "trash_folder", json!({ "path": "Travail" }));
    call(&session, "create_folder", json!({ "path": "Travail" }));

    let again = call(&session, "trash_folder", json!({ "path": "Travail" }));

    assert_eq!(again, json!({ "trashed": "Travail 2" }));
}

#[test]
fn a_folder_name_the_interface_refuses_is_refused_with_its_message() {
    let session = tree();
    for name in [
        "",
        "   ",
        ".cache",
        "plans.assets",
        "Plans.ASSETS",
        "node_modules",
        "Node_Modules",
        "a/b",
        "a\\b",
        "a\0b",
    ] {
        assert_eq!(
            fails(
                &session,
                "rename_folder",
                json!({ "path": "perso", "name": name })
            ),
            invalid(name),
            "{name:?}"
        );
    }
    assert_eq!(
        fails(
            &session,
            "create_folder",
            json!({ "path": "Travail/node_modules" })
        ),
        invalid("node_modules")
    );
    assert!(session.read_note("perso/a.md").is_ok());
}

#[test]
fn a_folder_path_the_interface_refuses_is_refused_with_its_message() {
    let session = tree();
    for (tool, arguments) in [
        ("rename_folder", json!({ "path": "../x", "name": "y" })),
        ("move_folder", json!({ "path": "../x", "folder": "perso" })),
        ("move_folder", json!({ "path": "perso", "folder": ".git" })),
        ("trash_folder", json!({ "path": "Travail/.cache" })),
    ] {
        let said = fails(&session, tool, arguments.clone());
        assert!(
            said.starts_with("nom de dossier invalide : « "),
            "{tool}: {said}"
        );
    }
}

#[test]
fn the_root_is_never_renamed_moved_or_trashed() {
    let session = tree();
    let fixed = "l'espace de travail lui-même ne peut être ni renommé ni déplacé";

    assert_eq!(
        fails(
            &session,
            "rename_folder",
            json!({ "path": "", "name": "x" })
        ),
        fixed
    );
    assert_eq!(
        fails(
            &session,
            "move_folder",
            json!({ "path": "", "folder": "perso" })
        ),
        fixed
    );
    assert_eq!(
        fails(&session, "trash_folder", json!({ "path": "" })),
        "l'espace de travail lui-même ne peut pas aller dans la corbeille"
    );
}

#[test]
fn a_folder_that_is_missing_taken_or_inside_itself_is_refused_and_nothing_changes() {
    let session = tree();

    assert_eq!(
        fails(
            &session,
            "rename_folder",
            json!({ "path": "Absent", "name": "x" })
        ),
        "le dossier « Absent » n'existe pas"
    );
    assert_eq!(
        fails(
            &session,
            "rename_folder",
            json!({ "path": "perso", "name": "Travail" })
        ),
        "un dossier « Travail » existe déjà"
    );
    assert_eq!(
        fails(
            &session,
            "move_folder",
            json!({ "path": "Travail", "folder": "Travail/Réunions" })
        ),
        "le dossier « Travail » ne peut pas aller dans lui-même ni dans l'un de ses sous-dossiers"
    );
    assert_eq!(
        fails(
            &session,
            "move_folder",
            json!({ "path": "perso", "folder": "Absent" })
        ),
        "le dossier « Absent » n'existe pas"
    );
    assert_eq!(
        fails(&session, "trash_folder", json!({ "path": "Absent" })),
        "le dossier « Absent » n'existe pas"
    );
    assert_eq!(
        call(&session, "list_folders", json!({}))["folders"],
        json!(["perso", "Travail", "Travail/Réunions"])
    );
}

#[test]
fn each_folder_tool_names_what_it_lacks() {
    let session = tree();

    for (tool, arguments, missing) in [
        ("rename_folder", json!({ "name": "x" }), "path"),
        ("rename_folder", json!({ "path": "perso" }), "name"),
        ("move_folder", json!({ "folder": "perso" }), "path"),
        ("move_folder", json!({ "path": "Travail" }), "folder"),
        ("trash_folder", json!({}), "path"),
    ] {
        assert_eq!(
            fails(&session, tool, arguments),
            format!("il manque « {missing} »"),
            "{tool}"
        );
    }
}

#[test]
fn another_workspace_is_listed_and_changed_by_its_name_without_touching_the_open_one() {
    let world = world();
    world.allow(&["Notes", "Travail"]);
    world.found(
        "create_folder",
        json!({ "path": "Recettes/Pains", "workspace": "Notes" }),
    );

    let listed = world.found("list_folders", json!({ "workspace": "notes" }));
    let renamed = world.found(
        "rename_folder",
        json!({ "path": "Recettes", "name": "Cuisine", "workspace": "Notes" }),
    );
    let moved = world.found(
        "move_folder",
        json!({ "path": "Cuisine/Pains", "folder": "", "workspace": "Notes" }),
    );
    let trashed = world.found(
        "trash_folder",
        json!({ "path": "Cuisine", "workspace": "Notes" }),
    );

    assert_eq!(listed, json!({ "folders": ["Recettes", "Recettes/Pains"] }));
    assert_eq!(renamed, json!({ "path": "Cuisine" }));
    assert_eq!(moved, json!({ "path": "Pains" }));
    assert_eq!(trashed, json!({ "trashed": "Cuisine" }));
    assert_eq!(
        world.found("list_folders", json!({ "workspace": "Notes" })),
        json!({ "folders": ["Pains"] })
    );
    assert_eq!(
        world.found("list_folders", json!({})),
        json!({ "folders": [] })
    );
    assert_eq!(world.opened_name(), "Travail");
}

#[test]
fn a_workspace_that_is_not_allowed_is_neither_listed_nor_changed() {
    let world = world();
    world.allow(&["Travail"]);

    for tool in [
        "list_folders",
        "rename_folder",
        "move_folder",
        "trash_folder",
    ] {
        let said = world.refused(
            tool,
            json!({ "path": "x", "name": "y", "folder": "", "workspace": "Notes" }),
        );
        assert!(said.contains("Notes"), "{tool}: {said}");
        assert!(said.contains("Travail"), "{tool}: {said}");
    }
    assert!(
        application::NoteStore::folders(&*world.notes)
            .unwrap()
            .is_empty()
    );
}
