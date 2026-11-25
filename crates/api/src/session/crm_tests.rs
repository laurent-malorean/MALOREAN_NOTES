use std::sync::Arc;

use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

use super::*;
use crate::{
    ActionPersonItem, ChecklistItem, ColumnItem, CommentItem, CrmActionItem, CrmCompanyItem,
    CrmPersonItem, CrmProjectItem, NoDataItem, PassageItem, TallyItem, UrgencyItem, WeekDayItem,
    WeekItem,
};

const DEVIS: &str = "---\ntype: crm-action\npersonnes: ['[[jean-dupont]] · [[acme]]', '[[marie-durand]]']\nstatut: Progress\ndate: '2026-11-10'\ncanal: appel\nprojet: '[[refonte]]'\ncouleur: violet\ntags: [urgent]\nnotes: ['[[Plan]]']\nrang: 1\n---\n# Demande de devis\n\nPour 3 postes.\n\n#### Liste à cocher : Préparation\n- [x] Relire\n- [ ] Chiffrer\n\n#### Commentaires\n- 2026-11-10 10:32 · Rappelé.\n";
const NOTES: [(&str, &str); 8] = [
    ("clients.md", "---\ntype: crm\n---\n# Clients\n"),
    (
        "clients/entreprises/acme.md",
        "---\ntype: crm-entreprise\nsite: https://acme.fr\nsecteur: Industrie\nadresse: Lyon\ntelephone: 01\n---\n# Acme\n\nNotes.\n",
    ),
    (
        "clients/personnes/jean-dupont.md",
        "---\ntype: crm-personne\nfonction: Chef\nentreprise: '[[acme]]'\nparcours: ['[[acme]] · 2026-03-01 →']\nemail: jean@acme.fr\ntelephone: 06\nlinkedin: https://l\n---\n# Jean Dupont\n\nNotes de Jean.\n",
    ),
    (
        "clients/personnes/marie-durand.md",
        "---\ntype: crm-personne\n---\n# Marie Durand\n",
    ),
    (
        "clients/projets/refonte.md",
        "---\ntype: crm-projet\ncouleur: bleu\n---\n# Refonte\n",
    ),
    ("clients/actions/2026-11-10-demande-de-devis.md", DEVIS),
    (
        "clients/actions/2026-11-16-appel.md",
        "---\ntype: crm-action\ndate: '2026-11-16'\n---\n# Appel\n",
    ),
    (
        "clients/actions/2026-11-01-fait.md",
        "---\ntype: crm-action\nstatut: Done\ndate: '2026-11-01'\n---\n# Fait\n",
    ),
];

fn session() -> Session {
    let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(&NOTES)));
    let session = Session::new(
        Arc::new(opener),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session
}

fn s(text: &str) -> String {
    text.to_owned()
}

fn read(session: &Session) -> CrmItem {
    session
        .read_crm("clients.md", CrmFiltersItem::default(), None)
        .unwrap()
}

