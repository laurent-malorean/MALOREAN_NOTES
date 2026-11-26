//! La création d'un cahier de recherche par l'outil `create_research_notebook`, jouée par son
//! protocole sur des faux (fiche 0087) : les règles de l'écran, puis `add_entry` sur le cahier neuf.

use serde_json::json;

use super::canvas_changing_tests::{done, failed};
use super::tests::opened;

const NEW_NOTEBOOK: &str = "---\ntype: cahier-de-recherche\n---\n# Levures\n";

#[test]
fn a_notebook_is_created_without_entry_with_the_name_taken_from_its_title_in_a_folder_made_on_the_way()
 {
    let session = opened(&[("Labo/levures.md", "# Autre")]);

    let created = done(
        &session,
        "create_research_notebook",
        json!({ "title": "  Levures ", "folder": "Labo" }),
    );
    let at_root = done(
        &session,
        "create_research_notebook",
        json!({ "title": "Mon cahier" }),
    );
    let in_new_folder = done(
        &session,
        "create_research_notebook",
        json!({ "title": "Essais", "folder": "Labo/2027" }),
    );

    assert_eq!(created, json!({ "path": "Labo/levures-2.md" }));
    assert_eq!(at_root, json!({ "path": "mon-cahier.md" }));
    assert_eq!(in_new_folder, json!({ "path": "Labo/2027/essais.md" }));
    assert_eq!(
        session.read_note("Labo/levures-2.md").unwrap().content,
        NEW_NOTEBOOK
    );
    assert_eq!(
        session.read_note("Labo/levures.md").unwrap().content,
        "# Autre"
    );
    assert!(
        session
            .list_folders()
            .unwrap()
            .contains(&"Labo/2027".to_owned())
    );
}

#[test]
fn a_notebook_without_a_title_or_with_a_bad_folder_is_refused_and_nothing_is_written() {
    let session = opened(&[]);

    assert_eq!(
        failed(&session, "create_research_notebook", json!({})),
        "il manque « title »"
    );
    assert_eq!(
        failed(
            &session,
            "create_research_notebook",
            json!({ "title": "  ", "folder": "Labo" })
        ),
        "il manque « title »"
    );
    assert_eq!(
        failed(
            &session,
            "create_research_notebook",
            json!({ "title": "X", "folder": "../x" })
        ),
        "nom de dossier invalide : « ../x »"
    );
    assert!(session.list_folders().unwrap().is_empty());
}

#[test]
fn an_entry_is_added_to_a_notebook_just_created_and_the_entries_are_read_back() {
    let session = opened(&[]);
    let path = done(
        &session,
        "create_research_notebook",
        json!({ "title": "Levures" }),
    )["path"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(path, "levures.md");
    assert!(session.list_entries(&path).unwrap().is_empty());

    let added = done(
        &session,
        "add_entry",
        json!({ "path": path, "text": "Levure A\nmousse" }),
    );

    assert_eq!(added["path"], "levures.md");
    assert_eq!(added["entry"]["text"], "Levure A\nmousse");
    let entries = session.list_entries(&path).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].text, "Levure A\nmousse");
    assert!(
        session
            .read_note(&path)
            .unwrap()
            .content
            .starts_with(NEW_NOTEBOOK)
    );
}

#[test]
fn a_notebook_is_created_in_another_workspace_without_touching_the_open_one() {
    let world = super::workspaces_tests::world();
    world.allow(&["Notes", "Travail"]);

    let created = world.found(
        "create_research_notebook",
        json!({ "title": "Ailleurs", "folder": "Labo", "workspace": "Notes" }),
    );

    assert_eq!(created, json!({ "path": "Labo/ailleurs.md" }));
    let path = domain::NotePath::parse("Labo/ailleurs.md").unwrap();
    assert_eq!(
        application::NoteStore::read(&*world.notes, &path)
            .unwrap()
            .content,
        "---\ntype: cahier-de-recherche\n---\n# Ailleurs\n"
    );
    assert!(application::NoteStore::read(&*world.travail, &path).is_err());
    assert_eq!(world.opened_name(), "Travail");
}

#[test]
fn the_catalog_tells_how_to_create_a_notebook_and_where_the_entries_go() {
    use domain::app_tools::AppTool;

    use super::catalog::tool_description;
    let describe = |tool: AppTool| {
        tool_description(tool)["description"]
            .as_str()
            .unwrap()
            .to_owned()
    };
    let mut fields: Vec<_> =
        tool_description(AppTool::CreateResearchNotebook)["inputSchema"]["properties"]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
    fields.sort();
    assert_eq!(fields, ["folder", "title", "workspace"]);
    for expected in [
        "Crée un cahier de recherche",
        "type: cahier-de-recherche",
        "nom du fichier tiré du titre",
        "sans écraser",
        "créé avec ses parents",
        "sans entrée",
        "Rend son chemin",
        "`add_entry`",
    ] {
        assert!(
            describe(AppTool::CreateResearchNotebook).contains(expected),
            "{expected}"
        );
    }
    assert!(describe(AppTool::AddEntry).contains("créé par `create_research_notebook`"));
    assert!(
        describe(AppTool::CreateNote)
            .contains("un cahier de recherche avec `create_research_notebook`")
    );
}
