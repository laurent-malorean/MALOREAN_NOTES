use domain::crm::{BodyChange, Channel, Color, CrmKind, Day};

use super::*;
use crate::MemoryPendingGestures;
use crate::NoteStore;
use crate::testing::{FixedClock, InMemoryNoteStore};
use crate::use_cases::crm::fixture::*;

fn create(store: &InMemoryNoteStore, draft: ActionDraft) -> Result<Reference, AppError> {
    CreateAction::new(store, &FixedClock::default()).execute(&crm(), draft)
}

fn titled(title: &str) -> ActionDraft {
    ActionDraft {
        title: title.to_owned(),
        ..ActionDraft::default()
    }
}

fn change(store: &InMemoryNoteStore, name: &str, change: ActionChange) -> Result<(), AppError> {
    ChangeAction::new(store, &FixedClock::default()).execute(&crm(), &reference(name), change)
}

#[test]
fn an_action_is_created_today_in_todo_under_the_date_and_title_of_its_name() {
    let store = workspace();
    let created = create(&store, titled("  Relancer   Acme ")).unwrap();
    assert_eq!(created.as_str(), "2026-11-16-relancer-acme");
    assert_eq!(
        text(&store, "clients/actions/2026-11-16-relancer-acme.md"),
        "---\ntype: crm-action\nstatut: TODO\ndate: '2026-11-16'\n---\n# Relancer   Acme\n"
    );
}

#[test]
fn an_action_created_with_everything_is_written_with_everything() {
    let store = workspace();
    let draft = ActionDraft {
        title: "Devis".to_owned(),
        status: Some("progress".to_owned()),
        date: Some(Day::parse("2026-12-01").unwrap()),
        people: vec![
            reference("jean-dupont"),
            reference("marie-durand"),
            reference("jean-dupont"),
        ],
        channel: Some(Channel::Email),
        project: Some(reference("refonte")),
        color: Color::parse("violet"),
        tags: vec!["urgent".to_owned(), "Urgent".to_owned()],
        linked_notes: vec![reference("Cahier des charges")],
        description: "Pour 3 postes.".to_owned(),
    };
    let created = create(&store, draft).unwrap();
    assert_eq!(
        text(&store, &format!("clients/actions/{}.md", created.as_str())),
        "---\ntype: crm-action\npersonnes: ['[[jean-dupont]] · [[acme]]', '[[marie-durand]]']\nstatut: Progress\ndate: '2026-12-01'\ncanal: e-mail\nprojet: '[[refonte]]'\ncouleur: violet\ntags: [urgent]\nnotes: ['[[Cahier des charges]]']\n---\n# Devis\n\nPour 3 postes.\n"
    );
}

#[test]
fn two_actions_of_the_same_title_the_same_day_get_two_names() {
    let store = workspace();
    create(&store, titled("Appel")).unwrap();
    let second = create(&store, titled("Appel")).unwrap();
    assert_eq!(second.as_str(), "2026-11-16-appel-2");
    assert_eq!(
        create(&store, titled("Appel")).unwrap().as_str(),
        "2026-11-16-appel-3"
    );
}

#[test]
fn the_first_action_creates_its_folders() {
    let store =
        InMemoryNoteStore::with_notes(&[("Ventes/pipeline.md", "---\ntype: crm\n---\n# P\n")]);
    CreateAction::new(&store, &FixedClock::default())
        .execute(&path("Ventes/pipeline.md"), titled("Premier"))
        .unwrap();
    let folders: Vec<String> = store
        .folders()
        .unwrap()
        .iter()
        .map(|f| f.to_path())
        .collect();
    assert!(folders.contains(&"Ventes/pipeline".to_owned()));
    assert!(folders.contains(&"Ventes/pipeline/actions".to_owned()));
    assert!(
        store
            .read(&path("Ventes/pipeline/actions/2026-11-16-premier.md"))
            .is_ok()
    );
}

#[test]
fn an_action_is_refused_for_an_empty_title_an_unknown_column_or_a_fiche_that_is_gone() {
    let store = workspace();
    assert_eq!(
        create(&store, titled("  ")),
        Err(AppError::CrmName(domain::crm::NameError::Empty))
    );
    let with = |draft: ActionDraft| {
        create(
            &store,
            ActionDraft {
                title: "A".to_owned(),
                ..draft
            },
        )
    };
    assert_eq!(
        with(ActionDraft {
            status: Some("Négo".to_owned()),
            ..ActionDraft::default()
        }),
        Err(AppError::UnknownStatus("Négo".to_owned()))
    );
    assert_eq!(
        with(ActionDraft {
            people: vec![reference("absent")],
            ..ActionDraft::default()
        }),
        Err(AppError::FicheGone)
    );
    assert_eq!(
        with(ActionDraft {
            project: Some(reference("absent")),
            ..ActionDraft::default()
        }),
        Err(AppError::FicheGone)
    );
    assert!(
        store
            .read(&path("clients/actions/2026-11-16-a.md"))
            .is_err()
    );
}

