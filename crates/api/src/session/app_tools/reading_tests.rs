//! L'outil `read_note`, joué par son protocole sur des faux (fiche 0076) : le texte d'une note
//! simple, en-tête et corps séparés, ses refus dits à l'IA, la limite de taille toujours dite.

use domain::reading::MAX_READ_CHARACTERS;
use serde_json::{Value, json};

use super::tests::{found, notes_workspace, opened, refused};
use super::workspaces_tests::world;
use crate::session::Session;

/// Lit la note pendant un tour ; rend ce que l'outil rend, lu en JSON.
fn read(session: &Session, path: &str) -> Value {
    let tools = session.open_tools(notes_workspace()).unwrap();
    found(
        session,
        tools.key().as_str(),
        "read_note",
        json!({ "path": path }),
    )
}

/// La lecture échoue ; rend pourquoi.
fn unread(session: &Session, arguments: Value) -> String {
    let tools = session.open_tools(notes_workspace()).unwrap();
    refused(session, tools.key().as_str(), "read_note", arguments)
}

#[test]
fn a_simple_note_is_given_whole_with_its_header_apart() {
    let session = opened(&[(
        "Travail/pain.md",
        "---\ntags: [maison]\n---\n# Pain\n\nLa farine.\n",
    )]);

    let result = read(&session, "Travail/pain.md");

    assert_eq!(
        result,
        json!({
            "path": "Travail/pain.md",
            "title": "Pain",
            "header": "---\ntags: [maison]\n---\n",
            "body": "# Pain\n\nLa farine.\n",
            "characters": 19,
            "truncated": false,
        })
    );
}

#[test]
fn a_note_without_a_header_has_an_empty_one() {
    let session = opened(&[("a.md", "# Alpha\ntexte")]);

    let result = read(&session, "a.md");

    assert_eq!(result["header"], "");
    assert_eq!(result["body"], "# Alpha\ntexte");
}

#[test]
fn the_header_then_the_body_are_the_file_to_copy_a_text_for_replace_in_note() {
    let file = "---\ntags: [maison]\n---\n# Pain\n\nLa farine.\nLe sel.\n";
    let session = opened(&[("a.md", file)]);
    let result = read(&session, "a.md");
    let whole = format!(
        "{}{}",
        result["header"].as_str().unwrap(),
        result["body"].as_str().unwrap()
    );
    assert_eq!(whole, file);

    let tools = session.open_tools(notes_workspace()).unwrap();
    found(
        &session,
        tools.key().as_str(),
        "replace_in_note",
        json!({ "path": "a.md", "old_text": "tags: [maison]\n---\n# Pain",
                "new_text": "tags: [maison, pain]\n---\n# Pain" }),
    );

    assert!(
        session
            .read_note("a.md")
            .unwrap()
            .content
            .starts_with("---\ntags: [maison, pain]\n---\n")
    );
}

#[test]
fn a_note_without_a_title_line_is_titled_by_its_file() {
    let session = opened(&[("mon-plan.md", "texte seul")]);

    assert_eq!(read(&session, "mon-plan.md")["title"], "mon-plan");
}

#[test]
fn a_long_note_is_cut_at_a_whole_line_and_the_answer_says_so() {
    let line = format!("{}\n", "a".repeat(999));
    let body = line.repeat(70);
    let session = opened(&[("long.md", &format!("# Long\n{body}"))]);

    let result = read(&session, "long.md");

    let shown = result["body"].as_str().unwrap();
    assert!(shown.chars().count() <= MAX_READ_CHARACTERS);
    assert!(shown.ends_with('\n'));
    assert!(shown.starts_with("# Long\n"));
    assert_eq!(result["truncated"], true);
    assert_eq!(result["characters"], 7 + 70 * 1000);
    let message = result["message"].as_str().unwrap();
    let counted = format!("{} caractères sur 70007", shown.chars().count());
    for expected in [counted.as_str(), "la limite est de 60000", "search_notes"] {
        assert!(message.contains(expected), "{expected} : {message}");
    }
}

#[test]
fn a_note_that_fits_has_no_message() {
    let session = opened(&[("a.md", "# A")]);

    assert!(read(&session, "a.md").get("message").is_none());
}

