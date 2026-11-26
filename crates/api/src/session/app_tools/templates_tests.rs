//! Les modèles de note pour les IA, joués par le protocole sur des faux (fiche 0077) : le dossier
//! des modèles est celui des préférences, pour l'espace réellement visé, relu à chaque appel.

use application::testing::InMemoryNoteStore;
use application::{NoteStore, Preferences, WorkspaceName};
use domain::{Folder, NotePath};
use serde_json::{Value, json};

use super::workspaces_tests::{World, world};

/// « Notes » (`pain.md`) puis « Travail » (`devis.md`, ouvert), chacun avec ses modèles ; les deux
/// sont cochés pour les IA. Aucun dossier des modèles n'est encore choisi.
fn with_templates() -> World {
    let world = world();
    world
        .notes
        .write(&path("Gabarits/recette.md"), "# Recette du {{title}}")
        .unwrap();
    world
        .notes
        .write(&path("Modèles/autre.md"), "# Autre")
        .unwrap();
    world
        .travail
        .write(&path("Modèles/réunion.md"), "# Réunion")
        .unwrap();
    world
        .travail
        .write(&path("Modèles/Vieux/v.md"), "# Vieux")
        .unwrap();
    world.allow(&["Notes", "Travail"]);
    // « Travail » est ouvert : son index ne connaît pas encore les modèles écrits ci-dessus.
    world.session.rebuild_index().unwrap();
    world
}

fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

/// Le dossier des modèles de l'espace `name` devient `folder` (aucun pour `None`), comme le fait
/// l'interface : par les préférences.
fn choose(world: &World, name: &str, folder: Option<&str>) {
    let workspaces = world.preferences.workspaces().unwrap();
    let chosen = workspaces
        .choosing_templates_folder(
            &WorkspaceName::new(name).unwrap(),
            folder.map(|f| Folder::parse(f).unwrap()),
        )
        .unwrap();
    world.preferences.save_workspaces(&chosen).unwrap();
}

fn names(listed: &Value) -> Vec<&str> {
    listed
        .as_array()
        .unwrap()
        .iter()
        .map(|template| template["name"].as_str().unwrap())
        .collect()
}

fn has(store: &InMemoryNoteStore, path_text: &str) -> bool {
    store.read(&path(path_text)).is_ok()
}

#[test]
fn the_templates_of_the_open_workspace_come_from_the_folder_chosen_for_it() {
    let world = with_templates();
    choose(&world, "Travail", Some("Modèles"));

    let listed = world.found("list_templates", json!({}));

    assert_eq!(names(&listed), ["Réunion"]);
}

#[test]
fn another_workspace_has_its_own_templates_folder() {
    let world = with_templates();
    choose(&world, "Travail", Some("Modèles"));
    choose(&world, "Notes", Some("Gabarits"));

    let notes = world.found("list_templates", json!({ "workspace": "Notes" }));
    let travail = world.found("list_templates", json!({ "workspace": "travail" }));
    let open = world.found("list_templates", json!({}));

    assert_eq!(names(&notes), ["Recette du {{title}}"]);
    assert_eq!(names(&travail), ["Réunion"]);
    assert_eq!(names(&open), ["Réunion"]);
}

#[test]
fn a_note_is_created_from_a_template_of_another_workspace_without_touching_the_open_one() {
    let world = with_templates();
    choose(&world, "Notes", Some("Gabarits"));

    let created = world.found(
        "create_note_from_template",
        json!({ "template": "Recette du {{title}}", "title": "Gâteau", "workspace": "Notes" }),
    );

    assert_eq!(created, json!({ "path": "gateau.md" }));
    assert!(has(&world.notes, "gateau.md"));
    assert!(!has(&world.travail, "gateau.md"));
    assert_eq!(world.opened_name(), "Travail");
}

#[test]
fn a_workspace_without_a_templates_folder_says_so_with_its_name_even_if_another_has_one() {
    let world = with_templates();
    choose(&world, "Travail", Some("Modèles"));
    let expected = "aucun dossier des modèles n'est choisi pour l'espace de travail « Notes » : \
                    l'utilisateur peut en choisir un dans les Réglages de MALOREAN Notes, onglet \
                    « Écriture »";

    let listed = world.refused("list_templates", json!({ "workspace": "Notes" }));
    let created = world.refused(
        "create_note_from_template",
        json!({ "template": "x", "title": "Y", "workspace": "Notes" }),
    );

    assert_eq!(listed, expected);
    assert_eq!(created, expected);
    assert!(!has(&world.notes, "y.md"));
}

#[test]
fn the_folder_is_read_again_at_each_call() {
    let world = with_templates();
    choose(&world, "Travail", Some("Modèles"));
    assert_eq!(
        names(&world.found("list_templates", json!({}))),
        ["Réunion"]
    );

    choose(&world, "Travail", None);
    let none = world.refused("list_templates", json!({}));
    choose(&world, "Travail", Some("Modèles/Vieux"));

    assert!(none.contains("« Travail »"), "{none}");
    assert_eq!(names(&world.found("list_templates", json!({}))), ["Vieux"]);
}

#[test]
fn a_folder_that_no_longer_exists_gives_no_template() {
    let world = with_templates();
    choose(&world, "Travail", Some("Disparu"));

    assert_eq!(world.found("list_templates", json!({})), json!([]));
    assert_eq!(
        world.refused(
            "create_note_from_template",
            json!({ "template": "Réunion", "title": "X" })
        ),
        "aucun modèle « Réunion » : voyez list_templates"
    );
}

#[test]
fn a_workspace_that_is_not_allowed_shows_nothing_of_its_templates() {
    let world = with_templates();
    choose(&world, "Notes", Some("Gabarits"));
    world.session.set_workspace_allowed("Notes", false).unwrap();

    let error = world.refused("list_templates", json!({ "workspace": "Notes" }));

    assert_eq!(
        error,
        "aucun espace de travail autorisé ne s'appelle « Notes » ; ceux que les IA peuvent \
         utiliser : « Travail »"
    );
    assert!(!error.contains("Gabarits"), "{error}");
}

#[test]
fn the_tools_never_give_the_path_of_the_templates_folder() {
    let world = with_templates();
    choose(&world, "Travail", Some("Modèles"));

    let listed = world.found("list_templates", json!({})).to_string();
    let created = world
        .found(
            "create_note_from_template",
            json!({ "template": "Réunion", "title": "Lundi" }),
        )
        .to_string();

    for text in [listed, created] {
        assert!(!text.contains("Modèles"), "{text}");
        assert!(!text.contains("/Users"), "{text}");
    }
}
