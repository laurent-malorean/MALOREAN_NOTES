//! Tests de contrat des préférences : joués à l'identique sur le faux et sur le vrai fichier.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::external_servers::ServerName;
use domain::{Folder, MeaningModel, NotePath};

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
    templates_folders_are_read_back_and_none_is_chosen_at_first(&fresh());
    templates_folders_follow_a_renaming_and_a_removal(&fresh());
    favorites_notes_are_read_back_and_none_is_chosen_at_first(&fresh());
    favorites_notes_follow_a_renaming_and_a_removal(&fresh());
    the_voice_language_is_the_macs_at_first_launch_and_is_read_back(&fresh());
    the_voice_language_survives_the_other_preferences(&fresh());
    no_server_is_allowed_at_first_launch_and_the_allowed_ones_are_read_back(&fresh());
    the_allowed_servers_survive_the_other_preferences(&fresh());
}

fn server(name: &str) -> ServerName {
    ServerName::new(name).unwrap()
}

fn no_server_is_allowed_at_first_launch_and_the_allowed_ones_are_read_back(
    preferences: &impl Preferences,
) {
    assert_eq!(preferences.allowed_servers().unwrap(), []);
    let both = [server("claude.ai Noota"), server("mon serveur")];
    preferences.save_allowed_servers(&both).unwrap();
    assert_eq!(preferences.allowed_servers().unwrap(), both);
    preferences
        .save_allowed_servers(&[server("claude.ai Slack")])
        .unwrap();
    assert_eq!(
        preferences.allowed_servers().unwrap(),
        [server("claude.ai Slack")]
    );
    preferences.save_allowed_servers(&[]).unwrap();
    assert_eq!(preferences.allowed_servers().unwrap(), []);
}

fn the_allowed_servers_survive_the_other_preferences(preferences: &impl Preferences) {
    let workspaces = Workspaces::default()
        .added(workspace("Notes", "/Users/moi/Notes"))
        .unwrap();
    let allowed = [server("claude.ai Noota")];
    preferences.save_allowed_servers(&allowed).unwrap();
    preferences.save_workspaces(&workspaces).unwrap();
    preferences.save_meaning_model(MeaningModel::Large).unwrap();
    preferences.save_voice_language(Some("de-DE")).unwrap();
    assert_eq!(preferences.allowed_servers().unwrap(), allowed);
    assert_eq!(preferences.workspaces().unwrap(), workspaces);
    assert_eq!(preferences.meaning_model().unwrap(), MeaningModel::Large);
    assert_eq!(
        preferences.voice_language().unwrap().as_deref(),
        Some("de-DE")
    );
    preferences.save_allowed_servers(&[]).unwrap();
    assert_eq!(preferences.workspaces().unwrap(), workspaces);
    assert_eq!(preferences.meaning_model().unwrap(), MeaningModel::Large);
    assert_eq!(
        preferences.voice_language().unwrap().as_deref(),
        Some("de-DE")
    );
}

fn the_voice_language_is_the_macs_at_first_launch_and_is_read_back(preferences: &impl Preferences) {
    assert_eq!(preferences.voice_language().unwrap(), None);
    preferences.save_voice_language(Some("fr-FR")).unwrap();
    assert_eq!(
        preferences.voice_language().unwrap().as_deref(),
        Some("fr-FR")
    );
    preferences.save_voice_language(Some("en-US")).unwrap();
    assert_eq!(
        preferences.voice_language().unwrap().as_deref(),
        Some("en-US")
    );
    preferences.save_voice_language(None).unwrap();
    assert_eq!(preferences.voice_language().unwrap(), None);
}