#[test]
fn a_missing_or_invalid_path_and_a_missing_note_are_refused() {
    let session = opened(&[("a.md", "# A")]);

    assert_eq!(unread(&session, json!({})), "il manque « path »");
    assert_eq!(
        unread(&session, json!({ "path": " " })),
        "il manque « path »"
    );
    assert_eq!(
        unread(&session, json!({ "path": "../a.md" })),
        session.read_note("../a.md").unwrap_err().message
    );
    assert_eq!(
        unread(&session, json!({ "path": "/etc/passwd" })),
        session.read_note("/etc/passwd").unwrap_err().message
    );
    assert_eq!(
        unread(&session, json!({ "path": "b.md" })),
        "la note « b.md » n'existe pas"
    );
}

#[test]
fn a_research_notebook_is_sent_to_add_entry_and_the_search() {
    let session = opened(&[("c.md", "---\ntype: cahier-de-recherche\n---\n# Levures\n")]);

    assert_eq!(
        unread(&session, json!({ "path": "c.md" })),
        "cette note est un cahier de recherche : read_note ne lit que les notes simples ; on y \
         ajoute une entrée avec add_entry, et ses entrées se retrouvent avec search_notes ou \
         search_by_meaning"
    );
}

#[test]
fn a_crm_and_its_fiches_are_sent_to_read_crm_and_the_tools_that_change_them() {
    let session = opened(&[
        ("clients.md", "---\ntype: crm\n---\n# Clients\n"),
        (
            "clients/actions/a.md",
            "---\ntype: crm-action\n---\n# Appeler\n",
        ),
    ]);

    let crm = unread(&session, json!({ "path": "clients.md" }));
    let fiche = unread(&session, json!({ "path": "clients/actions/a.md" }));

    assert!(crm.starts_with("cette note est un CRM : read_note ne lit que les notes simples"));
    assert!(fiche.starts_with(
        "cette note est une fiche de CRM, de type « crm-action » : read_note ne lit que les notes simples"
    ));
    for said in [crm, fiche] {
        for tool in [
            "read_crm",
            "create_crm_action",
            "change_crm_person",
            "change_crm_stages",
        ] {
            assert!(said.contains(tool), "{tool} : {said}");
        }
        assert!(!said.contains("pas encore"), "{said}");
    }
}

#[test]
fn a_mind_map_is_refused_with_the_name_of_the_tool_that_reads_it() {
    let session = opened(&[("m.md", "---\ntype: carte-mentale\n---\n# Idées\n- un\n")]);

    assert_eq!(
        unread(&session, json!({ "path": "m.md" })),
        "cette note est une carte mentale : read_note ne lit que les notes simples ; lisez la \
         carte en arbre avec read_mind_map (le même chemin dans path)"
    );
}

#[test]
fn a_canvas_is_sent_to_read_canvas_and_the_tools_that_change_it() {
    let session = opened(&[("x.canvas", "{}")]);

    let said = unread(&session, json!({ "path": "x.canvas" }));

    assert!(said.starts_with("cette note est un canvas : read_note ne lit que les notes simples"));
    for tool in ["read_canvas", "add_canvas_card", "change_canvas_group"] {
        assert!(said.contains(tool), "{tool} : {said}");
    }
}

#[test]
fn reading_a_note_writes_nothing_and_keeps_no_version() {
    let session = opened(&[("a.md", "# A\ntexte")]);

    read(&session, "a.md");

    assert_eq!(session.read_note("a.md").unwrap().content, "# A\ntexte");
    assert!(session.list_versions("a.md").unwrap().is_empty());
}

#[test]
fn a_note_is_read_in_another_workspace_without_changing_the_open_one() {
    let world = world();
    world.allow(&["Notes", "Travail"]);

    let result = world.found(
        "read_note",
        json!({ "path": "pain.md", "workspace": "notes" }),
    );

    assert_eq!(result["body"], "# Pain\n\nLa farine.");
    assert_eq!(result["title"], "Pain");
    assert_eq!(
        world.found("read_note", json!({ "path": "devis.md" }))["body"],
        "# Devis\n\nLe client."
    );
    let missing = world.refused(
        "read_note",
        json!({ "path": "devis.md", "workspace": "Notes" }),
    );
    assert_eq!(missing, "la note « devis.md » n'existe pas");
}

#[test]
fn a_note_is_not_read_in_a_workspace_that_is_not_allowed() {
    let world = world();
    world.allow(&["Travail"]);

    let error = world.refused(
        "read_note",
        json!({ "path": "pain.md", "workspace": "Notes" }),
    );

    assert_eq!(
        error,
        "aucun espace de travail autorisé ne s'appelle « Notes » ; ceux que les IA peuvent \
         utiliser : « Travail »"
    );
    let unallowed = world.refused("read_note", json!({ "path": "pain.md" }));
    assert!(!unallowed.contains("farine"), "{unallowed}");
}
