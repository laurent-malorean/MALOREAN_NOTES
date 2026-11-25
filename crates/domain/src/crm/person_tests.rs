use super::*;

const JEAN: &str = "---\ntype: crm-personne\nfonction: Responsable maintenance\nentreprise: '[[acme]]'\nparcours: ['[[globex]] · 2024-01-10 → 2026-03-01', '[[acme]] · 2026-03-01 →']\nemail: jean.dupont@acme.fr\ntelephone: 06 12 34 56 78\nlinkedin: https://www.linkedin.com/in/jean-dupont\n---\n# Jean Dupont\n\nNotes libres sur la personne.\n";

fn day(text: &str) -> Day {
    Day::parse(text).unwrap()
}

fn reference(target: &str) -> Reference {
    Reference::to(target).unwrap()
}

#[test]
fn a_person_is_read_with_its_fields_its_company_its_career_and_its_notes() {
    let person = Person::parse(JEAN).unwrap();
    assert_eq!(person.name, "Jean Dupont");
    assert_eq!(person.role.as_deref(), Some("Responsable maintenance"));
    assert_eq!(person.company, Some(reference("acme")));
    assert_eq!(
        person.career,
        vec![
            Passage {
                company: reference("globex"),
                from: day("2024-01-10"),
                to: Some(day("2026-03-01"))
            },
            Passage {
                company: reference("acme"),
                from: day("2026-03-01"),
                to: None
            },
        ]
    );
    assert_eq!(person.email.as_deref(), Some("jean.dupont@acme.fr"));
    assert_eq!(person.phone.as_deref(), Some("06 12 34 56 78"));
    assert_eq!(
        person.linkedin.as_deref(),
        Some("https://www.linkedin.com/in/jean-dupont")
    );
    assert_eq!(person.notes, "Notes libres sur la personne.");
}

#[test]
fn a_person_without_company_is_in_nodata() {
    let person = Person::parse("---\ntype: crm-personne\n---\n# Marie Durand\n").unwrap();
    assert_eq!(person.company, None);
    assert!(person.career.is_empty());
    assert_eq!(person.role, None);
    assert_eq!(person.email, None);
    assert_eq!(person.notes, "");
}

#[test]
fn a_company_written_without_quotes_is_read_too() {
    let person =
        Person::parse("---\ntype: crm-personne\nentreprise: [[acme]]\n---\n# A\n").unwrap();
    assert_eq!(person.company, Some(reference("acme")));
    let not_a_reference =
        Person::parse("---\ntype: crm-personne\nentreprise: acme\n---\n# A\n").unwrap();
    assert_eq!(not_a_reference.company, None);
}

#[test]
fn a_person_without_title_or_of_another_kind_is_unreadable() {
    assert_eq!(
        Person::parse("---\ntype: crm-personne\n---\n"),
        Err(Unreadable::NoTitle)
    );
    assert_eq!(
        Person::parse("---\ntype: crm-entreprise\n---\n# A\n"),
        Err(Unreadable::WrongKind)
    );
}

#[test]
fn a_passage_is_read_and_written_with_its_arrow() {
    let open = Passage::parse("[[acme]] · 2026-03-01 →").unwrap();
    assert_eq!(
        open,
        Passage {
            company: reference("acme"),
            from: day("2026-03-01"),
            to: None
        }
    );
    assert_eq!(open.line(), "[[acme]] · 2026-03-01 →");
    let closed = Passage::parse("  [[acme]]·2026-03-01→2026-06-30 ").unwrap();
    assert_eq!(closed.to, Some(day("2026-06-30")));
    assert_eq!(closed.line(), "[[acme]] · 2026-03-01 → 2026-06-30");
}

#[test]
fn a_line_that_is_not_a_passage_is_not_read() {
    for line in [
        "",
        "acme · 2026-03-01 →",
        "[[acme]] 2026-03-01 →",
        "[[acme]] · 2026-03-01",
        "[[acme]] · 2026-13-01 →",
        "[[acme]] · 2026-03-01 → demain",
        "[[acme]] · hier →",
    ] {
        assert_eq!(Passage::parse(line), None, "{line:?}");
    }
}

#[test]
fn an_unreadable_line_of_the_career_is_left_aside() {
    let person = Person::parse("---\ntype: crm-personne\nparcours: ['n importe quoi', '[[acme]] · 2026-03-01 →']\n---\n# A\n").unwrap();
    assert_eq!(person.career.len(), 1);
}

#[test]
fn a_person_created_from_a_company_enters_it_that_day() {
    let name = Name::parse("Jean Dupont").unwrap();
    let content = Person::new_content(&name, Some(&reference("acme")), day("2026-11-24"));
    assert_eq!(
        content,
        "---\ntype: crm-personne\nentreprise: '[[acme]]'\nparcours: ['[[acme]] · 2026-11-24 →']\n---\n# Jean Dupont\n"
    );
    let person = Person::parse(&content).unwrap();
    assert_eq!(person.company, Some(reference("acme")));
    assert_eq!(person.career.len(), 1);
}

