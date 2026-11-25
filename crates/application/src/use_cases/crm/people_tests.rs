use domain::crm::{Day, NameError, PersonField};

use super::*;
use crate::testing::{FixedClock, InMemoryNoteStore};
use crate::use_cases::crm::fixture::*;
use crate::{MemoryPendingGestures, NoteStore, PendingGestures};

fn create(
    store: &InMemoryNoteStore,
    name: &str,
    company: Option<&str>,
) -> Result<Reference, AppError> {
    CreatePerson::new(store, &FixedClock::default()).execute(
        &crm(),
        name,
        company.map(reference).as_ref(),
    )
}

fn change(store: &InMemoryNoteStore, person: &str, change: PersonChange) -> Result<(), AppError> {
    ChangePerson::new(store).execute(&crm(), &reference(person), change)
}

const JEAN_PATH: &str = "clients/personnes/jean-dupont.md";
const MARIE_PATH: &str = "clients/personnes/marie-durand.md";

#[test]
fn a_person_created_elsewhere_is_in_nodata() {
    let store = workspace();
    let created = create(&store, " Paul  Martin ", None).unwrap();
    assert_eq!(created.as_str(), "paul-martin");
    assert_eq!(
        text(&store, "clients/personnes/paul-martin.md"),
        "---\ntype: crm-personne\n---\n# Paul  Martin\n"
    );
}

#[test]
fn a_person_created_from_a_company_enters_it_today_and_the_career_says_so() {
    let store = workspace();
    create(&store, "Paul Martin", Some("globex")).unwrap();
    assert_eq!(
        text(&store, "clients/personnes/paul-martin.md"),
        "---\ntype: crm-personne\nentreprise: '[[globex]]'\nparcours: ['[[globex]] · 2026-11-16 →']\n---\n# Paul Martin\n"
    );
    assert_eq!(
        create(&store, "Autre", Some("absente")),
        Err(AppError::FicheGone)
    );
    assert!(store.read(&path("clients/personnes/autre.md")).is_err());
}

#[test]
fn two_people_never_share_a_name_but_may_share_a_file_name() {
    let store = workspace();
    assert_eq!(
        create(&store, "jean DUPONT", None),
        Err(AppError::CrmName(NameError::Taken))
    );
    assert_eq!(
        create(&store, "Jean-Dupont", None).unwrap().as_str(),
        "jean-dupont-2"
    );
    assert_eq!(
        create(&store, " ", None),
        Err(AppError::CrmName(NameError::Empty))
    );
}

#[test]
fn the_first_person_creates_her_folder() {
    let store = InMemoryNoteStore::with_notes(&[("c.md", "---\ntype: crm\n---\n# C\n")]);
    CreatePerson::new(&store, &FixedClock::default())
        .execute(&path("c.md"), "Paul", None)
        .unwrap();
    let folders: Vec<String> = store
        .folders()
        .unwrap()
        .iter()
        .map(|f| f.to_path())
        .collect();
    assert_eq!(folders, ["c", "c/personnes"]);
}

#[test]
fn a_person_is_renamed_without_changing_her_file_name_unless_the_name_is_taken() {
    let store = workspace();
    change(
        &store,
        "jean-dupont",
        PersonChange::Rename("Jean-Pierre Dupont".to_owned()),
    )
    .unwrap();
    assert_eq!(
        text(&store, JEAN_PATH),
        JEAN.replace("# Jean Dupont", "# Jean-Pierre Dupont")
    );
    assert_eq!(
        change(
            &store,
            "jean-dupont",
            PersonChange::Rename("marie durand".to_owned())
        ),
        Err(AppError::CrmName(NameError::Taken))
    );
    change(
        &store,
        "jean-dupont",
        PersonChange::Rename("JEAN-PIERRE DUPONT".to_owned()),
    )
    .unwrap();
}

#[test]
fn the_fields_and_the_notes_of_a_person_change_one_property_each() {
    let store = workspace();
    change(
        &store,
        "jean-dupont",
        PersonChange::Field(PersonField::Role, "Chef".to_owned()),
    )
    .unwrap();
    assert!(text(&store, JEAN_PATH).contains("fonction: Chef\n"));
    change(
        &store,
        "jean-dupont",
        PersonChange::Field(PersonField::Email, String::new()),
    )
    .unwrap();
    assert!(!text(&store, JEAN_PATH).contains("email"));
    change(
        &store,
        "jean-dupont",
        PersonChange::Notes("A rappeler.".to_owned()),
    )
    .unwrap();
    assert!(text(&store, JEAN_PATH).ends_with("# Jean Dupont\n\nA rappeler.\n"));
}

