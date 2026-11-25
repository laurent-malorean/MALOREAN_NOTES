use super::*;
use crate::crm::Stages;

fn reference(target: &str) -> Reference {
    Reference::to(target).unwrap()
}

fn action(yaml: &str, text: &str) -> Action {
    let content = format!("---\ntype: crm-action\n{yaml}---\n# Demande de devis\n{text}");
    Action::parse(reference("a"), &content, &Stages::default()).unwrap()
}

fn plain() -> Action {
    action("", "")
}

#[test]
fn no_filter_lets_everything_pass() {
    let filters = Filters::default();
    assert!(filters.is_empty());
    assert!(filters.matches(&plain()));
}

#[test]
fn a_blank_search_is_no_filter() {
    let filters = Filters {
        search: "  ".to_owned(),
        ..Filters::default()
    };
    assert!(filters.is_empty());
}

#[test]
fn any_filter_makes_the_filters_not_empty() {
    let with = |filters: Filters| !filters.is_empty();
    assert!(with(Filters {
        search: "a".to_owned(),
        ..Filters::default()
    }));
    assert!(with(Filters {
        person: Some(reference("p")),
        ..Filters::default()
    }));
    assert!(with(Filters {
        company: Some(CompanyChoice::NoData),
        ..Filters::default()
    }));
    assert!(with(Filters {
        projects: vec![reference("p")],
        ..Filters::default()
    }));
    assert!(with(Filters {
        tags: vec!["a".to_owned()],
        ..Filters::default()
    }));
}

#[test]
fn the_search_looks_in_the_title_the_description_and_the_comments() {
    let a = action(
        "",
        "\nUn plan de Salle.\n\n#### Commentaires\n- 2026-11-24 10:32 · Rappelé Jeudi\n",
    );
    let found = |search: &str| {
        Filters {
            search: search.to_owned(),
            ..Filters::default()
        }
        .matches(&a)
    };
    assert!(found("DEVIS"));
    assert!(found("salle"));
    assert!(found("rappele jeudi"));
    assert!(found(" plan "));
    assert!(!found("facture"));
}

#[test]
fn the_search_ignores_what_is_not_the_title_the_description_or_the_comments() {
    let a = action(
        "tags: [urgent]\nprojet: '[[refonte]]'\n",
        "\n#### Liste à cocher : Courses\n- [ ] pain\n",
    );
    let found = |search: &str| {
        Filters {
            search: search.to_owned(),
            ..Filters::default()
        }
        .matches(&a)
    };
    assert!(!found("urgent"));
    assert!(!found("refonte"));
    assert!(!found("pain"));
}

#[test]
fn a_person_filter_keeps_the_actions_with_at_least_that_person() {
    let a = action("personnes: ['[[jean]] · [[acme]]', '[[marie]]']\n", "");
    let by = |person: &str| Filters {
        person: Some(reference(person)),
        ..Filters::default()
    };
    assert!(by("jean").matches(&a));
    assert!(by("marie").matches(&a));
    assert!(!by("paul").matches(&a));
    assert!(!by("jean").matches(&plain()));
}

#[test]
fn a_company_filter_keeps_the_actions_with_at_least_that_company() {
    let a = action("personnes: ['[[jean]] · [[acme]]', '[[marie]]']\n", "");
    let by = |company: CompanyChoice| Filters {
        company: Some(company),
        ..Filters::default()
    };
    assert!(by(CompanyChoice::Company(reference("acme"))).matches(&a));
    assert!(by(CompanyChoice::NoData).matches(&a));
    assert!(!by(CompanyChoice::Company(reference("globex"))).matches(&a));
}

#[test]
fn an_action_without_person_is_in_nodata_for_the_company_filter() {
    let by = |company: CompanyChoice| Filters {
        company: Some(company),
        ..Filters::default()
    };
    assert!(by(CompanyChoice::NoData).matches(&plain()));
    assert!(!by(CompanyChoice::Company(reference("acme"))).matches(&plain()));
    let in_acme = action("personnes: ['[[jean]] · [[acme]]']\n", "");
    assert!(!by(CompanyChoice::NoData).matches(&in_acme));
}

#[test]
fn project_filters_add_up_and_hide_the_actions_without_project() {
    let a = action("projet: '[[refonte]]'\n", "");
    let by = |projects: &[&str]| Filters {
        projects: projects.iter().map(|p| reference(p)).collect(),
        ..Filters::default()
    };
    assert!(by(&["refonte"]).matches(&a));
    assert!(by(&["autre", "refonte"]).matches(&a));
    assert!(!by(&["autre"]).matches(&a));
    assert!(!by(&["refonte"]).matches(&plain()));
}

#[test]
fn tag_filters_keep_the_actions_with_at_least_one_checked_tag() {
    let a = action("tags: [Urgent, salon]\n", "");
    let by = |tags: &[&str]| Filters {
        tags: tags.iter().map(|t| (*t).to_owned()).collect(),
        ..Filters::default()
    };
    assert!(by(&["urgent"]).matches(&a));
    assert!(by(&["autre", "SALON"]).matches(&a));
    assert!(!by(&["autre"]).matches(&a));
    assert!(!by(&["urgent"]).matches(&plain()));
}

#[test]
fn every_filter_must_be_met() {
    let a = action(
        "personnes: ['[[jean]]']\nprojet: '[[refonte]]'\ntags: [urgent]\n",
        "",
    );
    let all = Filters {
        search: "devis".to_owned(),
        person: Some(reference("jean")),
        company: Some(CompanyChoice::NoData),
        projects: vec![reference("refonte")],
        tags: vec!["urgent".to_owned()],
    };
    assert!(all.matches(&a));
    assert!(
        !Filters {
            search: "facture".to_owned(),
            ..all.clone()
        }
        .matches(&a)
    );
    assert!(
        !Filters {
            person: Some(reference("paul")),
            ..all.clone()
        }
        .matches(&a)
    );
    assert!(
        !Filters {
            company: Some(CompanyChoice::Company(reference("acme"))),
            ..all.clone()
        }
        .matches(&a)
    );
    assert!(
        !Filters {
            projects: vec![reference("autre")],
            ..all.clone()
        }
        .matches(&a)
    );
    assert!(
        !Filters {
            tags: vec!["autre".to_owned()],
            ..all
        }
        .matches(&a)
    );
}

#[test]
fn the_tags_of_a_crm_have_no_duplicate_and_are_in_alphabetical_order() {
    let actions = [
        action("tags: [salon, Urgent]\n", ""),
        action("tags: [urgent, Éclair, a]\n", ""),
        plain(),
    ];
    assert_eq!(crm_tags(&actions), ["a", "Éclair", "salon", "Urgent"]);
    assert_eq!(crm_tags(&[]), Vec::<String>::new());
}
