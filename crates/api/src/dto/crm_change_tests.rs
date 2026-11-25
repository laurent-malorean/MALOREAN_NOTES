use application::AppError;
use application::use_cases::{
    ActionChange, ActionDraft, CompanyChange, PersonChange, Placement, ProjectChange, StageChange,
};
use domain::crm::{
    BodyChange, Channel, Color, CompanyChoice, CompanyField, Day, Filters, PersonField, Reference,
};

use super::*;

fn reference(text: &str) -> Reference {
    Reference::to(text).unwrap()
}

fn s(text: &str) -> String {
    text.to_owned()
}

#[test]
fn the_filters_of_the_interface_become_the_filters_of_the_domain() {
    let item = CrmFiltersItem {
        search: s("devis"),
        person: Some(s("jean")),
        company: Some(CompanyChoiceItem::Company { name: s("acme") }),
        projects: vec![s("refonte")],
        tags: vec![s("urgent")],
    };
    assert_eq!(
        Filters::try_from(item).unwrap(),
        Filters {
            search: s("devis"),
            person: Some(reference("jean")),
            company: Some(CompanyChoice::Company(reference("acme"))),
            projects: vec![reference("refonte")],
            tags: vec![s("urgent")],
        }
    );
    let nodata = CrmFiltersItem {
        company: Some(CompanyChoiceItem::NoData),
        ..CrmFiltersItem::default()
    };
    assert_eq!(
        Filters::try_from(nodata).unwrap().company,
        Some(CompanyChoice::NoData)
    );
    assert_eq!(
        Filters::try_from(CrmFiltersItem::default()).unwrap(),
        Filters::default()
    );
}

#[test]
fn a_filter_that_is_not_a_reference_is_refused() {
    for item in [
        CrmFiltersItem {
            person: Some(s("[[x]]")),
            ..CrmFiltersItem::default()
        },
        CrmFiltersItem {
            projects: vec![s("")],
            ..CrmFiltersItem::default()
        },
        CrmFiltersItem {
            company: Some(CompanyChoiceItem::Company { name: s("a|b") }),
            ..CrmFiltersItem::default()
        },
    ] {
        assert!(matches!(
            Filters::try_from(item),
            Err(AppError::InvalidReference(_))
        ));
    }
}

#[test]
fn an_action_to_create_is_converted_whole() {
    let item = CrmActionDraftItem {
        title: s("Devis"),
        status: Some(s("Progress")),
        date: Some(s("2026-12-01")),
        people: vec![s("jean")],
        channel: Some(s("e-mail")),
        project: Some(s("refonte")),
        color: Some(s("violet")),
        tags: vec![s("urgent")],
        linked_notes: vec![s("Plan")],
        description: s("Texte"),
    };
    assert_eq!(
        ActionDraft::try_from(item).unwrap(),
        ActionDraft {
            title: s("Devis"),
            status: Some(s("Progress")),
            date: Some(Day::parse("2026-12-01").unwrap()),
            people: vec![reference("jean")],
            channel: Some(Channel::Email),
            project: Some(reference("refonte")),
            color: Color::parse("violet"),
            tags: vec![s("urgent")],
            linked_notes: vec![reference("Plan")],
            description: s("Texte"),
        }
    );
    assert_eq!(
        ActionDraft::try_from(CrmActionDraftItem::default()).unwrap(),
        ActionDraft::default()
    );
}

#[test]
fn an_action_to_create_with_a_wrong_value_is_refused_with_a_readable_message() {
    let refused = |item: CrmActionDraftItem| ActionDraft::try_from(item).unwrap_err().to_string();
    let base = CrmActionDraftItem::default;
    assert_eq!(
        refused(CrmActionDraftItem {
            date: Some(s("demain")),
            ..base()
        }),
        "jour invalide : « demain » (attendu : AAAA-MM-JJ)"
    );
    assert_eq!(
        refused(CrmActionDraftItem {
            color: Some(s("fuchsia")),
            ..base()
        }),
        "« fuchsia » n'est pas une couleur de la palette"
    );
    assert_eq!(
        refused(CrmActionDraftItem {
            channel: Some(s("pigeon")),
            ..base()
        }),
        "« pigeon » n'est pas un canal"
    );
    assert_eq!(
        refused(CrmActionDraftItem {
            people: vec![s("a|b")],
            ..base()
        }),
        "« a|b » n'est pas une référence valable"
    );
    assert_eq!(
        refused(CrmActionDraftItem {
            project: Some(s("")),
            ..base()
        }),
        "«  » n'est pas une référence valable"
    );
}

fn body(change: BodyChange) -> ActionChange {
    ActionChange::Body(change)
}