#[test]
fn a_note_that_is_not_a_crm_is_refused() {
    let store = InMemoryNoteStore::with_notes(&[("n.md", "# N\n")]);
    assert_eq!(
        CreateAction::new(&store, &FixedClock::default()).execute(&path("n.md"), titled("A")),
        Err(AppError::NotACrm)
    );
}

#[test]
fn a_title_a_date_a_channel_a_color_tags_and_notes_change_one_property_each() {
    let store = workspace();
    let devis = |store: &InMemoryNoteStore| text(store, DEVIS_PATH);
    change(
        &store,
        DEVIS_NAME,
        ActionChange::Title("Devis révisé".to_owned()),
    )
    .unwrap();
    assert_eq!(
        devis(&store),
        DEVIS.replace("# Demande de devis", "# Devis révisé")
    );
    change(
        &store,
        DEVIS_NAME,
        ActionChange::Date(Day::parse("2026-12-01").unwrap()),
    )
    .unwrap();
    assert!(devis(&store).contains("date: '2026-12-01'\n"));
    change(
        &store,
        DEVIS_NAME,
        ActionChange::Channel(Some(Channel::Call)),
    )
    .unwrap();
    assert!(devis(&store).contains("canal: appel\n"));
    change(&store, DEVIS_NAME, ActionChange::Channel(None)).unwrap();
    assert!(!devis(&store).contains("canal"));
    change(
        &store,
        DEVIS_NAME,
        ActionChange::Color(Color::parse("rose")),
    )
    .unwrap();
    assert!(devis(&store).contains("couleur: rose\n"));
    change(
        &store,
        DEVIS_NAME,
        ActionChange::Tags(vec!["a".to_owned(), "b".to_owned()]),
    )
    .unwrap();
    assert!(devis(&store).contains("tags: [a, b]\n"));
    change(
        &store,
        DEVIS_NAME,
        ActionChange::LinkedNotes(vec![reference("Plan")]),
    )
    .unwrap();
    assert!(devis(&store).contains("notes: ['[[Plan]]']\n"));
    assert!(devis(&store).contains("rang: 1\n"));
}

#[test]
fn an_unchanged_action_is_not_written_again() {
    let store = workspace();
    let before = store.read(&path(DEVIS_PATH)).unwrap().modified;
    change(
        &store,
        DEVIS_NAME,
        ActionChange::Date(Day::parse("2026-11-10").unwrap()),
    )
    .unwrap();
    assert_eq!(store.read(&path(DEVIS_PATH)).unwrap().modified, before);
    change(
        &store,
        DEVIS_NAME,
        ActionChange::Date(Day::parse("2026-11-11").unwrap()),
    )
    .unwrap();
    assert_ne!(store.read(&path(DEVIS_PATH)).unwrap().modified, before);
}

#[test]
fn a_status_must_be_a_column_and_changing_it_clears_the_rank() {
    let store = workspace();
    change(
        &store,
        DEVIS_NAME,
        ActionChange::Status("waitingfor".to_owned()),
    )
    .unwrap();
    let devis = text(&store, DEVIS_PATH);
    assert!(devis.contains("statut: WaitingFor\n"));
    assert!(!devis.contains("rang"));
    assert_eq!(
        change(
            &store,
            DEVIS_NAME,
            ActionChange::Status("Ailleurs".to_owned())
        ),
        Err(AppError::UnknownStatus("Ailleurs".to_owned()))
    );
    assert_eq!(
        change(&store, DEVIS_NAME, ActionChange::Title(" ".to_owned())),
        Err(AppError::CrmName(domain::crm::NameError::Empty))
    );
}

#[test]
fn a_project_must_exist_and_may_be_removed() {
    let store = workspace();
    assert_eq!(
        change(
            &store,
            APPEL_NAME,
            ActionChange::Project(Some(reference("absent")))
        ),
        Err(AppError::FicheGone)
    );
    change(
        &store,
        APPEL_NAME,
        ActionChange::Project(Some(reference("refonte"))),
    )
    .unwrap();
    assert!(text(&store, APPEL_PATH).contains("projet: '[[refonte]]'\n"));
    change(&store, APPEL_NAME, ActionChange::Project(None)).unwrap();
    assert!(!text(&store, APPEL_PATH).contains("projet"));
}