#[test]
fn a_person_changes_company_on_the_day_given_and_the_career_closes_the_old_passage() {
    let store = workspace();
    let day = Day::parse("2026-11-20").unwrap();
    change(
        &store,
        "jean-dupont",
        PersonChange::Company(Some(reference("globex")), day),
    )
    .unwrap();
    let jean = text(&store, JEAN_PATH);
    assert!(jean.contains("entreprise: '[[globex]]'\n"));
    assert!(jean.contains(
        "parcours: ['[[acme]] · 2026-03-01 → 2026-11-20', '[[globex]] · 2026-11-20 →']\n"
    ));
    change(&store, "jean-dupont", PersonChange::Company(None, day)).unwrap();
    assert!(!text(&store, JEAN_PATH).contains("entreprise:"));
    assert_eq!(
        change(
            &store,
            "marie-durand",
            PersonChange::Company(Some(reference("absente")), day)
        ),
        Err(AppError::FicheGone)
    );
    assert_eq!(text(&store, MARIE_PATH), MARIE);
}

#[test]
fn changing_to_the_company_where_she_already_is_changes_nothing() {
    let store = workspace();
    let before = store.read(&path(JEAN_PATH)).unwrap().modified;
    let day = Day::parse("2026-11-20").unwrap();
    change(
        &store,
        "jean-dupont",
        PersonChange::Company(Some(reference("acme")), day),
    )
    .unwrap();
    assert_eq!(store.read(&path(JEAN_PATH)).unwrap().modified, before);
}

#[test]
fn a_person_that_is_gone_is_a_fiche_that_is_gone() {
    let store = workspace();
    assert_eq!(
        change(&store, "absente", PersonChange::Notes("x".to_owned())),
        Err(AppError::FicheGone)
    );
    assert_eq!(
        DeletePerson::new(&store, &MemoryPendingGestures::default())
            .execute(&crm(), &reference("absente")),
        Err(AppError::FicheGone)
    );
}

#[test]
fn a_deleted_person_goes_to_the_trash_and_leaves_each_of_her_actions() {
    let store = workspace();
    let pending = MemoryPendingGestures::default();
    DeletePerson::new(&store, &pending)
        .execute(&crm(), &reference("marie-durand"))
        .unwrap();
    assert!(store.read(&path(MARIE_PATH)).is_err());
    assert_eq!(store.trash().unwrap().notes.len(), 1);
    assert_eq!(
        text(&store, DEVIS_PATH),
        DEVIS.replace(
            "personnes: ['[[jean-dupont]] · [[acme]]', '[[marie-durand]]']",
            "personnes: ['[[jean-dupont]] · [[acme]]']"
        )
    );
    assert_eq!(
        text(&store, APPEL_PATH),
        APPEL.replace("personnes: ['[[marie-durand]]']\n", "")
    );
    assert_eq!(text(&store, FAIT_PATH), FAIT);
    assert!(pending.interrupted().unwrap().is_empty());
}

#[test]
fn a_person_without_action_is_only_trashed_and_an_interrupted_deletion_is_finished_by_the_next_gesture()
 {
    let store = workspace();
    let pending = MemoryPendingGestures::default();
    store.fail_writes_to(&path(APPEL_PATH));
    let failed = DeletePerson::new(&store, &pending).execute(&crm(), &reference("marie-durand"));
    assert!(matches!(failed, Err(AppError::StorageUnavailable(_))));
    assert_eq!(pending.interrupted().unwrap().len(), 1);
    store.stop_failing();
    DeletePerson::new(&store, &pending)
        .execute(&crm(), &reference("jean-dupont"))
        .unwrap();
    assert!(store.read(&path(MARIE_PATH)).is_err());
    assert!(store.read(&path(JEAN_PATH)).is_err());
    assert!(!text(&store, APPEL_PATH).contains("marie-durand"));
    assert!(!text(&store, DEVIS_PATH).contains("durand"));
    assert!(pending.interrupted().unwrap().is_empty());
}
