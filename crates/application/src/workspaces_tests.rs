use super::*;

fn name(text: &str) -> WorkspaceName {
    WorkspaceName::new(text).unwrap()
}

fn workspace(text: &str, folder: &str) -> Workspace {
    Workspace {
        name: name(text),
        location: WorkspaceLocation::new(folder).unwrap(),
    }
}

fn names(workspaces: &Workspaces) -> Vec<&str> {
    workspaces.list().iter().map(|w| w.name.as_str()).collect()
}

fn two() -> Workspaces {
    Workspaces::default()
        .added(workspace("Notes", "/notes"))
        .unwrap()
        .added(workspace("Travail", "/travail"))
        .unwrap()
}

#[test]
fn a_name_is_kept_without_surrounding_spaces() {
    assert_eq!(name("  Mes notes ").as_str(), "Mes notes");
}

#[test]
fn an_empty_name_is_refused() {
    assert_eq!(WorkspaceName::new("   "), Err(AppError::EmptyWorkspaceName));
}

#[test]
fn names_are_compared_ignoring_case() {
    assert!(name("Notes").same_as(&name("NOTES")));
    assert!(!name("Notes").same_as(&name("Notes 2")));
}

#[test]
fn nothing_is_known_at_first() {
    let workspaces = Workspaces::default();
    assert!(workspaces.list().is_empty());
    assert_eq!(workspaces.active(), None);
}

#[test]
fn an_added_workspace_comes_last_and_becomes_the_open_one() {
    let workspaces = two();
    assert_eq!(names(&workspaces), ["Notes", "Travail"]);
    assert_eq!(workspaces.active(), Some(&workspace("Travail", "/travail")));
}

#[test]
fn two_workspaces_never_share_a_name_or_a_folder() {
    assert_eq!(
        two().added(workspace("travail", "/autre")),
        Err(AppError::WorkspaceNameTaken("travail".into()))
    );
    assert_eq!(
        two().added(workspace("Autre", "/notes")),
        Err(AppError::WorkspaceFolderTaken("Notes".into()))
    );
}

#[test]
fn a_workspace_is_found_by_its_name_ignoring_case() {
    assert_eq!(
        two().find(&name("notes")),
        Ok(&workspace("Notes", "/notes"))
    );
    assert_eq!(
        two().find(&name("Perso")),
        Err(AppError::WorkspaceNotFound("Perso".into()))
    );
}

#[test]
fn opening_another_workspace_makes_it_the_open_one() {
    let workspaces = two().activated(&name("notes")).unwrap();
    assert_eq!(workspaces.active(), Some(&workspace("Notes", "/notes")));
    assert_eq!(
        two().activated(&name("Perso")),
        Err(AppError::WorkspaceNotFound("Perso".into()))
    );
}

#[test]
fn renaming_changes_the_name_only() {
    let workspaces = two().renamed(&name("Notes"), name("Perso")).unwrap();
    assert_eq!(workspaces.list()[0], workspace("Perso", "/notes"));
    assert_eq!(workspaces.active(), Some(&workspace("Travail", "/travail")));
}

#[test]
fn the_open_workspace_stays_open_once_renamed() {
    let workspaces = two().renamed(&name("travail"), name("Bureau")).unwrap();
    assert_eq!(workspaces.active(), Some(&workspace("Bureau", "/travail")));
}

#[test]
fn a_workspace_may_be_renamed_with_other_capitals() {
    let workspaces = two().renamed(&name("Notes"), name("NOTES")).unwrap();
    assert_eq!(names(&workspaces), ["NOTES", "Travail"]);
}

#[test]
fn renaming_onto_another_name_or_an_unknown_workspace_is_refused() {
    assert_eq!(
        two().renamed(&name("Notes"), name("travail")),
        Err(AppError::WorkspaceNameTaken("travail".into()))
    );
    assert_eq!(
        two().renamed(&name("Perso"), name("Autre")),
        Err(AppError::WorkspaceNotFound("Perso".into()))
    );
}

#[test]
fn a_removed_workspace_leaves_the_list() {
    let workspaces = two().removed(&name("notes")).unwrap();
    assert_eq!(names(&workspaces), ["Travail"]);
    assert_eq!(workspaces.active(), Some(&workspace("Travail", "/travail")));
}

#[test]
fn the_open_workspace_or_an_unknown_one_cannot_be_removed() {
    assert_eq!(
        two().removed(&name("travail")),
        Err(AppError::OpenWorkspaceKept("travail".into()))
    );
    assert_eq!(
        two().removed(&name("Perso")),
        Err(AppError::WorkspaceNotFound("Perso".into()))
    );
}

