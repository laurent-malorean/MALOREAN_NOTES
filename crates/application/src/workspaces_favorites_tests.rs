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

fn note(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

fn two() -> Workspaces {
    Workspaces::default()
        .added(workspace("Notes", "/notes"))
        .unwrap()
        .added(workspace("Travail", "/travail"))
        .unwrap()
}

#[test]
fn no_workspace_has_a_favorites_note_at_first() {
    let workspaces = two();
    assert_eq!(workspaces.favorites_note(&name("Notes")), None);
    assert_eq!(workspaces.favorites_note(&name("Travail")), None);
    assert_eq!(workspaces.favorites_note(&name("Perso")), None);
}

#[test]
fn a_favorites_note_is_chosen_for_one_workspace_and_found_ignoring_case() {
    let workspaces = two()
        .choosing_favorites_note(&name("travail"), Some(note("A/favoris.md")))
        .unwrap();
    assert_eq!(
        workspaces.favorites_note(&name("TRAVAIL")),
        Some(&note("A/favoris.md"))
    );
    assert_eq!(workspaces.favorites_note(&name("Notes")), None);
}

#[test]
fn choosing_again_replaces_the_note_and_none_clears_it() {
    let workspaces = two()
        .choosing_favorites_note(&name("Notes"), Some(note("a.md")))
        .unwrap()
        .choosing_favorites_note(&name("Travail"), Some(note("b.md")))
        .unwrap()
        .choosing_favorites_note(&name("Notes"), Some(note("c.md")))
        .unwrap();
    assert_eq!(
        workspaces.favorites_note(&name("Notes")),
        Some(&note("c.md"))
    );
    assert_eq!(
        workspaces.favorites_note(&name("Travail")),
        Some(&note("b.md"))
    );
    let cleared = workspaces
        .choosing_favorites_note(&name("Notes"), None)
        .unwrap();
    assert_eq!(cleared.favorites_note(&name("Notes")), None);
    assert_eq!(
        cleared.favorites_note(&name("Travail")),
        Some(&note("b.md"))
    );
}

#[test]
fn choosing_a_favorites_note_for_an_unknown_workspace_is_refused() {
    assert_eq!(
        two().choosing_favorites_note(&name("Perso"), Some(note("a.md"))),
        Err(AppError::WorkspaceNotFound("Perso".to_owned()))
    );
}

#[test]
fn a_renamed_workspace_keeps_its_favorites_note_and_a_removed_one_leaves_the_others_untouched() {
    let workspaces = two()
        .choosing_favorites_note(&name("Notes"), Some(note("a.md")))
        .unwrap()
        .choosing_favorites_note(&name("Travail"), Some(note("b.md")))
        .unwrap();
    let renamed = workspaces
        .clone()
        .renamed(&name("Notes"), name("Perso"))
        .unwrap();
    assert_eq!(renamed.favorites_note(&name("Perso")), Some(&note("a.md")));
    assert_eq!(renamed.favorites_note(&name("Notes")), None);
    let removed = workspaces.removed(&name("Notes")).unwrap();
    assert_eq!(
        removed.favorites_note(&name("Travail")),
        Some(&note("b.md"))
    );
}

#[test]
fn a_workspace_added_after_one_with_a_favorites_note_has_none() {
    let workspaces = two()
        .choosing_favorites_note(&name("Notes"), Some(note("a.md")))
        .unwrap()
        .added(workspace("Perso", "/perso"))
        .unwrap();
    assert_eq!(
        workspaces.favorites_note(&name("Notes")),
        Some(&note("a.md"))
    );
    assert_eq!(workspaces.favorites_note(&name("Perso")), None);
}

#[test]
fn saved_favorites_notes_are_given_ignoring_case_and_unknown_names_are_forgotten() {
    let workspaces = two().with_favorites_notes(&[
        (name("TRAVAIL"), note("A/favoris.md")),
        (name("Inconnu"), note("x.md")),
    ]);
    assert_eq!(
        workspaces.favorites_note(&name("Travail")),
        Some(&note("A/favoris.md"))
    );
    assert_eq!(workspaces.favorites_note(&name("Notes")), None);
}

#[test]
fn a_favorites_note_and_a_templates_folder_do_not_touch_each_other() {
    let workspaces = two()
        .choosing_favorites_note(&name("Travail"), Some(note("favoris.md")))
        .unwrap()
        .choosing_templates_folder(&name("Notes"), Some(Folder::parse("Modèles").unwrap()))
        .unwrap();
    assert_eq!(workspaces.templates_folder(&name("Travail")), None);
    assert_eq!(workspaces.favorites_note(&name("Notes")), None);
}

fn with_favorites_at(location: &str, favorites: &str) -> Workspaces {
    let name = if location == "/notes" {
        "Notes"
    } else {
        "Travail"
    };
    two()
        .choosing_favorites_note(&self::name(name), Some(note(favorites)))
        .unwrap()
}

#[test]
fn the_favorites_note_of_the_workspace_at_a_location_follows_a_change() {
    let at = WorkspaceLocation::new("/notes").unwrap();
    let change = PlaceChange::NoteMoved {
        from: &note("favoris.md"),
        to: &note("A/mes-favoris.md"),
    };
    let followed =
        with_favorites_at("/notes", "favoris.md").with_favorites_note_following(&at, change);
    assert_eq!(
        followed.favorites_note(&name("Notes")),
        Some(&note("A/mes-favoris.md"))
    );
}

#[test]
fn a_change_in_one_workspace_never_touches_the_favorites_note_of_another() {
    let travail = WorkspaceLocation::new("/travail").unwrap();
    let change = PlaceChange::NoteTrashed(&note("favoris.md"));
    let followed =
        with_favorites_at("/notes", "favoris.md").with_favorites_note_following(&travail, change);
    assert_eq!(
        followed.favorites_note(&name("Notes")),
        Some(&note("favoris.md"))
    );
}

#[test]
fn a_trashed_favorites_note_is_forgotten() {
    let at = WorkspaceLocation::new("/travail").unwrap();
    let change = PlaceChange::FolderTrashed(&Folder::parse("A").unwrap());
    let followed =
        with_favorites_at("/travail", "A/favoris.md").with_favorites_note_following(&at, change);
    assert_eq!(followed.favorites_note(&name("Travail")), None);
}

#[test]
fn a_workspace_without_a_favorites_note_stays_without() {
    let at = WorkspaceLocation::new("/notes").unwrap();
    let change = PlaceChange::NoteMoved {
        from: &note("a.md"),
        to: &note("b.md"),
    };
    assert_eq!(two().with_favorites_note_following(&at, change), two());
}