#[test]
fn each_gesture_on_the_checklists_of_an_action_becomes_its_change() {
    use BodyChangeItem as Item;
    let cases = [
        (
            Item::Description { text: s("t") },
            body(BodyChange::Description(s("t"))),
        ),
        (
            Item::AddChecklist { name: s("n") },
            body(BodyChange::AddChecklist(s("n"))),
        ),
        (
            Item::RenameChecklist {
                list: 1,
                name: s("n"),
            },
            body(BodyChange::RenameChecklist {
                list: 1,
                name: s("n"),
            }),
        ),
        (
            Item::RemoveChecklist { list: 2 },
            body(BodyChange::RemoveChecklist(2)),
        ),
        (
            Item::AddItem {
                list: 1,
                text: s("t"),
            },
            body(BodyChange::AddItem {
                list: 1,
                text: s("t"),
            }),
        ),
    ];
    for (item, expected) in cases {
        assert_eq!(ActionChange::from(item), expected);
    }
}

#[test]
fn each_gesture_on_the_items_of_an_action_becomes_its_change() {
    use BodyChangeItem as Item;
    let cases = [
        (
            Item::EditItem {
                list: 1,
                item: 2,
                text: s("t"),
            },
            body(BodyChange::EditItem {
                list: 1,
                item: 2,
                text: s("t"),
            }),
        ),
        (
            Item::CheckItem {
                list: 1,
                item: 2,
                done: true,
            },
            body(BodyChange::CheckItem {
                list: 1,
                item: 2,
                done: true,
            }),
        ),
        (
            Item::RemoveItem { list: 1, item: 2 },
            body(BodyChange::RemoveItem { list: 1, item: 2 }),
        ),
    ];
    for (item, expected) in cases {
        assert_eq!(ActionChange::from(item), expected);
    }
}

#[test]
fn each_gesture_on_the_comments_of_an_action_becomes_its_change() {
    use BodyChangeItem as Item;
    let cases = [
        (
            Item::AddComment { text: s("t") },
            ActionChange::AddComment(s("t")),
        ),
        (
            Item::EditComment {
                comment: 3,
                text: s("t"),
            },
            body(BodyChange::EditComment {
                comment: 3,
                text: s("t"),
            }),
        ),
        (
            Item::RemoveComment { comment: 3 },
            body(BodyChange::RemoveComment(3)),
        ),
    ];
    for (item, expected) in cases {
        assert_eq!(ActionChange::from(item), expected);
    }
}

#[test]
fn each_gesture_on_the_fields_of_an_action_becomes_its_change() {
    use CrmActionChangeItem as Item;
    let day = Day::parse("2026-12-01").unwrap();
    let cases = [
        (Item::Title { title: s("t") }, ActionChange::Title(s("t"))),
        (
            Item::Status { status: s("Done") },
            ActionChange::Status(s("Done")),
        ),
        (
            Item::Date {
                date: s("2026-12-01"),
            },
            ActionChange::Date(day),
        ),
        (
            Item::Channel {
                channel: Some(s("appel")),
            },
            ActionChange::Channel(Some(Channel::Call)),
        ),
        (Item::Channel { channel: None }, ActionChange::Channel(None)),
        (
            Item::Project {
                project: Some(s("p")),
            },
            ActionChange::Project(Some(reference("p"))),
        ),
        (Item::Project { project: None }, ActionChange::Project(None)),
        (
            Item::Color {
                color: Some(s("rose")),
            },
            ActionChange::Color(Color::parse("rose")),
        ),
        (Item::Color { color: None }, ActionChange::Color(None)),
    ];
    for (item, expected) in cases {
        assert_eq!(ActionChange::try_from(item).unwrap(), expected);
    }
}

#[test]
fn each_gesture_on_the_lists_and_people_of_an_action_becomes_its_change() {
    use CrmActionChangeItem as Item;
    let cases = [
        (
            Item::Tags { tags: vec![s("a")] },
            ActionChange::Tags(vec![s("a")]),
        ),
        (
            Item::LinkedNotes {
                notes: vec![s("Plan")],
            },
            ActionChange::LinkedNotes(vec![reference("Plan")]),
        ),
        (
            Item::AddPerson { person: s("jean") },
            ActionChange::AddPerson(reference("jean")),
        ),
        (
            Item::RemovePerson { person: s("jean") },
            ActionChange::RemovePerson(reference("jean")),
        ),
        (
            Item::Body {
                change: BodyChangeItem::AddComment { text: s("t") },
            },
            ActionChange::AddComment(s("t")),
        ),
    ];
    for (item, expected) in cases {
        assert_eq!(ActionChange::try_from(item).unwrap(), expected);
    }
}

#[test]
fn a_gesture_on_an_action_with_a_wrong_value_is_refused() {
    use CrmActionChangeItem as Item;
    let refused = |item: Item| ActionChange::try_from(item).unwrap_err();
    assert!(matches!(
        refused(Item::Date { date: s("x") }),
        AppError::CrmDay(_)
    ));
    assert!(matches!(
        refused(Item::Channel {
            channel: Some(s("x"))
        }),
        AppError::UnknownChannel(_)
    ));
    assert!(matches!(
        refused(Item::Color {
            color: Some(s("x"))
        }),
        AppError::UnknownColor(_)
    ));
    for item in [
        Item::Project {
            project: Some(s("")),
        },
        Item::LinkedNotes {
            notes: vec![s("[x]")],
        },
        Item::AddPerson { person: s("") },
        Item::RemovePerson { person: s("") },
    ] {
        assert!(matches!(refused(item), AppError::InvalidReference(_)));
    }
}