#[test]
fn a_person_is_given_with_her_company_of_the_moment_and_taken_away() {
    let store = workspace();
    change(
        &store,
        APPEL_NAME,
        ActionChange::AddPerson(reference("jean-dupont")),
    )
    .unwrap();
    assert_eq!(
        text(&store, APPEL_PATH),
        "---\ntype: crm-action\npersonnes: ['[[marie-durand]]', '[[jean-dupont]] · [[acme]]']\ndate: '2026-11-16'\n---\n# Appel\n"
    );
    let once = text(&store, APPEL_PATH);
    change(
        &store,
        APPEL_NAME,
        ActionChange::AddPerson(reference("jean-dupont")),
    )
    .unwrap();
    assert_eq!(text(&store, APPEL_PATH), once);
    change(
        &store,
        APPEL_NAME,
        ActionChange::RemovePerson(reference("marie-durand")),
    )
    .unwrap();
    assert_eq!(
        text(&store, APPEL_PATH),
        "---\ntype: crm-action\npersonnes: ['[[jean-dupont]] · [[acme]]']\ndate: '2026-11-16'\n---\n# Appel\n"
    );
    assert_eq!(
        change(
            &store,
            APPEL_NAME,
            ActionChange::AddPerson(reference("absente"))
        ),
        Err(AppError::FicheGone)
    );
}

#[test]
fn the_text_of_an_action_changes_part_by_part_and_a_comment_is_dated_by_the_clock() {
    let store = workspace();
    change(
        &store,
        DEVIS_NAME,
        ActionChange::Body(BodyChange::Description("Autre texte.".to_owned())),
    )
    .unwrap();
    assert!(text(&store, DEVIS_PATH).ends_with("# Demande de devis\n\nAutre texte.\n"));
    change(
        &store,
        DEVIS_NAME,
        ActionChange::AddComment("Rappelé.".to_owned()),
    )
    .unwrap();
    assert!(
        text(&store, DEVIS_PATH)
            .ends_with("\n\n#### Commentaires\n- 2026-11-16 18:30 · Rappelé.\n")
    );
    change(
        &store,
        DEVIS_NAME,
        ActionChange::Body(BodyChange::AddChecklist("Préparation".to_owned())),
    )
    .unwrap();
    change(
        &store,
        DEVIS_NAME,
        ActionChange::Body(BodyChange::AddItem {
            list: 0,
            text: "Relire".to_owned(),
        }),
    )
    .unwrap();
    assert!(text(&store, DEVIS_PATH).contains("#### Liste à cocher : Préparation\n- [ ] Relire\n"));
    assert_eq!(
        change(
            &store,
            DEVIS_NAME,
            ActionChange::Body(BodyChange::RemoveComment(4))
        ),
        Err(AppError::CrmBody(domain::crm::BodyError::NoSuchComment))
    );
    assert_eq!(
        change(&store, DEVIS_NAME, ActionChange::AddComment(" ".to_owned())),
        Err(AppError::CrmBody(domain::crm::BodyError::Empty))
    );
}

#[test]
fn a_change_reads_the_file_as_it_is_now() {
    let store = workspace();
    store
        .write(
            &path(DEVIS_PATH),
            &DEVIS.replace("tags: [urgent]", "tags: [urgent]\naliases: [x]"),
        )
        .unwrap();
    change(
        &store,
        DEVIS_NAME,
        ActionChange::Date(Day::parse("2026-12-01").unwrap()),
    )
    .unwrap();
    assert!(text(&store, DEVIS_PATH).contains("aliases: [x]\n"));
}

#[test]
fn an_action_that_is_gone_or_is_no_longer_an_action_is_a_fiche_that_is_gone() {
    let store = workspace();
    let date = || ActionChange::Date(Day::parse("2026-12-01").unwrap());
    assert_eq!(change(&store, "absente", date()), Err(AppError::FicheGone));
    store
        .write(&path(APPEL_PATH), "# Une note ordinaire\n")
        .unwrap();
    assert_eq!(change(&store, APPEL_NAME, date()), Err(AppError::FicheGone));
    assert_eq!(
        change(&store, "a/b", date()),
        Err(AppError::InvalidReference("a/b".to_owned()))
    );
}

fn moved(
    store: &InMemoryNoteStore,
    name: &str,
    status: &str,
    placement: Placement,
) -> Result<(), AppError> {
    let pending = MemoryPendingGestures::default();
    let result =
        MoveAction::new(store, &pending).execute(&crm(), &reference(name), status, &placement);
    assert!(
        crate::PendingGestures::interrupted(&pending)
            .unwrap()
            .is_empty()
    );
    result
}

