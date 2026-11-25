use domain::crm::{CompanyChoice, Day, Filters, Status, Tally};

use super::*;
use crate::testing::{FixedClock, InMemoryNoteStore};
use crate::use_cases::crm::fixture::*;

fn view_with(filters: &Filters, week_day: Option<Day>) -> CrmView {
    let store = workspace();
    ReadCrm::new(&store, &FixedClock::default())
        .execute(&crm(), filters, week_day)
        .unwrap()
}

fn view() -> CrmView {
    view_with(&Filters::default(), None)
}

fn names(references: &[domain::crm::Reference]) -> Vec<&str> {
    references.iter().map(|r| r.as_str()).collect()
}

#[test]
fn a_crm_is_read_with_its_title_stages_and_the_day_of_the_clock() {
    let view = view();
    assert_eq!(view.title, "Clients");
    assert_eq!(view.stages.names(), ["Progress", "WaitingFor"]);
    assert_eq!(view.today.to_string(), "2026-11-16");
    assert!(view.unreadable.is_empty());
    assert_eq!(
        view.actions
            .iter()
            .map(|a| a.name.as_str())
            .collect::<Vec<_>>(),
        [FAIT_NAME, DEVIS_NAME, APPEL_NAME]
    );
}

#[test]
fn companies_and_people_are_listed_alphabetically_with_their_tallies() {
    let view = view();
    let companies: Vec<&str> = view.companies.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(companies, ["acme", "globex"]);
    assert_eq!(view.companies[0].company.name, "Acme");
    assert_eq!(names(&view.companies[0].people), ["jean-dupont"]);
    assert_eq!(
        view.companies[0].tally,
        Tally {
            open: 1,
            late: 1,
            today: 0
        }
    );
    assert_eq!(view.companies[1].tally, Tally::default());
    assert!(view.companies[1].people.is_empty());
    assert_eq!(names(&view.nodata.people), ["marie-durand"]);
    assert_eq!(
        view.nodata.tally,
        Tally {
            open: 2,
            late: 1,
            today: 1
        }
    );
    let people: Vec<&str> = view.people.iter().map(|p| p.name.as_str()).collect();
    assert_eq!(people, ["jean-dupont", "marie-durand"]);
}

#[test]
fn a_person_has_her_open_actions_most_late_first_and_her_closed_ones() {
    let view = view();
    let marie = &view.people[1];
    assert_eq!(names(&marie.open_actions), [DEVIS_NAME, APPEL_NAME]);
    assert!(marie.closed_actions.is_empty());
    assert_eq!(
        marie.tally,
        Tally {
            open: 2,
            late: 1,
            today: 1
        }
    );
    assert_eq!(view.people[0].person.name, "Jean Dupont");
    assert_eq!(names(&view.people[0].open_actions), [DEVIS_NAME]);
}

#[test]
fn a_closed_action_is_listed_for_its_people_most_recent_first() {
    let store = workspace();
    store
        .write(
            &path("clients/actions/2026-11-02-autre.md"),
            "---\ntype: crm-action\npersonnes: ['[[marie-durand]]']\nstatut: Cancel\ndate: '2026-11-02'\n---\n# Autre\n",
        )
        .unwrap();
    store
        .write(
            &path("clients/actions/2026-11-03-vieux.md"),
            "---\ntype: crm-action\npersonnes: ['[[marie-durand]]']\nstatut: Done\ndate: '2026-10-01'\n---\n# Vieux\n",
        )
        .unwrap();
    let view = ReadCrm::new(&store, &FixedClock::default())
        .execute(&crm(), &Filters::default(), None)
        .unwrap();
    assert_eq!(
        names(&view.people[1].closed_actions),
        ["2026-11-02-autre", "2026-11-03-vieux"]
    );
}