#[test]
fn a_person_created_elsewhere_is_in_nodata_without_career() {
    let name = Name::parse("Marie Durand").unwrap();
    assert_eq!(
        Person::new_content(&name, None, day("2026-11-24")),
        "---\ntype: crm-personne\n---\n# Marie Durand\n"
    );
}

#[test]
fn a_person_has_four_optional_fields() {
    let keys = [
        PersonField::Role,
        PersonField::Email,
        PersonField::Phone,
        PersonField::LinkedIn,
    ]
    .map(PersonField::key);
    assert_eq!(keys, ["fonction", "email", "telephone", "linkedin"]);
}

#[test]
fn changing_a_field_or_the_notes_changes_only_that() {
    assert_eq!(
        with_field(JEAN, PersonField::Email, "j@acme.fr"),
        JEAN.replace("jean.dupont@acme.fr", "j@acme.fr")
    );
    assert_eq!(
        with_field(JEAN, PersonField::Role, ""),
        JEAN.replace("fonction: Responsable maintenance\n", "")
    );
    assert_eq!(
        with_notes(JEAN, "Autre."),
        JEAN.replace("Notes libres sur la personne.", "Autre.")
    );
}

#[test]
fn changing_company_closes_the_current_passage_and_opens_the_new_one() {
    let changed = with_company(JEAN, Some(&reference("initech")), day("2026-11-24"));
    assert_eq!(
        changed,
        JEAN.replace("entreprise: '[[acme]]'", "entreprise: '[[initech]]'")
            .replace(
                "'[[acme]] · 2026-03-01 →']",
                "'[[acme]] · 2026-03-01 → 2026-11-24', '[[initech]] · 2026-11-24 →']"
            )
    );
    let person = Person::parse(&changed).unwrap();
    assert_eq!(person.company, Some(reference("initech")));
    assert_eq!(person.career.len(), 3);
    assert_eq!(person.career[1].to, Some(day("2026-11-24")));
    assert_eq!(person.career[2].to, None);
}

#[test]
fn leaving_for_nodata_closes_the_passage_and_removes_the_company() {
    let changed = with_company(JEAN, None, day("2026-11-24"));
    assert_eq!(
        changed,
        JEAN.replace("entreprise: '[[acme]]'\n", "").replace(
            "'[[acme]] · 2026-03-01 →']",
            "'[[acme]] · 2026-03-01 → 2026-11-24']"
        )
    );
    let person = Person::parse(&changed).unwrap();
    assert_eq!(person.company, None);
    assert_eq!(person.career.len(), 2);
    assert!(person.career.iter().all(|passage| passage.to.is_some()));
}

#[test]
fn a_person_of_nodata_who_joins_a_company_gets_a_first_passage() {
    let content = "---\ntype: crm-personne\n---\n# Marie\n";
    let changed = with_company(content, Some(&reference("acme")), day("2026-11-24"));
    assert_eq!(
        changed,
        "---\ntype: crm-personne\nentreprise: '[[acme]]'\nparcours: ['[[acme]] · 2026-11-24 →']\n---\n# Marie\n"
    );
}

#[test]
fn staying_in_the_same_company_changes_nothing() {
    assert_eq!(
        with_company(JEAN, Some(&reference("acme")), day("2026-11-24")),
        JEAN
    );
    let nodata = "---\ntype: crm-personne\n---\n# Marie\n";
    assert_eq!(with_company(nodata, None, day("2026-11-24")), nodata);
}

#[test]
fn an_unreadable_line_of_the_career_survives_a_change_of_company() {
    let content = "---\ntype: crm-personne\nentreprise: '[[acme]]'\nparcours: ['une note à la main', '[[acme]] · 2026-03-01 →']\n---\n# A\n";
    let changed = with_company(content, None, day("2026-11-24"));
    assert_eq!(
        changed,
        "---\ntype: crm-personne\nparcours: ['une note à la main', '[[acme]] · 2026-03-01 → 2026-11-24']\n---\n# A\n"
    );
}

#[test]
fn only_the_last_open_passage_is_closed() {
    let content = "---\ntype: crm-personne\nentreprise: '[[b]]'\nparcours: ['[[a]] · 2025-01-01 →', '[[b]] · 2026-01-01 →']\n---\n# A\n";
    let changed = with_company(content, None, day("2026-11-24"));
    assert!(changed.contains("'[[a]] · 2025-01-01 →', '[[b]] · 2026-01-01 → 2026-11-24'"));
}

#[test]
fn a_person_without_open_passage_just_gets_the_new_one() {
    let content = "---\ntype: crm-personne\nentreprise: '[[acme]]'\n---\n# A\n";
    let changed = with_company(content, Some(&reference("globex")), day("2026-11-24"));
    assert_eq!(
        changed,
        "---\ntype: crm-personne\nentreprise: '[[globex]]'\nparcours: ['[[globex]] · 2026-11-24 →']\n---\n# A\n"
    );
}