#[test]
fn a_saved_list_forgets_repeated_names_and_folders_and_an_unknown_open_one() {
    let workspaces = Workspaces::from_saved(
        vec![
            workspace("Notes", "/notes"),
            workspace("notes", "/autre"),
            workspace("Copie", "/notes"),
            workspace("Travail", "/travail"),
        ],
        Some(name("Perso")),
    );
    assert_eq!(names(&workspaces), ["Notes", "Travail"]);
    assert_eq!(workspaces.active(), None);
}

#[test]
fn a_saved_open_workspace_is_found_ignoring_case() {
    let workspaces =
        Workspaces::from_saved(vec![workspace("Notes", "/notes")], Some(name("NOTES")));
    assert_eq!(workspaces.active(), Some(&workspace("Notes", "/notes")));
}

#[test]
fn no_workspace_is_allowed_at_first() {
    let workspaces = two();
    assert!(workspaces.allowed().is_empty());
    assert!(!workspaces.is_allowed(&name("Notes")));
    assert!(!workspaces.is_allowed(&name("Perso")));
}

#[test]
fn an_allowed_workspace_is_found_ignoring_case_and_listed_in_the_order_of_the_list() {
    let workspaces = two()
        .allowing(&name("travail"))
        .unwrap()
        .allowing(&name("NOTES"))
        .unwrap();
    assert!(workspaces.is_allowed(&name("notes")));
    assert!(workspaces.is_allowed(&name("TRAVAIL")));
    let allowed: Vec<_> = workspaces
        .allowed()
        .iter()
        .map(|w| w.name.as_str())
        .collect();
    assert_eq!(allowed, ["Notes", "Travail"]);
}

#[test]
fn a_forbidden_workspace_is_no_longer_allowed_and_the_others_stay() {
    let workspaces = two()
        .allowing(&name("Notes"))
        .unwrap()
        .allowing(&name("Travail"))
        .unwrap()
        .forbidding(&name("notes"))
        .unwrap();
    assert!(!workspaces.is_allowed(&name("Notes")));
    assert!(workspaces.is_allowed(&name("Travail")));
}

#[test]
fn allowing_or_forbidding_an_unknown_workspace_is_refused() {
    assert_eq!(
        two().allowing(&name("Perso")),
        Err(AppError::WorkspaceNotFound("Perso".into()))
    );
    assert_eq!(
        two().forbidding(&name("Perso")),
        Err(AppError::WorkspaceNotFound("Perso".into()))
    );
}

#[test]
fn an_allowed_workspace_is_found_by_name_and_another_is_refused_with_the_allowed_names() {
    let workspaces = two().allowing(&name("Travail")).unwrap();
    assert_eq!(
        workspaces.allowed_named(&name("travail")),
        Ok(&workspace("Travail", "/travail"))
    );
    let refused = AppError::WorkspaceNotAllowed {
        name: "Notes".into(),
        allowed: vec!["Travail".into()],
    };
    assert_eq!(workspaces.allowed_named(&name("Notes")), Err(refused));
    let unknown = AppError::WorkspaceNotAllowed {
        name: "Perso".into(),
        allowed: vec!["Travail".into()],
    };
    assert_eq!(workspaces.allowed_named(&name("Perso")), Err(unknown));
}

#[test]
fn a_workspace_added_after_an_allowed_one_is_not_allowed() {
    let workspaces = two()
        .allowing(&name("Notes"))
        .unwrap()
        .added(workspace("Perso", "/perso"))
        .unwrap();
    assert!(workspaces.is_allowed(&name("Notes")));
    assert!(!workspaces.is_allowed(&name("Perso")));
}

#[test]
fn a_renamed_workspace_keeps_its_box_and_a_removed_one_leaves_the_others_untouched() {
    let workspaces = two()
        .allowing(&name("Notes"))
        .unwrap()
        .renamed(&name("Notes"), name("Perso"))
        .unwrap();
    assert!(workspaces.is_allowed(&name("Perso")));
    assert!(!workspaces.is_allowed(&name("Notes")));
    let rest = two()
        .allowing(&name("Travail"))
        .unwrap()
        .allowing(&name("Notes"))
        .unwrap()
        .forbidding(&name("Notes"))
        .unwrap()
        .removed(&name("Notes"))
        .unwrap();
    assert!(rest.is_allowed(&name("Travail")));
    assert_eq!(rest.allowed().len(), 1);
}

