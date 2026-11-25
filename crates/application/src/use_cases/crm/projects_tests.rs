use domain::crm::{Color, NameError};

use super::*;
use crate::testing::InMemoryNoteStore;
use crate::use_cases::crm::fixture::*;
use crate::{MemoryPendingGestures, NoteStore, PendingGestures};

const REFONTE_PATH: &str = "clients/projets/refonte.md";

fn create(store: &InMemoryNoteStore, name: &str) -> Result<Reference, AppError> {
    CreateProject::new(store).execute(&crm(), name)
}

#[test]
fn a_project_takes_the_least_used_color_of_the_crm_the_first_in_case_of_tie() {
    let store = workspace();
    let first = create(&store, "Site").unwrap();
    assert_eq!(first.as_str(), "site");
    assert_eq!(
        text(&store, "clients/projets/site.md"),
        "---\ntype: crm-projet\ncouleur: rouge\n---\n# Site\n"
    );
    create(&store, "App").unwrap();
    assert!(text(&store, "clients/projets/app.md").contains("couleur: orange\n"));
    let empty = InMemoryNoteStore::with_notes(&[("c.md", "---\ntype: crm\n---\n# C\n")]);
    CreateProject::new(&empty)
        .execute(&path("c.md"), "P")
        .unwrap();
    assert!(text(&empty, "c/projets/p.md").contains("couleur: rouge\n"));
    let folders: Vec<String> = empty
        .folders()
        .unwrap()
        .iter()
        .map(|f| f.to_path())
        .collect();
    assert_eq!(folders, ["c", "c/projets"]);
}

#[test]
fn two_projects_never_share_a_name() {
    let store = workspace();
    assert_eq!(
        create(&store, "REFONTE"),
        Err(AppError::CrmName(NameError::Taken))
    );
    assert_eq!(
        create(&store, " "),
        Err(AppError::CrmName(NameError::Empty))
    );
}

#[test]
fn the_tags_of_a_project_change_alone_and_leave_the_rest_of_the_file_as_it_is() {
    let store = workspace();
    let change = |tags: &[&str]| {
        let tags = tags.iter().map(|tag| (*tag).to_owned()).collect();
        ChangeProject::new(&store).execute(&crm(), &reference("refonte"), ProjectChange::Tags(tags))
    };
    change(&["client", " 2027 ", "Client"]).unwrap();
    let tagged = text(&store, REFONTE_PATH);
    assert!(tagged.contains("tags: [client, 2027]\n"), "{tagged}");
    assert_eq!(tagged.replace("tags: [client, 2027]\n", ""), REFONTE);
    change(&[]).unwrap();
    assert_eq!(text(&store, REFONTE_PATH), REFONTE);
}

#[test]
fn a_project_is_renamed_and_recolored_one_property_at_a_time() {
    let store = workspace();
    let change = |change: ProjectChange| {
        ChangeProject::new(&store).execute(&crm(), &reference("refonte"), change)
    };
    change(ProjectChange::Rename("Refonte du site".to_owned())).unwrap();
    assert_eq!(
        text(&store, REFONTE_PATH),
        REFONTE.replace("# Refonte", "# Refonte du site")
    );
    change(ProjectChange::Color(Color::parse("marron").unwrap())).unwrap();
    assert!(text(&store, REFONTE_PATH).contains("couleur: marron\n"));
    create(&store, "Autre").unwrap();
    assert_eq!(
        change(ProjectChange::Rename("autre".to_owned())),
        Err(AppError::CrmName(NameError::Taken))
    );
    assert_eq!(
        ChangeProject::new(&store).execute(
            &crm(),
            &reference("absent"),
            ProjectChange::Rename("X".to_owned())
        ),
        Err(AppError::FicheGone)
    );
}

#[test]
fn a_deleted_project_goes_to_the_trash_and_its_actions_lose_it_without_being_deleted() {
    let store = workspace();
    let pending = MemoryPendingGestures::default();
    DeleteProject::new(&store, &pending)
        .execute(&crm(), &reference("refonte"))
        .unwrap();
    assert!(store.read(&path(REFONTE_PATH)).is_err());
    assert_eq!(store.trash().unwrap().notes.len(), 1);
    assert_eq!(
        text(&store, DEVIS_PATH),
        DEVIS.replace("projet: '[[refonte]]'\n", "")
    );
    assert_eq!(text(&store, APPEL_PATH), APPEL);
    assert!(pending.interrupted().unwrap().is_empty());
    assert_eq!(
        DeleteProject::new(&store, &pending).execute(&crm(), &reference("refonte")),
        Err(AppError::FicheGone)
    );
}