fn the_voice_language_survives_the_other_preferences(preferences: &impl Preferences) {
    let workspaces = Workspaces::default()
        .added(workspace("Notes", "/Users/moi/Notes"))
        .unwrap();
    preferences.save_voice_language(Some("de-DE")).unwrap();
    preferences.save_workspaces(&workspaces).unwrap();
    preferences.save_meaning_model(MeaningModel::Large).unwrap();
    assert_eq!(
        preferences.voice_language().unwrap().as_deref(),
        Some("de-DE")
    );
    assert_eq!(preferences.workspaces().unwrap(), workspaces);
    assert_eq!(preferences.meaning_model().unwrap(), MeaningModel::Large);
    preferences.save_voice_language(Some("fr-FR")).unwrap();
    assert_eq!(preferences.workspaces().unwrap(), workspaces);
    assert_eq!(preferences.meaning_model().unwrap(), MeaningModel::Large);
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

fn templates_folders_are_read_back_and_none_is_chosen_at_first(preferences: &impl Preferences) {
    let notes = WorkspaceName::new("Notes").unwrap();
    let travail = WorkspaceName::new("Travail").unwrap();
    let workspaces = Workspaces::default()
        .added(workspace("Notes", "/Users/moi/Notes"))
        .unwrap()
        .added(workspace("Travail", "/Users/moi/Travail"))
        .unwrap();
    preferences.save_workspaces(&workspaces).unwrap();
    let read = preferences.workspaces().unwrap();
    assert_eq!(read.templates_folder(&notes), None);
    assert_eq!(read.templates_folder(&travail), None);

    let chosen = workspaces
        .choosing_templates_folder(&travail, Some(Folder::parse("Perso/Modèles").unwrap()))
        .unwrap();
    preferences.save_workspaces(&chosen).unwrap();
    let read = preferences.workspaces().unwrap();
    assert_eq!(
        read.templates_folder(&travail),
        Some(&Folder::parse("Perso/Modèles").unwrap())
    );
    assert_eq!(read.templates_folder(&notes), None);
    assert_eq!(read, chosen);
}

fn templates_folders_follow_a_renaming_and_a_removal(preferences: &impl Preferences) {
    let notes = WorkspaceName::new("Notes").unwrap();
    let perso = WorkspaceName::new("Perso").unwrap();
    let modeles = Folder::parse("Modèles").unwrap();
    let workspaces = Workspaces::default()
        .added(workspace("Notes", "/Users/moi/Notes"))
        .unwrap()
        .added(workspace("Travail", "/Users/moi/Travail"))
        .unwrap()
        .choosing_templates_folder(&notes, Some(modeles.clone()))
        .unwrap()
        .renamed(&notes, perso.clone())
        .unwrap();
    preferences.save_workspaces(&workspaces).unwrap();
    let read = preferences.workspaces().unwrap();
    assert_eq!(read.templates_folder(&perso), Some(&modeles));
    assert_eq!(read.templates_folder(&notes), None);
    preferences
        .save_workspaces(&read.removed(&perso).unwrap())
        .unwrap();
    let travail = WorkspaceName::new("Travail").unwrap();
    assert_eq!(
        preferences.workspaces().unwrap().templates_folder(&travail),
        None
    );
}

fn favorites_notes_are_read_back_and_none_is_chosen_at_first(preferences: &impl Preferences) {
    let notes = WorkspaceName::new("Notes").unwrap();
    let travail = WorkspaceName::new("Travail").unwrap();
    let workspaces = Workspaces::default()
        .added(workspace("Notes", "/Users/moi/Notes"))
        .unwrap()
        .added(workspace("Travail", "/Users/moi/Travail"))
        .unwrap();
    preferences.save_workspaces(&workspaces).unwrap();
    let read = preferences.workspaces().unwrap();
    assert_eq!(read.favorites_note(&notes), None);
    assert_eq!(read.favorites_note(&travail), None);

    let favorites = NotePath::parse("Perso/Mes favoris.md").unwrap();
    let chosen = workspaces
        .choosing_favorites_note(&travail, Some(favorites.clone()))
        .unwrap();
    preferences.save_workspaces(&chosen).unwrap();
    let read = preferences.workspaces().unwrap();
    assert_eq!(read.favorites_note(&travail), Some(&favorites));
    assert_eq!(read.favorites_note(&notes), None);
    assert_eq!(read, chosen);
}

fn favorites_notes_follow_a_renaming_and_a_removal(preferences: &impl Preferences) {
    let notes = WorkspaceName::new("Notes").unwrap();
    let perso = WorkspaceName::new("Perso").unwrap();
    let favorites = NotePath::parse("favoris.md").unwrap();
    let workspaces = Workspaces::default()
        .added(workspace("Notes", "/Users/moi/Notes"))
        .unwrap()
        .added(workspace("Travail", "/Users/moi/Travail"))
        .unwrap()
        .choosing_favorites_note(&notes, Some(favorites.clone()))
        .unwrap()
        .renamed(&notes, perso.clone())
        .unwrap();
    preferences.save_workspaces(&workspaces).unwrap();
    let read = preferences.workspaces().unwrap();
    assert_eq!(read.favorites_note(&perso), Some(&favorites));
    assert_eq!(read.favorites_note(&notes), None);
    preferences
        .save_workspaces(&read.removed(&perso).unwrap())
        .unwrap();
    let travail = WorkspaceName::new("Travail").unwrap();
    assert_eq!(
        preferences.workspaces().unwrap().favorites_note(&travail),
        None
    );
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