#[test]
fn saved_allowed_names_are_marked_ignoring_case_and_unknown_names_are_forgotten() {
    let workspaces = two().with_allowed(&[name("TRAVAIL"), name("Perso")]);
    let allowed: Vec<_> = workspaces
        .allowed()
        .iter()
        .map(|w| w.name.as_str())
        .collect();
    assert_eq!(allowed, ["Travail"]);
    assert!(!workspaces.is_allowed(&name("Notes")));
}

fn folder(path: &str) -> Folder {
    Folder::parse(path).unwrap()
}

#[test]
fn no_workspace_has_a_templates_folder_at_first() {
    let workspaces = two();
    assert_eq!(workspaces.templates_folder(&name("Notes")), None);
    assert_eq!(workspaces.templates_folder(&name("Perso")), None);
}

#[test]
fn a_templates_folder_is_chosen_for_one_workspace_and_found_ignoring_case() {
    let workspaces = two()
        .choosing_templates_folder(&name("travail"), Some(folder("Modèles")))
        .unwrap();
    assert_eq!(
        workspaces.templates_folder(&name("TRAVAIL")),
        Some(&folder("Modèles"))
    );
    assert_eq!(workspaces.templates_folder(&name("Notes")), None);
}

#[test]
fn choosing_none_or_another_folder_replaces_the_choice_and_leaves_the_others() {
    let workspaces = two()
        .choosing_templates_folder(&name("Notes"), Some(folder("A")))
        .unwrap()
        .choosing_templates_folder(&name("Travail"), Some(folder("B/C")))
        .unwrap()
        .choosing_templates_folder(&name("Notes"), Some(folder("D")))
        .unwrap();
    assert_eq!(
        workspaces.templates_folder(&name("Notes")),
        Some(&folder("D"))
    );
    assert_eq!(
        workspaces.templates_folder(&name("Travail")),
        Some(&folder("B/C"))
    );
    let none = workspaces
        .choosing_templates_folder(&name("Notes"), None)
        .unwrap();
    assert_eq!(none.templates_folder(&name("Notes")), None);
    assert_eq!(
        none.templates_folder(&name("Travail")),
        Some(&folder("B/C"))
    );
}

#[test]
fn choosing_a_templates_folder_for_an_unknown_workspace_is_refused() {
    assert_eq!(
        two().choosing_templates_folder(&name("Perso"), Some(folder("A"))),
        Err(AppError::WorkspaceNotFound("Perso".into()))
    );
}

#[test]
fn a_renamed_workspace_keeps_its_templates_folder_and_a_removed_one_leaves_the_others_untouched() {
    let workspaces = two()
        .choosing_templates_folder(&name("Notes"), Some(folder("A")))
        .unwrap()
        .choosing_templates_folder(&name("Travail"), Some(folder("B")))
        .unwrap();
    let renamed = workspaces
        .clone()
        .renamed(&name("Notes"), name("Perso"))
        .unwrap();
    assert_eq!(renamed.templates_folder(&name("Perso")), Some(&folder("A")));
    assert_eq!(renamed.templates_folder(&name("Notes")), None);
    let removed = workspaces.removed(&name("Notes")).unwrap();
    assert_eq!(
        removed.templates_folder(&name("Travail")),
        Some(&folder("B"))
    );
}

#[test]
fn a_workspace_added_after_one_with_a_templates_folder_has_none() {
    let workspaces = two()
        .choosing_templates_folder(&name("Notes"), Some(folder("A")))
        .unwrap()
        .added(workspace("Perso", "/perso"))
        .unwrap();
    assert_eq!(
        workspaces.templates_folder(&name("Notes")),
        Some(&folder("A"))
    );
    assert_eq!(workspaces.templates_folder(&name("Perso")), None);
}

#[test]
fn saved_templates_folders_are_given_ignoring_case_and_unknown_names_are_forgotten() {
    let workspaces = two().with_templates_folders(&[
        (name("TRAVAIL"), folder("Modèles")),
        (name("Perso"), folder("X")),
    ]);
    assert_eq!(
        workspaces.templates_folder(&name("Travail")),
        Some(&folder("Modèles"))
    );
    assert_eq!(workspaces.templates_folder(&name("Notes")), None);
}

#[test]
fn a_templates_folder_and_the_allowed_box_do_not_touch_each_other() {
    let workspaces = two()
        .allowing(&name("Notes"))
        .unwrap()
        .choosing_templates_folder(&name("Travail"), Some(folder("Modèles")))
        .unwrap();
    assert!(workspaces.is_allowed(&name("Notes")));
    assert!(!workspaces.is_allowed(&name("Travail")));
    assert_eq!(workspaces.templates_folder(&name("Notes")), None);
}
