//! Les outils des favoris, joués par leur protocole sur des faux (fiche 0102) : la note des
//! favoris est celle des préférences, pour l'espace réellement visé ; les lignes ajoutées et
//! retirées sont celles de l'étoile.

use application::{NoteStore, Preferences, WorkspaceName};
use domain::NotePath;
use serde_json::json;

use super::canvas_changing_tests::{done, failed};
use super::tests::opened;
use super::workspaces_tests::world;

const NOTES: [(&str, &str); 5] = [
    ("favoris.md", "# Favoris\n"),
    ("courses.md", "# Courses"),
    ("plan.canvas", "{}"),
    ("fiche.md", "---\ntype: crm-personne\n---\n# Léa"),
    ("carte.md", "---\ntype: carte-mentale\n---\n# Carte"),
];

fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

/// Un espace « Notes » dont `favoris.md` est la note des favoris.
fn with_favorites() -> crate::Session {
    let session = opened(&NOTES);
    session.choose_favorites_note("favoris.md").unwrap();
    session
}

fn favorites_text(session: &crate::Session) -> String {
    session.read_note("favoris.md").unwrap().content
}

#[test]
fn add_favorite_writes_a_line_at_the_end_of_the_favorites_note() {
    let session = with_favorites();

    let added = done(&session, "add_favorite", json!({ "path": "courses.md" }));
    let canvas = done(&session, "add_favorite", json!({ "path": "plan.canvas" }));

    assert_eq!(added, json!({ "path": "courses.md", "favorite": true }));
    assert_eq!(canvas, json!({ "path": "plan.canvas", "favorite": true }));
    assert_eq!(
        favorites_text(&session),
        "# Favoris\n- [[Courses]]\n- [[plan.canvas]]\n"
    );
}

#[test]
fn remove_favorite_takes_off_every_line_of_the_content() {
    let session = with_favorites();
    session
        .replace_in_note(
            "favoris.md",
            "# Favoris\n",
            "# Favoris\n- [[Courses]]\n- [[carte]]\n1. [[courses]]\n",
            false,
        )
        .unwrap();

    let removed = done(&session, "remove_favorite", json!({ "path": "courses.md" }));

    assert_eq!(
        removed,
        json!({ "path": "courses.md", "favorite": false, "removed_lines": 2 })
    );
    assert_eq!(favorites_text(&session), "# Favoris\n- [[carte]]\n");
}

#[test]
fn removing_what_is_not_a_favorite_says_zero_lines() {
    let session = with_favorites();
    assert_eq!(
        done(&session, "remove_favorite", json!({ "path": "courses.md" })),
        json!({ "path": "courses.md", "favorite": false, "removed_lines": 0 })
    );
    assert_eq!(favorites_text(&session), "# Favoris\n");
}

#[test]
fn list_favorites_gives_the_note_and_the_favorites_in_the_order_of_the_note() {
    let session = with_favorites();
    done(&session, "add_favorite", json!({ "path": "plan.canvas" }));
    done(&session, "add_favorite", json!({ "path": "carte.md" }));
    done(&session, "add_favorite", json!({ "path": "courses.md" }));

    let listed = done(&session, "list_favorites", json!({}));

    assert_eq!(
        listed,
        json!({
            "note": { "path": "favoris.md", "title": "Favoris" },
            "favorites": [
                { "path": "plan.canvas", "title": "plan", "type": "canvas" },
                { "path": "carte.md", "title": "Carte", "type": "carte-mentale" },
                { "path": "courses.md", "title": "Courses", "type": "note" },
            ]
        })
    );
}

#[test]
fn without_a_favorites_note_the_three_tools_say_so() {
    let session = opened(&NOTES);
    for (tool, arguments) in [
        ("add_favorite", json!({ "path": "courses.md" })),
        ("remove_favorite", json!({ "path": "courses.md" })),
        ("list_favorites", json!({})),
    ] {
        assert_eq!(
            failed(&session, tool, arguments),
            "Aucune note des favoris n'est choisie.",
            "{tool}"
        );
    }
}

#[test]
fn a_crm_fiche_and_the_favorites_note_itself_are_refused() {
    let session = with_favorites();
    assert_eq!(
        failed(&session, "add_favorite", json!({ "path": "fiche.md" })),
        "Une fiche du CRM n'a pas d'étoile : seul le CRM entier se met en favori."
    );
    assert_eq!(
        failed(&session, "add_favorite", json!({ "path": "favoris.md" })),
        "La note des favoris ne se met pas elle-même en favori."
    );
    assert_eq!(
        failed(&session, "add_favorite", json!({ "path": "absente.md" })),
        "la note « absente.md » n'existe pas"
    );
    assert_eq!(favorites_text(&session), "# Favoris\n");
}

#[test]
fn the_tools_need_a_path_and_keep_the_text_before_the_change_as_a_version() {
    let session = with_favorites();
    assert_eq!(
        failed(&session, "add_favorite", json!({})),
        "il manque « path »"
    );
    assert_eq!(
        failed(&session, "remove_favorite", json!({ "path": " " })),
        "il manque « path »"
    );
    done(&session, "add_favorite", json!({ "path": "courses.md" }));
    let versions = session.list_versions("favoris.md").unwrap();
    assert_eq!(versions.len(), 1);
}

#[test]
fn each_workspace_has_its_own_favorites_note_and_the_tool_uses_the_one_of_the_workspace_it_aims_at()
{
    let world = world();
    world.allow(&["Notes", "Travail"]);
    let preferences = &world.preferences;
    let workspaces = preferences
        .workspaces()
        .unwrap()
        .choosing_favorites_note(
            &WorkspaceName::new("Notes").unwrap(),
            Some(path("favoris-notes.md")),
        )
        .unwrap();
    preferences.save_workspaces(&workspaces).unwrap();
    world
        .notes
        .write(&path("favoris-notes.md"), "# Favoris des notes\n")
        .unwrap();
    world.session.rebuild_index().unwrap();

    let added = world.found(
        "add_favorite",
        json!({ "path": "pain.md", "workspace": "Notes" }),
    );
    let refused = world.refused("list_favorites", json!({}));

    assert_eq!(added, json!({ "path": "pain.md", "favorite": true }));
    assert_eq!(refused, "Aucune note des favoris n'est choisie.");
    let text = world.notes.read(&path("favoris-notes.md")).unwrap().content;
    assert_eq!(text, "# Favoris des notes\n- [[Pain]]\n");
    let listed = world.found("list_favorites", json!({ "workspace": "notes" }));
    assert_eq!(listed["favorites"][0]["path"], "pain.md");
    assert_eq!(world.opened_name(), "Travail");
}
