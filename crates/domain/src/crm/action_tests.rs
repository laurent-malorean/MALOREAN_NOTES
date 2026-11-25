use super::*;
use crate::crm::{Checklist, ChecklistItem, Comment, DayTime};

const DEVIS: &str = "---\ntype: crm-action\npersonnes: ['[[jean-dupont]] · [[acme]]', '[[marie-durand]]']\nstatut: Progress\ndate: '2026-11-24'\ncanal: e-mail\nprojet: '[[refonte-du-site]]'\ncouleur: violet\ntags: [urgent, salon]\nnotes: ['[[Cahier des charges]]']\nrang: 2\n---\n# Demande de devis\n\nPour 3 postes. Voir le [[plan de la salle]].\n\n#### Liste à cocher : Préparation\n- [x] Relire la demande\n- [ ] Chiffrer\n\n#### Commentaires\n- 2026-11-24 10:32 · Rappelé, pas de réponse.\n  Retenter jeudi.\n";

fn reference(target: &str) -> Reference {
    Reference::to(target).unwrap()
}

fn day(text: &str) -> Day {
    Day::parse(text).unwrap()
}

fn parse(content: &str) -> Action {
    Action::parse(
        reference("2026-11-24-demande-de-devis"),
        content,
        &Stages::default(),
    )
    .unwrap()
}

fn person(person: &str, company: Option<&str>) -> ActionPerson {
    ActionPerson {
        person: reference(person),
        company: company.map(reference),
    }
}

fn bare(yaml: &str) -> Action {
    parse(&format!("---\ntype: crm-action\n{yaml}---\n# A\n"))
}

#[test]
fn an_action_is_read_with_its_title_its_people_and_its_status() {
    let action = parse(DEVIS);
    assert_eq!(action.name, reference("2026-11-24-demande-de-devis"));
    assert_eq!(action.title, "Demande de devis");
    assert_eq!(
        action.people,
        vec![
            person("jean-dupont", Some("acme")),
            person("marie-durand", None)
        ]
    );
    assert_eq!(action.status.name(), "Progress");
    assert_eq!(action.date, Some(day("2026-11-24")));
    assert_eq!(action.rank, NonZeroU32::new(2));
}

#[test]
fn an_action_is_read_with_its_channel_its_project_its_color_its_tags_and_its_notes() {
    let action = parse(DEVIS);
    assert_eq!(action.channel, Some(Channel::Email));
    assert_eq!(action.project, Some(reference("refonte-du-site")));
    assert_eq!(action.color.map(Color::name), Some("violet"));
    assert_eq!(action.tags, ["urgent", "salon"]);
    assert_eq!(action.linked_notes, vec![reference("Cahier des charges")]);
}

#[test]
fn an_action_is_read_with_its_description_its_checklists_and_its_comments() {
    let body = parse(DEVIS).body;
    assert_eq!(
        body.description,
        "Pour 3 postes. Voir le [[plan de la salle]]."
    );
    assert_eq!(
        body.checklists,
        vec![Checklist {
            name: "Préparation".to_owned(),
            items: vec![
                ChecklistItem {
                    done: true,
                    text: "Relire la demande".to_owned()
                },
                ChecklistItem {
                    done: false,
                    text: "Chiffrer".to_owned()
                },
            ],
        }]
    );
    assert_eq!(
        body.comments,
        vec![Comment {
            at: DayTime::parse("2026-11-24 10:32").unwrap(),
            text: "Rappelé, pas de réponse.\nRetenter jeudi.".to_owned(),
        }]
    );
}

#[test]
fn an_action_with_only_a_title_has_no_person_no_date_and_is_in_todo() {
    let action = bare("");
    assert!(action.people.is_empty());
    assert_eq!(action.status, Status::Todo);
    assert_eq!(action.date, None);
    assert_eq!(action.rank, None);
    assert_eq!(action.body, Body::default());
}

#[test]
fn an_action_with_only_a_title_has_no_channel_no_project_no_color_no_tag_no_note() {
    let action = bare("");
    assert_eq!(action.channel, None);
    assert_eq!(action.project, None);
    assert_eq!(action.color, None);
    assert!(action.tags.is_empty());
    assert!(action.linked_notes.is_empty());
}

#[test]
fn an_unknown_status_is_todo_and_a_status_is_read_without_case_nor_accents() {
    assert_eq!(bare("statut: Retiree\n").status, Status::Todo);
    assert_eq!(bare("statut: DONE\n").status, Status::Done);
    assert_eq!(bare("statut: progress\n").status.name(), "Progress");
}

#[test]
fn a_value_that_means_nothing_is_read_as_absent() {
    let action = bare("date: demain\ncanal: pigeon\nprojet: refonte\ncouleur: fuchsia\nrang: 0\n");
    assert_eq!(
        (
            action.date,
            action.channel,
            action.project,
            action.color,
            action.rank
        ),
        (None, None, None, None, None)
    );
    assert_eq!(bare("rang: -1\n").rank, None);
    assert_eq!(bare("rang: deux\n").rank, None);
    assert_eq!(bare("rang: 1\n").rank, NonZeroU32::new(1));
    assert_eq!(bare("date: '2026-02-30'\n").date, None);
}

