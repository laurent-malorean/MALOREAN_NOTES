//! Tests de contrat des préférences : joués à l'identique sur le faux et sur le vrai fichier.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::MeaningModel;

use crate::{Preferences, Workspace, WorkspaceLocation, WorkspaceName, Workspaces};

fn workspace(name: &str, folder: &str) -> Workspace {
    Workspace {
        name: WorkspaceName::new(name).unwrap(),
        location: WorkspaceLocation::new(folder).unwrap(),
    }
}

/// Joue tout le contrat ; `fresh` fabrique des préférences jamais écrites à chaque appel.
pub fn preferences_contract<P: Preferences>(fresh: impl Fn() -> P) {
    nothing_is_known_at_first_launch(&fresh());
    saved_workspaces_are_read_back_in_order_with_the_open_one(&fresh());
    saving_replaces_the_whole_list(&fresh());
    the_default_meaning_model_is_chosen_at_first_launch(&fresh());
    a_chosen_meaning_model_is_read_back(&fresh());
    choosing_a_meaning_model_and_saving_workspaces_do_not_touch_each_other(&fresh());
    allowed_workspaces_are_read_back_and_none_is_allowed_at_first(&fresh());
    allowed_workspaces_follow_a_renaming_and_a_removal(&fresh());
}

fn allowed_workspaces_are_read_back_and_none_is_allowed_at_first(preferences: &impl Preferences) {
    let notes = WorkspaceName::new("Notes").unwrap();
    let travail = WorkspaceName::new("Travail").unwrap();
    let workspaces = Workspaces::default()
        .added(workspace("Notes", "/Users/moi/Notes"))
        .unwrap()
        .added(workspace("Travail", "/Users/moi/Travail"))
        .unwrap();
    preferences.save_workspaces(&workspaces).unwrap();
    assert!(preferences.workspaces().unwrap().allowed().is_empty());

    preferences
        .save_workspaces(&workspaces.clone().allowing(&travail).unwrap())
        .unwrap();
    let read = preferences.workspaces().unwrap();
    assert!(read.is_allowed(&travail));
    assert!(!read.is_allowed(&notes));
    assert_eq!(read, workspaces.allowing(&travail).unwrap());
}

fn allowed_workspaces_follow_a_renaming_and_a_removal(preferences: &impl Preferences) {
    let notes = WorkspaceName::new("Notes").unwrap();
    let perso = WorkspaceName::new("Perso").unwrap();
    let workspaces = Workspaces::default()
        .added(workspace("Notes", "/Users/moi/Notes"))
        .unwrap()
        .added(workspace("Travail", "/Users/moi/Travail"))
        .unwrap()
        .allowing(&notes)
        .unwrap()
        .renamed(&notes, perso.clone())
        .unwrap();
    preferences.save_workspaces(&workspaces).unwrap();
    let read = preferences.workspaces().unwrap();
    assert!(read.is_allowed(&perso));
    assert!(!read.is_allowed(&notes));
    let removed = read.removed(&perso).unwrap();
    preferences.save_workspaces(&removed).unwrap();
    assert!(preferences.workspaces().unwrap().allowed().is_empty());
}

fn the_default_meaning_model_is_chosen_at_first_launch(preferences: &impl Preferences) {
    assert_eq!(preferences.meaning_model().unwrap(), MeaningModel::DEFAULT);
}

fn a_chosen_meaning_model_is_read_back(preferences: &impl Preferences) {
    for model in [MeaningModel::Large, MeaningModel::Small] {
        preferences.save_meaning_model(model).unwrap();
        assert_eq!(preferences.meaning_model().unwrap(), model);
    }
}

fn choosing_a_meaning_model_and_saving_workspaces_do_not_touch_each_other(
    preferences: &impl Preferences,
) {
    let workspaces = Workspaces::default()
        .added(workspace("Notes", "/Users/moi/Notes"))
        .unwrap();
    preferences.save_workspaces(&workspaces).unwrap();
    preferences.save_meaning_model(MeaningModel::Large).unwrap();
    assert_eq!(preferences.workspaces().unwrap(), workspaces);
    let more = workspaces
        .added(workspace("Travail", "/Users/moi/Travail"))
        .unwrap();
    preferences.save_workspaces(&more).unwrap();
    assert_eq!(preferences.meaning_model().unwrap(), MeaningModel::Large);
    assert_eq!(preferences.workspaces().unwrap(), more);
}

fn nothing_is_known_at_first_launch(preferences: &impl Preferences) {
    assert_eq!(preferences.workspaces().unwrap(), Workspaces::default());
}

fn saved_workspaces_are_read_back_in_order_with_the_open_one(preferences: &impl Preferences) {
    let workspaces = Workspaces::default()
        .added(workspace("Travail", "/Users/moi/Travail"))
        .unwrap()
        .added(workspace("Notes", "/Users/moi/Notes"))
        .unwrap()
        .activated(&WorkspaceName::new("Travail").unwrap())
        .unwrap();
    preferences.save_workspaces(&workspaces).unwrap();
    assert_eq!(preferences.workspaces().unwrap(), workspaces);
}

fn saving_replaces_the_whole_list(preferences: &impl Preferences) {
    let first = Workspaces::default()
        .added(workspace("Notes", "/Users/moi/Notes"))
        .unwrap();
    preferences.save_workspaces(&first).unwrap();
    let renamed = first
        .renamed(
            &WorkspaceName::new("Notes").unwrap(),
            WorkspaceName::new("Perso").unwrap(),
        )
        .unwrap();
    preferences.save_workspaces(&renamed).unwrap();
    assert_eq!(preferences.workspaces().unwrap(), renamed);
}

#[cfg(test)]
mod tests {
    use crate::testing::FakePreferences;

    #[test]
    fn the_fake_preferences_keep_the_contract() {
        super::preferences_contract(FakePreferences::default);
    }
}
