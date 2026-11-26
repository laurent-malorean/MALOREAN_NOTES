//! Un CRM part à la corbeille, en revient et se déplace avec ses fiches, par les outils des IA et
//! par l'interface : l'index, la liste des dossiers et le Kanban suivent (fiche 0091).

use serde_json::json;

use super::crm_actions_tests::{done, fiche};
use super::tests::opened;
use crate::NoteOrderItem;
use crate::session::Session;

const CRM: &str = "---\ntype: crm\n---\n# CRM1\n";
const ACTION: &str =
    "---\ntype: crm-action\nstatut: TODO\ndate: 2026-11-24\n---\n# Devis mystère\n";
const PERSON: &str = "---\ntype: crm-personne\n---\n# Marie\n";

fn session() -> Session {
    opened(&[
        ("toto/crm1.md", CRM),
        ("toto/crm1/actions/a.md", ACTION),
        ("toto/crm1/personnes/p.md", PERSON),
        ("toto/autre.md", "# Autre"),
    ])
}

fn found(session: &Session, words: &str) -> Vec<String> {
    session
        .search_notes(words, NoteOrderItem::Modified)
        .unwrap()
        .into_iter()
        .map(|r| r.path)
        .collect()
}

fn kanban_titles(session: &Session) -> Vec<String> {
    let read = done(session, "read_crm", json!({ "path": "toto/crm1.md" }));
    read["columns"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|c| c["actions"].as_array().unwrap().clone())
        .map(|a| a["title"].as_str().unwrap().to_owned())
        .collect()
}

#[test]
fn trashing_a_crm_by_the_tool_takes_its_fiches_out_of_the_index_and_the_folder_list() {
    let session = session();
    assert_eq!(found(&session, "mystère"), ["toto/crm1/actions/a.md"]);
    assert_eq!(session.list_folders().unwrap(), ["toto"]);
    let result = done(&session, "trash_note", json!({ "path": "toto/crm1.md" }));
    assert_eq!(result, json!({ "trashed": "toto/crm1.md" }));
    assert!(found(&session, "mystère").is_empty());
    assert!(found(&session, "Marie").is_empty());
    assert_eq!(session.list_folders().unwrap(), ["toto"]);
    assert!(session.read_note("toto/crm1/actions/a.md").is_err());
    assert_eq!(session.list_trash().unwrap().notes.len(), 3);
}

#[test]
fn restoring_the_crm_brings_back_the_fiches_the_index_and_the_kanban() {
    let session = session();
    session.trash_note("toto/crm1.md").unwrap();
    session.restore_note("toto/crm1.md").unwrap();
    assert_eq!(found(&session, "mystère"), ["toto/crm1/actions/a.md"]);
    assert_eq!(kanban_titles(&session), ["Devis mystère"]);
    assert!(session.list_trash().unwrap().notes.is_empty());
    assert_eq!(session.list_folders().unwrap(), ["toto"]);
}

#[test]
fn the_interface_counts_the_fiches_that_go_with_a_crm() {
    let session = session();
    assert_eq!(session.crm_fiches_in_trash("toto/crm1.md").unwrap(), 2);
    assert_eq!(session.crm_fiches_in_trash("toto/autre.md").unwrap(), 0);
    assert!(session.crm_fiches_in_trash("../x.md").is_err());
}

#[test]
fn moving_a_crm_by_the_tool_moves_its_fiches_and_the_index_follows() {
    let session = session();
    session.create_folder("", "Perso").unwrap();
    let moved = done(
        &session,
        "move_note",
        json!({ "path": "toto/crm1.md", "folder": "Perso" }),
    );
    assert_eq!(moved["path"], "Perso/crm1.md");
    assert_eq!(found(&session, "mystère"), ["Perso/crm1/actions/a.md"]);
    assert!(fiche(&session, "Perso/crm1/personnes/p.md").contains("Marie"));
    assert_eq!(session.list_folders().unwrap(), ["Perso", "toto"]);
}

#[test]
fn fiches_left_without_their_crm_stay_visible_and_can_be_deleted() {
    let session = opened(&[
        ("toto/crm1/actions/a.md", ACTION),
        ("toto/crm1/actions/b.md", ACTION),
    ]);
    assert_eq!(
        session.list_folders().unwrap(),
        ["toto", "toto/crm1", "toto/crm1/actions"]
    );
    session.trash_folder("toto/crm1").unwrap();
    assert_eq!(session.list_trash().unwrap().notes.len(), 2);
}
