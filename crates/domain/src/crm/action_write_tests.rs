use super::*;
use crate::crm::{Checklist, ChecklistItem};

const DEVIS: &str = "---\ntype: crm-action\naliases: [devis]\npersonnes: ['[[jean-dupont]] · [[acme]]', '[[marie-durand]]']\nstatut: Progress\ndate: '2026-11-24'\ncanal: e-mail\nprojet: '[[refonte-du-site]]'\ncouleur: violet\ntags: [urgent, salon]\nnotes: ['[[Cahier des charges]]']\nrang: 2\n# commentaire libre\n---\n# Demande de devis\n\nPour 3 postes.\n";

fn reference(target: &str) -> Reference {
    Reference::to(target).unwrap()
}

fn stages() -> Stages {
    Stages::default()
}

fn without_line(content: &str, line: &str) -> String {
    content.replace(&format!("{line}\n"), "")
}

#[test]
fn changing_the_status_erases_the_rank_and_changes_nothing_else() {
    let changed = with_status(DEVIS, &stages(), &Status::Done);
    assert_eq!(
        changed,
        without_line(
            &DEVIS.replace("statut: Progress", "statut: Done"),
            "rang: 2"
        )
    );
}

#[test]
fn the_same_status_changes_nothing_not_even_the_rank() {
    let same = Status::read(Some("progress"), &stages());
    assert_eq!(with_status(DEVIS, &stages(), &same), DEVIS);
    let unknown = "---\ntype: crm-action\nstatut: Retiree\nrang: 3\n---\n# A\n";
    assert_eq!(with_status(unknown, &stages(), &Status::Todo), unknown);
    assert_eq!(
        with_status(unknown, &stages(), &Status::Done),
        "---\ntype: crm-action\nstatut: Done\n---\n# A\n"
    );
}

#[test]
fn an_action_without_status_gets_one_after_the_other_properties() {
    let content = "---\ntype: crm-action\n---\n# A\n";
    assert_eq!(
        with_status(content, &stages(), &Status::Done),
        "---\ntype: crm-action\nstatut: Done\n---\n# A\n"
    );
    assert_eq!(with_status(content, &stages(), &Status::Todo), content);
}

#[test]
fn changing_the_date_changes_only_the_date() {
    let day = Day::parse("2026-12-01").unwrap();
    assert_eq!(
        with_date(DEVIS, day),
        DEVIS.replace("2026-11-24", "2026-12-01")
    );
}

#[test]
fn changing_the_channel_the_project_or_the_color_changes_only_that() {
    assert_eq!(
        with_channel(DEVIS, Some(Channel::Call)),
        DEVIS.replace("e-mail", "appel")
    );
    assert_eq!(
        with_channel(DEVIS, Some(Channel::SocialNetwork)),
        DEVIS.replace("e-mail", "réseau social")
    );
    assert_eq!(
        with_channel(DEVIS, None),
        without_line(DEVIS, "canal: e-mail")
    );
    assert_eq!(
        with_project(DEVIS, Some(&reference("autre"))),
        DEVIS.replace("refonte-du-site", "autre")
    );
    assert_eq!(
        with_project(DEVIS, None),
        without_line(DEVIS, "projet: '[[refonte-du-site]]'")
    );
    let bleu = Color::parse("bleu");
    assert_eq!(with_color(DEVIS, bleu), DEVIS.replace("violet", "bleu"));
    assert_eq!(
        with_color(DEVIS, None),
        without_line(DEVIS, "couleur: violet")
    );
}

#[test]
fn changing_the_tags_cleans_them_like_for_any_note() {
    let tags = ["Salon", "salon", " #devis ", "a, b", ""].map(str::to_owned);
    assert_eq!(
        with_tags(DEVIS, &tags),
        DEVIS.replace("tags: [urgent, salon]", "tags: [Salon, devis]")
    );
    assert_eq!(
        with_tags(DEVIS, &[]),
        without_line(DEVIS, "tags: [urgent, salon]")
    );
}

#[test]
fn changing_the_linked_notes_the_rank_or_the_people_changes_only_that() {
    let notes = [reference("Plan"), reference("Autre note")];
    assert_eq!(
        with_linked_notes(DEVIS, &notes),
        DEVIS.replace(
            "['[[Cahier des charges]]']",
            "['[[Plan]]', '[[Autre note]]']"
        )
    );
    assert_eq!(
        with_linked_notes(DEVIS, &[]),
        without_line(DEVIS, "notes: ['[[Cahier des charges]]']")
    );
    assert_eq!(
        with_rank(DEVIS, NonZeroU32::new(5)),
        DEVIS.replace("rang: 2", "rang: 5")
    );
    assert_eq!(with_rank(DEVIS, None), without_line(DEVIS, "rang: 2"));
    let people = [
        ActionPerson {
            person: reference("a"),
            company: Some(reference("x")),
        },
        ActionPerson {
            person: reference("b"),
            company: None,
        },
        ActionPerson {
            person: reference("a"),
            company: None,
        },
    ];
    assert_eq!(
        with_people(DEVIS, &people),
        DEVIS.replace(
            "['[[jean-dupont]] · [[acme]]', '[[marie-durand]]']",
            "['[[a]] · [[x]]', '[[b]]']"
        )
    );
    assert_eq!(
        with_people(DEVIS, &[]),
        without_line(
            DEVIS,
            "personnes: ['[[jean-dupont]] · [[acme]]', '[[marie-durand]]']"
        )
    );
}

