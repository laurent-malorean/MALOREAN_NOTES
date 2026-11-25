use super::*;

fn name(text: &str) -> Name {
    Name::parse(text).unwrap()
}

#[test]
fn a_name_is_one_line_and_never_empty() {
    assert_eq!(name("  Jean Dupont ").as_str(), "Jean Dupont");
    assert_eq!(Name::parse(""), Err(NameError::Empty));
    assert_eq!(Name::parse("  \t "), Err(NameError::Empty));
    assert_eq!(Name::parse("a\nb"), Err(NameError::NotOneLine));
    assert_eq!(Name::parse("a\rb"), Err(NameError::NotOneLine));
}

#[test]
fn a_refused_name_says_why() {
    assert_eq!(NameError::Empty.to_string(), "Le nom est vide.");
    assert_eq!(
        NameError::NotOneLine.to_string(),
        "Le nom tient sur une seule ligne."
    );
    assert_eq!(
        NameError::Taken.to_string(),
        "Une autre fiche porte déjà ce nom."
    );
}

#[test]
fn a_name_is_taken_when_equal_without_case_accents_and_punctuation() {
    let others = ["Acme", "Société Générale", "L'Atelier"];
    assert_eq!(Name::unique("Globex", others), Ok(name("Globex")));
    assert_eq!(Name::unique("ACME", others), Err(NameError::Taken));
    assert_eq!(Name::unique("acme.", others), Err(NameError::Taken));
    assert_eq!(
        Name::unique("societe generale", others),
        Err(NameError::Taken)
    );
    assert_eq!(Name::unique("Latelier", others), Err(NameError::Taken));
    assert_eq!(Name::unique("Acme Corp", others), Ok(name("Acme Corp")));
}

#[test]
fn a_name_is_checked_for_its_form_before_its_uniqueness() {
    assert_eq!(Name::unique(" ", ["Acme"]), Err(NameError::Empty));
    assert_eq!(Name::unique("a\nb", ["a b"]), Err(NameError::NotOneLine));
    assert_eq!(Name::unique("Acme", []), Ok(name("Acme")));
}

#[test]
fn a_renamed_fiche_changes_only_its_title() {
    let content = "---\ntype: crm-projet\ncouleur: bleu\n---\n# Refonte\n\nNotes.\n";
    assert_eq!(
        with_name(content, &name(" Nouvelle  refonte ")),
        "---\ntype: crm-projet\ncouleur: bleu\n---\n# Nouvelle  refonte\n\nNotes.\n"
    );
}

#[test]
fn the_file_name_of_a_company_a_person_or_a_project_is_its_name_in_kebab_case() {
    let free = |_: &FileName| false;
    assert_eq!(file_name_of(&name("Acme"), free).as_str(), "acme.md");
    assert_eq!(
        file_name_of(&name("Jean Dupont"), free).as_str(),
        "jean-dupont.md"
    );
    assert_eq!(
        file_name_of(&name("Société Générale"), free).as_str(),
        "societe-generale.md"
    );
}

#[test]
fn a_taken_file_name_gets_a_number() {
    let taken = |file: &FileName| ["acme.md", "acme-2.md"].contains(&file.as_str());
    assert_eq!(file_name_of(&name("Acme"), taken).as_str(), "acme-3.md");
}

#[test]
fn the_file_name_of_an_action_starts_with_the_day_of_its_creation() {
    let day = Day::parse("2026-11-24").unwrap();
    let free = |_: &FileName| false;
    assert_eq!(
        action_file_name(day, &name("Demande de devis"), free).as_str(),
        "2026-11-24-demande-de-devis.md"
    );
    let taken = |file: &FileName| file.as_str() == "2026-11-24-demande-de-devis.md";
    assert_eq!(
        action_file_name(day, &name("Demande de devis"), taken).as_str(),
        "2026-11-24-demande-de-devis-2.md"
    );
}

#[test]
fn a_known_email_of_another_person_is_a_risk_of_duplicate() {
    let others = ["jean.dupont@acme.fr", "marie@globex.com"];
    assert!(email_is_known("Jean.Dupont@Acme.fr ", others));
    assert!(email_is_known("marie@globex.com", others));
    assert!(!email_is_known("autre@acme.fr", others));
    assert!(!email_is_known("", [""]));
    assert!(!email_is_known("  ", ["  "]));
    assert!(!email_is_known("a@b.c", []));
}