#[test]
fn a_project_has_its_open_actions_and_its_color() {
    let view = view();
    assert_eq!(view.projects.len(), 1);
    assert_eq!(view.projects[0].name.as_str(), "refonte");
    assert_eq!(view.projects[0].project.color.name(), "bleu");
    assert_eq!(names(&view.projects[0].open_actions), [DEVIS_NAME]);
    assert_eq!(
        view.projects[0].tally,
        Tally {
            open: 1,
            late: 1,
            today: 0
        }
    );
}

#[test]
fn the_kanban_has_a_column_per_status_with_the_counts_of_all_its_cards() {
    let view = view();
    let columns: Vec<(&str, usize, usize, Vec<&str>)> = view
        .columns
        .iter()
        .map(|c| (c.status.name(), c.count, c.late, names(&c.cards)))
        .collect();
    assert_eq!(
        columns,
        [
            ("TODO", 1, 0, vec![APPEL_NAME]),
            ("Progress", 1, 1, vec![DEVIS_NAME]),
            ("WaitingFor", 0, 0, vec![]),
            ("Done", 1, 0, vec![FAIT_NAME]),
            ("Cancel", 0, 0, vec![]),
        ]
    );
}

#[test]
fn filters_hide_cards_but_not_the_counts_and_apply_to_the_week_too() {
    let filters = Filters {
        search: "devis".to_owned(),
        ..Filters::default()
    };
    let view = view_with(&filters, None);
    assert_eq!(view.columns[0].count, 1);
    assert!(view.columns[0].cards.is_empty());
    assert_eq!(names(&view.columns[1].cards), [DEVIS_NAME]);
    assert!(view.week.days[0].1.is_empty());
    assert_eq!(names(&view.week.late), [DEVIS_NAME]);
    let company = Filters {
        company: Some(CompanyChoice::Company(reference("globex"))),
        ..Filters::default()
    };
    let none = view_with(&company, None);
    assert!(none.columns.iter().all(|c| c.cards.is_empty()));
    assert!(none.week.late.is_empty());
}

#[test]
fn my_week_is_the_week_of_today_or_of_the_day_asked() {
    let this_week = view().week;
    assert_eq!(this_week.monday.to_string(), "2026-11-16");
    assert_eq!(this_week.sunday.to_string(), "2026-11-22");
    assert_eq!(names(&this_week.late), [DEVIS_NAME]);
    assert_eq!(this_week.days.len(), 7);
    assert_eq!(names(&this_week.days[0].1), [APPEL_NAME]);
    let next = view_with(&Filters::default(), Some(Day::parse("2026-11-25").unwrap())).week;
    assert_eq!(next.monday.to_string(), "2026-11-23");
    assert_eq!(names(&next.late), [DEVIS_NAME, APPEL_NAME]);
    assert!(next.days.iter().all(|(_, cards)| cards.is_empty()));
}

#[test]
fn the_tags_of_the_actions_are_listed() {
    assert_eq!(view().tags, ["urgent"]);
}

#[test]
fn a_fiche_that_cannot_be_read_is_left_aside_and_never_erased() {
    let store = workspace();
    store
        .write(
            &path("clients/actions/cassee.md"),
            "---\ntype: crm-action\n---\nsans titre\n",
        )
        .unwrap();
    store
        .write(&path("clients/personnes/note.md"), "# Une note ordinaire\n")
        .unwrap();
    store
        .write(
            &path("clients/projets/sans-titre.md"),
            "---\ntype: crm-projet\n---\n",
        )
        .unwrap();
    store
        .write(
            &path("clients/personnes/vide.md"),
            "---\ntype: crm-personne\n---\n",
        )
        .unwrap();
    store
        .write(
            &path("clients/entreprises/vide.md"),
            "---\ntype: crm-entreprise\n---\n",
        )
        .unwrap();
    let view = ReadCrm::new(&store, &FixedClock::default())
        .execute(&crm(), &Filters::default(), None)
        .unwrap();
    assert_eq!(view.actions.len(), 3);
    assert_eq!(view.people.len(), 2);
    assert_eq!(view.projects.len(), 1);
    assert_eq!(view.companies.len(), 2);
    let mut left_aside: Vec<String> = view.unreadable.iter().map(|p| p.to_path()).collect();
    left_aside.sort();
    assert_eq!(
        left_aside,
        [
            "clients/actions/cassee.md",
            "clients/entreprises/vide.md",
            "clients/personnes/vide.md",
            "clients/projets/sans-titre.md"
        ]
    );
    assert_eq!(
        text(&store, "clients/actions/cassee.md"),
        "---\ntype: crm-action\n---\nsans titre\n"
    );
}