#[test]
fn a_property_the_action_lacks_is_added_without_touching_the_others() {
    let content = "---\ntype: crm-action\nautre: 1\n---\n# A\n";
    assert_eq!(
        with_channel(content, Some(Channel::Fair)),
        "---\ntype: crm-action\nautre: 1\ncanal: salon\n---\n# A\n"
    );
    assert_eq!(with_channel(content, None), content);
}

#[test]
fn changing_the_body_changes_only_the_text_under_the_title() {
    let mut body = Body::parse("\nPour 3 postes.\n");
    body.description = "Pour 4 postes.".to_owned();
    body.checklists.push(Checklist {
        name: "L".to_owned(),
        items: vec![ChecklistItem {
            done: false,
            text: "a".to_owned(),
        }],
    });
    assert_eq!(
        with_body(DEVIS, &body),
        DEVIS.replace(
            "\nPour 3 postes.\n",
            "\nPour 4 postes.\n\n#### Liste à cocher : L\n- [ ] a\n"
        )
    );
}

#[test]
fn deleting_a_person_removes_her_from_the_actions_that_cite_her() {
    assert_eq!(
        without_person(DEVIS, &reference("jean-dupont")),
        DEVIS.replace(
            "['[[jean-dupont]] · [[acme]]', '[[marie-durand]]']",
            "['[[marie-durand]]']"
        )
    );
    let alone = "---\ntype: crm-action\npersonnes: ['[[a]]']\n---\n# A\n";
    assert_eq!(
        without_person(alone, &reference("a")),
        "---\ntype: crm-action\n---\n# A\n"
    );
}

#[test]
fn an_action_that_does_not_cite_the_person_is_left_byte_for_byte() {
    let content = "---\ntype: crm-action\npersonnes:   [ '[[a]]' ,'[[b]]'  ]\n---\n# A\n";
    assert_eq!(without_person(content, &reference("z")), content);
    assert_eq!(
        without_person("---\ntype: crm-action\n---\n# A\n", &reference("a")),
        "---\ntype: crm-action\n---\n# A\n"
    );
}

#[test]
fn deleting_a_project_puts_its_actions_without_project() {
    assert_eq!(
        without_project(DEVIS, &reference("refonte-du-site")),
        without_line(DEVIS, "projet: '[[refonte-du-site]]'")
    );
    assert_eq!(without_project(DEVIS, &reference("autre")), DEVIS);
}

#[test]
fn a_reference_to_a_fiche_that_no_longer_exists_is_removed_but_not_the_past_company() {
    let people: HashSet<Reference> = [reference("jean-dupont")].into();
    let projects: HashSet<Reference> = HashSet::new();
    assert_eq!(
        without_missing(DEVIS, &people, &projects),
        without_line(
            &DEVIS.replace(
                "['[[jean-dupont]] · [[acme]]', '[[marie-durand]]']",
                "['[[jean-dupont]] · [[acme]]']"
            ),
            "projet: '[[refonte-du-site]]'"
        )
    );
}

#[test]
fn an_action_whose_references_all_exist_is_left_byte_for_byte() {
    let people: HashSet<Reference> = [reference("jean-dupont"), reference("marie-durand")].into();
    let projects: HashSet<Reference> = [reference("refonte-du-site")].into();
    assert_eq!(without_missing(DEVIS, &people, &projects), DEVIS);
    let none = "---\ntype: crm-action\n---\n# A\n";
    assert_eq!(
        without_missing(none, &HashSet::new(), &HashSet::new()),
        none
    );
}

#[test]
fn renaming_a_stage_moves_its_actions_and_keeps_their_rank() {
    let renamed = Stage::parse("En cours").unwrap();
    assert_eq!(
        with_stage_renamed(DEVIS, "progress", &renamed),
        DEVIS.replace("statut: Progress", "statut: En cours")
    );
    assert_eq!(with_stage_renamed(DEVIS, "WaitingFor", &renamed), DEVIS);
    let none = "---\ntype: crm-action\n---\n# A\n";
    assert_eq!(with_stage_renamed(none, "Progress", &renamed), none);
}

#[test]
fn removing_a_stage_sends_its_actions_back_to_todo_without_rank() {
    assert_eq!(
        with_stage_removed(DEVIS, "PROGRESS"),
        without_line(
            &DEVIS.replace("statut: Progress", "statut: TODO"),
            "rang: 2"
        )
    );
    assert_eq!(with_stage_removed(DEVIS, "WaitingFor"), DEVIS);
    let none = "---\ntype: crm-action\n---\n# A\n";
    assert_eq!(with_stage_removed(none, "Progress"), none);
}