#[test]
fn a_card_is_dropped_nowhere_or_before_a_card() {
    assert_eq!(
        Placement::try_from(PlacementItem::Unplaced).unwrap(),
        Placement::Unplaced
    );
    assert_eq!(
        Placement::try_from(PlacementItem::Before { card: Some(s("a")) }).unwrap(),
        Placement::Before(Some(reference("a")))
    );
    assert_eq!(
        Placement::try_from(PlacementItem::Before { card: None }).unwrap(),
        Placement::Before(None)
    );
    assert!(Placement::try_from(PlacementItem::Before { card: Some(s("")) }).is_err());
}

#[test]
fn each_gesture_on_a_person_becomes_its_change() {
    use CrmPersonChangeItem as Item;
    let convert = |item: Item| PersonChange::try_from(item).unwrap();
    assert_eq!(
        convert(Item::Rename { name: s("n") }),
        PersonChange::Rename(s("n"))
    );
    assert_eq!(
        convert(Item::Notes { notes: s("n") }),
        PersonChange::Notes(s("n"))
    );
    for (name, field) in [
        ("role", PersonField::Role),
        ("email", PersonField::Email),
        ("phone", PersonField::Phone),
        ("linkedin", PersonField::LinkedIn),
    ] {
        assert_eq!(
            convert(Item::Field {
                field: s(name),
                value: s("v")
            }),
            PersonChange::Field(field, s("v"))
        );
    }
    let day = Day::parse("2026-11-20").unwrap();
    assert_eq!(
        convert(Item::Company {
            company: Some(s("acme")),
            day: s("2026-11-20")
        }),
        PersonChange::Company(Some(reference("acme")), day)
    );
    assert_eq!(
        convert(Item::Company {
            company: None,
            day: s("2026-11-20")
        }),
        PersonChange::Company(None, day)
    );
    assert!(
        PersonChange::try_from(Item::Field {
            field: s("fonction"),
            value: s("v")
        })
        .is_err()
    );
    assert!(
        PersonChange::try_from(Item::Company {
            company: None,
            day: s("x")
        })
        .is_err()
    );
    assert!(
        PersonChange::try_from(Item::Company {
            company: Some(s("")),
            day: s("2026-11-20")
        })
        .is_err()
    );
}

#[test]
fn each_gesture_on_a_company_a_project_or_the_stages_becomes_its_change() {
    use CrmCompanyChangeItem as Company;
    let company = |item: Company| CompanyChange::try_from(item).unwrap();
    assert_eq!(
        company(Company::Rename { name: s("n") }),
        CompanyChange::Rename(s("n"))
    );
    assert_eq!(
        company(Company::Notes { notes: s("n") }),
        CompanyChange::Notes(s("n"))
    );
    for (name, field) in [
        ("site", CompanyField::Site),
        ("sector", CompanyField::Sector),
        ("address", CompanyField::Address),
        ("phone", CompanyField::Phone),
    ] {
        assert_eq!(
            company(Company::Field {
                field: s(name),
                value: s("v")
            }),
            CompanyChange::Field(field, s("v"))
        );
    }
    assert!(
        CompanyChange::try_from(Company::Field {
            field: s("secteur"),
            value: s("v")
        })
        .is_err()
    );
}

#[test]
fn each_gesture_on_a_project_or_the_stages_becomes_its_change() {
    assert_eq!(
        ProjectChange::try_from(CrmProjectChangeItem::Rename { name: s("n") }).unwrap(),
        ProjectChange::Rename(s("n"))
    );
    assert_eq!(
        ProjectChange::try_from(CrmProjectChangeItem::Color { color: s("bleu") }).unwrap(),
        ProjectChange::Color(Color::parse("bleu").unwrap())
    );
    assert!(ProjectChange::try_from(CrmProjectChangeItem::Color { color: s("x") }).is_err());
    assert_eq!(
        ProjectChange::try_from(CrmProjectChangeItem::Tags {
            tags: vec![s("a"), s("b")]
        })
        .unwrap(),
        ProjectChange::Tags(vec![s("a"), s("b")])
    );
    assert_eq!(
        StageChange::from(StageChangeItem::Add { name: s("n") }),
        StageChange::Add(s("n"))
    );
    assert_eq!(
        StageChange::from(StageChangeItem::Rename {
            from: s("a"),
            to: s("b")
        }),
        StageChange::Rename {
            from: s("a"),
            to: s("b")
        }
    );
    assert_eq!(
        StageChange::from(StageChangeItem::Remove { name: s("n") }),
        StageChange::Remove(s("n"))
    );
    assert_eq!(
        StageChange::from(StageChangeItem::Move {
            name: s("n"),
            to: 2
        }),
        StageChange::Move {
            name: s("n"),
            to: 2
        }
    );
}