#[test]
fn only_the_fiches_of_the_right_kind_in_the_right_folder_belong_to_the_crm() {
    let store = workspace();
    store
        .write(&path("clients/actions/personne.md"), JEAN)
        .unwrap();
    store
        .write(&path("clients/actions/plan.canvas"), "{}")
        .unwrap();
    store.write(&path("ailleurs/actions/x.md"), DEVIS).unwrap();
    let view = ReadCrm::new(&store, &FixedClock::default())
        .execute(&crm(), &Filters::default(), None)
        .unwrap();
    assert_eq!(view.actions.len(), 3);
    assert_eq!(view.people.len(), 2);
}

#[test]
fn a_crm_without_fiche_or_in_a_folder_is_read() {
    let store = InMemoryNoteStore::with_notes(&[
        (
            "Ventes/pipeline.md",
            "---\ntype: crm\netapes: [Négo]\n---\n# Pipeline\n",
        ),
        (
            "Ventes/pipeline/actions/2026-11-16-a.md",
            "---\ntype: crm-action\nstatut: négo\n---\n# A\n",
        ),
    ]);
    let view = ReadCrm::new(&store, &FixedClock::default())
        .execute(&path("Ventes/pipeline.md"), &Filters::default(), None)
        .unwrap();
    assert_eq!(view.title, "Pipeline");
    assert_eq!(view.actions.len(), 1);
    assert_eq!(
        view.columns[1].status,
        Status::read(Some("Négo"), &view.stages)
    );
    assert_eq!(view.columns[1].cards.len(), 1);
    assert!(view.companies.is_empty() && view.people.is_empty() && view.projects.is_empty());
    let empty = InMemoryNoteStore::with_notes(&[("c.md", "---\ntype: crm\n---\n# C\n")]);
    let view = ReadCrm::new(&empty, &FixedClock::default())
        .execute(&path("c.md"), &Filters::default(), None)
        .unwrap();
    assert!(view.actions.is_empty());
    assert!(view.nodata.people.is_empty());
}

#[test]
fn a_note_that_is_not_a_crm_or_does_not_exist_is_refused() {
    let store = InMemoryNoteStore::with_notes(&[
        ("n.md", "# Note\n"),
        ("clients.md", "---\ntype: crm\n---\n# C\n"),
    ]);
    let read = |name: &str| {
        ReadCrm::new(&store, &FixedClock::default()).execute(&path(name), &Filters::default(), None)
    };
    assert_eq!(read("n.md"), Err(AppError::NotACrm));
    assert!(matches!(read("absente.md"), Err(AppError::NoteNotFound(_))));
    assert!(read("clients.md").is_ok());
}

#[test]
fn an_email_already_known_of_another_person_is_signalled() {
    let store = workspace();
    let check = |email: &str, except: Option<&str>| {
        CheckEmail::new(&store)
            .execute(&crm(), email, except.map(reference).as_ref())
            .unwrap()
    };
    assert!(check("JEAN@acme.fr", None));
    assert!(!check("jean@acme.fr", Some("jean-dupont")));
    assert!(check("jean@acme.fr", Some("marie-durand")));
    assert!(!check("autre@acme.fr", None));
    assert!(!check("", None));
}