#[test]
fn a_crm_needs_an_open_workspace() {
    let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
    let session = Session::new(
        Arc::new(opener),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    assert!(session.create_crm("", "C").is_err());
    assert!(
        session
            .read_crm("c.md", CrmFiltersItem::default(), None)
            .is_err()
    );
    assert!(session.delete_crm_action("c.md", "a").is_err());
    assert!(
        session
            .change_crm_stages("c.md", StageChangeItem::Add { name: s("A") })
            .is_err()
    );
}

#[test]
fn a_crm_is_created_and_read_with_its_title_and_its_day() {
    let session = session();
    let created = session.create_crm("clients", "Pipeline").unwrap();
    assert_eq!(created.path, "clients/pipeline.md");
    let view = session
        .read_crm(&created.path, CrmFiltersItem::default(), Some("2026-11-25"))
        .unwrap();
    assert_eq!(view.title, "Pipeline");
    assert_eq!(view.stages, ["Progress", "WaitingFor"]);
    assert_eq!(view.today, "2026-11-16");
    assert_eq!(view.week.monday, "2026-11-23");
    assert!(session.create_crm("../x", "T").is_err());
    assert!(session.create_crm("", " ").is_err());
    assert!(
        session
            .read_crm("clients.md", CrmFiltersItem::default(), Some("demain"))
            .is_err()
    );
    assert!(
        session
            .read_crm("../x.md", CrmFiltersItem::default(), None)
            .is_err()
    );
}

#[test]
fn the_view_of_a_crm_carries_every_fiche_and_what_the_domain_computes() {
    let view = read(&session());
    assert_eq!(view.closed_page, 10);
    assert_eq!(view.tags, ["urgent"]);
    assert!(view.unreadable.is_empty());
    assert_eq!(
        view.nodata,
        NoDataItem {
            people: vec![s("marie-durand")],
            tally: TallyItem {
                open: 2,
                late: 1,
                today: 1
            },
        }
    );
    assert_eq!(
        view.companies[0],
        CrmCompanyItem {
            name: s("acme"),
            title: s("Acme"),
            site: Some(s("https://acme.fr")),
            sector: Some(s("Industrie")),
            address: Some(s("Lyon")),
            phone: Some(s("01")),
            notes: s("Notes."),
            people: vec![s("jean-dupont")],
            tally: TallyItem {
                open: 1,
                late: 1,
                today: 0
            },
        }
    );
    assert_eq!(
        view.people[0],
        CrmPersonItem {
            name: s("jean-dupont"),
            title: s("Jean Dupont"),
            role: Some(s("Chef")),
            company: Some(s("acme")),
            career: vec![PassageItem {
                company: s("acme"),
                from: s("2026-03-01"),
                to: None
            }],
            email: Some(s("jean@acme.fr")),
            phone: Some(s("06")),
            linkedin: Some(s("https://l")),
            notes: s("Notes de Jean."),
            open_actions: vec![s("2026-11-10-demande-de-devis")],
            closed_actions: vec![],
            tally: TallyItem {
                open: 1,
                late: 1,
                today: 0
            },
        }
    );
}

#[test]
fn a_person_without_company_and_a_project_are_shown_with_their_counts() {
    let view = read(&session());
    assert_eq!(view.people[1].company, None);
    assert_eq!(view.people[1].career, vec![]);
    assert_eq!(
        view.projects,
        [CrmProjectItem {
            name: s("refonte"),
            title: s("Refonte"),
            color: s("bleu"),
            tags: vec![],
            open_actions: vec![s("2026-11-10-demande-de-devis")],
            tally: TallyItem {
                open: 1,
                late: 1,
                today: 0
            },
        }]
    );
}

#[test]
fn the_tags_of_a_project_are_changed_by_a_gesture_and_shown_by_the_next_reading() {
    let session = session();
    let tags = vec![s("client"), s("2027")];
    session
        .change_crm_project(
            "clients.md",
            "refonte",
            crate::CrmProjectChangeItem::Tags { tags: tags.clone() },
        )
        .unwrap();
    assert_eq!(read(&session).projects[0].tags, tags);
    assert_eq!(
        session
            .read_note("clients/projets/refonte.md")
            .unwrap()
            .content,
        "---\ntype: crm-projet\ncouleur: bleu\ntags: [client, 2027]\n---\n# Refonte\n"
    );
}

#[test]
fn an_action_is_shown_with_everything_it_says_and_its_urgency() {
    let view = read(&session());
    let devis = view
        .actions
        .iter()
        .find(|a| a.name == "2026-11-10-demande-de-devis")
        .unwrap();
    assert_eq!(
        *devis,
        CrmActionItem {
            name: s("2026-11-10-demande-de-devis"),
            title: s("Demande de devis"),
            people: vec![
                ActionPersonItem {
                    person: s("jean-dupont"),
                    company: Some(s("acme"))
                },
                ActionPersonItem {
                    person: s("marie-durand"),
                    company: None
                },
            ],
            companies: vec![Some(s("acme")), None],
            status: s("Progress"),
            open: true,
            date: Some(s("2026-11-10")),
            urgency: Some(UrgencyItem::Late { days: 6 }),
            channel: Some(s("appel")),
            project: Some(s("refonte")),
            color: Some(s("violet")),
            tags: vec![s("urgent")],
            linked_notes: vec![s("Plan")],
            rank: Some(1),
            description: s("Pour 3 postes."),
            checklists: vec![ChecklistItem {
                name: s("Préparation"),
                items: vec![
                    crate::ChecklistEntryItem {
                        done: true,
                        text: s("Relire")
                    },
                    crate::ChecklistEntryItem {
                        done: false,
                        text: s("Chiffrer")
                    },
                ],
                done: 1,
            }],
            comments: vec![CommentItem {
                at: s("2026-11-10 10:32"),
                text: s("Rappelé.")
            }],
        }
    );
}

#[test]
fn an_action_for_today_and_a_finished_one_are_shown_without_delay() {
    let view = read(&session());
    let appel = view.actions.iter().find(|a| a.title == "Appel").unwrap();
    assert_eq!(appel.urgency, Some(UrgencyItem::Today));
    assert_eq!(appel.status, "TODO");
    assert_eq!(appel.companies, [None]);
    let fait = view.actions.iter().find(|a| a.title == "Fait").unwrap();
    assert!(!fait.open);
    assert_eq!(fait.urgency, None);
    assert_eq!(fait.rank, None);
}

#[test]
fn the_kanban_and_my_week_come_with_their_counts_and_cards() {
    let view = read(&session());
    let columns: Vec<(String, bool, u32, u32, usize)> = view
        .columns
        .iter()
        .map(|c: &ColumnItem| (c.status.clone(), c.closed, c.count, c.late, c.cards.len()))
        .collect();
    assert_eq!(
        columns,
        [
            (s("TODO"), false, 1, 0, 1),
            (s("Progress"), false, 1, 1, 1),
            (s("WaitingFor"), false, 0, 0, 0),
            (s("Done"), true, 1, 0, 1),
            (s("Cancel"), true, 0, 0, 0),
        ]
    );
    assert_eq!(
        view.week,
        WeekItem {
            monday: s("2026-11-16"),
            sunday: s("2026-11-22"),
            late: vec![s("2026-11-10-demande-de-devis")],
            days: vec![
                WeekDayItem {
                    day: s("2026-11-16"),
                    cards: vec![s("2026-11-16-appel")]
                },
                WeekDayItem {
                    day: s("2026-11-17"),
                    cards: vec![]
                },
                WeekDayItem {
                    day: s("2026-11-18"),
                    cards: vec![]
                },
                WeekDayItem {
                    day: s("2026-11-19"),
                    cards: vec![]
                },
                WeekDayItem {
                    day: s("2026-11-20"),
                    cards: vec![]
                },
                WeekDayItem {
                    day: s("2026-11-21"),
                    cards: vec![]
                },
                WeekDayItem {
                    day: s("2026-11-22"),
                    cards: vec![]
                },
            ],
        }
    );
}

#[test]
fn the_filters_of_the_interface_hide_cards() {
    let session = session();
    let filters = CrmFiltersItem {
        search: s("postes"),
        ..CrmFiltersItem::default()
    };
    let view = session.read_crm("clients.md", filters, None).unwrap();
    assert!(view.columns[0].cards.is_empty());
    assert_eq!(view.columns[0].count, 1);
    assert_eq!(view.columns[1].cards, ["2026-11-10-demande-de-devis"]);
    let wrong = CrmFiltersItem {
        person: Some(s("")),
        ..CrmFiltersItem::default()
    };
    assert!(session.read_crm("clients.md", wrong, None).is_err());
}

#[test]
fn the_email_of_another_person_is_signalled() {
    let session = session();
    assert!(
        session
            .crm_email_is_known("clients.md", "Jean@acme.fr", None)
            .unwrap()
    );
    assert!(
        !session
            .crm_email_is_known("clients.md", "jean@acme.fr", Some("jean-dupont"))
            .unwrap()
    );
    assert!(
        session
            .crm_email_is_known("clients.md", "jean@acme.fr", Some(""))
            .is_err()
    );
}

#[test]
fn a_note_that_is_not_a_crm_is_refused_with_a_readable_message() {
    let session = session();
    let refused = session
        .read_crm(
            "clients/actions/2026-11-16-appel.md",
            CrmFiltersItem::default(),
            None,
        )
        .unwrap_err();
    assert_eq!(refused.message, "cette note n'est pas un CRM");
    assert_eq!(
        session
            .change_crm_action(
                "clients.md",
                "absente",
                CrmActionChangeItem::Title { title: s("T") }
            )
            .unwrap_err()
            .message,
        "Cette fiche n'existe plus."
    );
}