#[test]
fn a_person_given_twice_is_kept_once_with_the_first_company() {
    let action = bare(
        "personnes: ['[[a]] · [[x]]', '[[b]]', '[[a]]', '[[a]] · [[y]]', 'pas une personne']\n",
    );
    assert_eq!(
        action.people,
        vec![person("a", Some("x")), person("b", None)]
    );
}

#[test]
fn a_person_of_an_action_is_written_with_her_company_of_the_moment() {
    assert_eq!(person("jean", Some("acme")).entry(), "[[jean]] · [[acme]]");
    assert_eq!(person("jean", None).entry(), "[[jean]]");
    assert_eq!(
        ActionPerson::parse("  [[jean]] · [[acme]] "),
        Some(person("jean", Some("acme")))
    );
    assert_eq!(
        ActionPerson::parse("[[jean]]·[[acme]]"),
        Some(person("jean", Some("acme")))
    );
    assert_eq!(
        ActionPerson::parse("[[jean]] · rien"),
        Some(person("jean", None))
    );
    assert_eq!(ActionPerson::parse("jean"), None);
    assert_eq!(ActionPerson::parse(""), None);
}

#[test]
fn tags_are_read_like_those_of_any_note() {
    assert_eq!(bare("tags: a, b\n").tags, ["a", "b"]);
    assert_eq!(bare("tags:\n  - a\n  - '#b'\n  - a\n").tags, ["a", "b"]);
}

#[test]
fn an_action_without_title_or_of_another_kind_is_left_aside() {
    let stages = Stages::default();
    let name = reference("a");
    assert_eq!(
        Action::parse(name.clone(), "---\ntype: crm-action\n---\ntexte\n", &stages),
        Err(Unreadable::NoTitle)
    );
    assert_eq!(
        Action::parse(name.clone(), "---\ntype: crm-personne\n---\n# A\n", &stages),
        Err(Unreadable::WrongKind)
    );
    assert_eq!(
        Action::parse(name, "# A\n", &stages),
        Err(Unreadable::WrongKind)
    );
}

#[test]
fn a_status_is_a_column_of_the_crm_that_reads_it() {
    let stages = Stages::read(&["Négociation".to_owned()]);
    let read = |statut: &str| {
        Action::parse(
            reference("a"),
            &format!("---\ntype: crm-action\nstatut: {statut}\n---\n# A\n"),
            &stages,
        )
        .unwrap()
        .status
    };
    assert_eq!(read("negociation").name(), "Négociation");
    assert_eq!(read("Progress"), Status::Todo);
}

#[test]
fn the_seven_channels_have_their_names_and_are_read_without_case_nor_accents() {
    let names: Vec<_> = Channel::ALL.iter().map(|c| c.name()).collect();
    assert_eq!(
        names,
        [
            "appel",
            "e-mail",
            "rendez-vous",
            "courrier",
            "salon",
            "réseau social",
            "autre"
        ]
    );
    for channel in Channel::ALL {
        assert_eq!(Channel::read(channel.name()), Some(channel));
    }
    assert_eq!(
        Channel::read(" Réseau  SOCIAL "),
        Some(Channel::SocialNetwork)
    );
    assert_eq!(Channel::read("reseau social"), Some(Channel::SocialNetwork));
    assert_eq!(Channel::read("E-Mail"), Some(Channel::Email));
    assert_eq!(Channel::read("email"), None);
    assert_eq!(Channel::read(""), None);
}

#[test]
fn an_action_is_written_in_full_in_the_order_of_the_specification() {
    assert_eq!(parse(DEVIS).to_content(), DEVIS);
}

#[test]
fn an_action_that_says_little_is_written_with_its_status_only() {
    let mut action = bare("");
    action.title = "Appeler".to_owned();
    assert_eq!(
        action.to_content(),
        "---\ntype: crm-action\nstatut: TODO\n---\n# Appeler\n"
    );
}

#[test]
fn an_action_written_in_full_is_read_back_the_same() {
    let action = parse(DEVIS);
    assert_eq!(parse(&action.to_content()), action);
    let mut other = action;
    other.tags = vec![
        "Salon".to_owned(),
        "salon".to_owned(),
        "a, b".to_owned(),
        "#x".to_owned(),
    ];
    other.rank = None;
    other.status = Status::Done;
    let read = parse(&other.to_content());
    assert_eq!(read.tags, ["Salon", "x"]);
    assert_eq!(read.status, Status::Done);
}

#[test]
fn the_title_of_a_new_action_is_not_interpreted() {
    let mut action = bare("");
    action.title = "Appel : [urgent] #1".to_owned();
    assert_eq!(parse(&action.to_content()).title, "Appel : [urgent] #1");
}