fn rank(store: &InMemoryNoteStore, name: &str) -> Option<String> {
    let content = text(store, name);
    content
        .lines()
        .find_map(|line| line.strip_prefix("rang: "))
        .map(str::to_owned)
}

#[test]
fn a_card_dropped_before_another_changes_column_and_places_every_card_of_the_column() {
    let store = workspace();
    moved(
        &store,
        APPEL_NAME,
        "Progress",
        Placement::Before(Some(reference(DEVIS_NAME))),
    )
    .unwrap();
    assert!(text(&store, APPEL_PATH).contains("statut: Progress\n"));
    assert_eq!(rank(&store, APPEL_PATH).as_deref(), Some("1"));
    assert_eq!(rank(&store, DEVIS_PATH).as_deref(), Some("2"));
}

#[test]
fn a_card_dropped_at_the_bottom_or_before_a_card_that_is_not_there_goes_last() {
    let store = workspace();
    moved(&store, APPEL_NAME, "Progress", Placement::Before(None)).unwrap();
    assert_eq!(rank(&store, APPEL_PATH).as_deref(), Some("2"));
    assert_eq!(rank(&store, DEVIS_PATH).as_deref(), Some("1"));
    let store = workspace();
    moved(
        &store,
        APPEL_NAME,
        "Progress",
        Placement::Before(Some(reference("absente"))),
    )
    .unwrap();
    assert_eq!(rank(&store, APPEL_PATH).as_deref(), Some("2"));
}

#[test]
fn a_card_moved_within_its_column_keeps_its_status_and_gets_its_new_place() {
    let store = workspace();
    store
        .write(
            &path("clients/actions/2026-11-13-b.md"),
            "---\ntype: crm-action\nstatut: Progress\ndate: '2026-11-13'\n---\n# B\n",
        )
        .unwrap();
    moved(
        &store,
        "2026-11-13-b",
        "Progress",
        Placement::Before(Some(reference(DEVIS_NAME))),
    )
    .unwrap();
    assert_eq!(
        rank(&store, "clients/actions/2026-11-13-b.md").as_deref(),
        Some("1")
    );
    assert_eq!(rank(&store, DEVIS_PATH).as_deref(), Some("2"));
    assert!(text(&store, "clients/actions/2026-11-13-b.md").contains("statut: Progress\n"));
}

#[test]
fn a_card_dropped_without_a_place_or_in_a_finished_column_only_changes_its_status() {
    let store = workspace();
    moved(&store, DEVIS_NAME, "WaitingFor", Placement::Unplaced).unwrap();
    assert!(text(&store, DEVIS_PATH).contains("statut: WaitingFor\n"));
    assert_eq!(rank(&store, DEVIS_PATH), None);
    moved(
        &store,
        APPEL_NAME,
        "Done",
        Placement::Before(Some(reference(FAIT_NAME))),
    )
    .unwrap();
    assert!(text(&store, APPEL_PATH).contains("statut: Done\n"));
    assert_eq!(rank(&store, APPEL_PATH), None);
    assert_eq!(rank(&store, FAIT_PATH), None);
}

#[test]
fn a_card_dropped_in_an_unknown_column_or_gone_is_refused_and_nothing_changes() {
    let store = workspace();
    assert_eq!(
        moved(&store, APPEL_NAME, "Ailleurs", Placement::Unplaced),
        Err(AppError::UnknownStatus("Ailleurs".to_owned()))
    );
    assert_eq!(
        moved(&store, "absente", "Progress", Placement::Unplaced),
        Err(AppError::FicheGone)
    );
    assert_eq!(text(&store, APPEL_PATH), APPEL);
}

#[test]
fn an_action_goes_to_the_trash_and_the_others_stay() {
    let store = workspace();
    let trashed = DeleteAction::new(&store)
        .execute(&crm(), &reference(DEVIS_NAME))
        .unwrap();
    assert_eq!(trashed, path(DEVIS_PATH));
    assert!(store.read(&path(DEVIS_PATH)).is_err());
    assert_eq!(store.trash().unwrap().notes[0].content, DEVIS);
    assert_eq!(text(&store, APPEL_PATH), APPEL);
    assert_eq!(
        DeleteAction::new(&store).execute(&crm(), &reference(DEVIS_NAME)),
        Err(AppError::FicheGone)
    );
    assert_eq!(CrmKind::of(DEVIS), Some(CrmKind::Action));
}
