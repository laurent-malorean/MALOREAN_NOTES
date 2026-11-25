use domain::crm::{CompanyField, NameError};

use super::*;
use crate::testing::{FixedClock, InMemoryNoteStore};
use crate::use_cases::crm::fixture::*;
use crate::{MemoryPendingGestures, NoteStore, PendingGestures};

const ACME_PATH: &str = "clients/entreprises/acme.md";
const JEAN_PATH: &str = "clients/personnes/jean-dupont.md";

fn change(store: &InMemoryNoteStore, company: &str, change: CompanyChange) -> Result<(), AppError> {
    ChangeCompany::new(store).execute(&crm(), &reference(company), change)
}

#[test]
fn a_company_is_created_under_its_name_and_the_first_one_creates_its_folder() {
    let store = InMemoryNoteStore::with_notes(&[("c.md", "---\ntype: crm\n---\n# C\n")]);
    let created = CreateCompany::new(&store)
        .execute(&path("c.md"), "  Acme  Corp ")
        .unwrap();
    assert_eq!(created.as_str(), "acme-corp");
    assert_eq!(
        text(&store, "c/entreprises/acme-corp.md"),
        "---\ntype: crm-entreprise\n---\n# Acme  Corp\n"
    );
    let folders: Vec<String> = store
        .folders()
        .unwrap()
        .iter()
        .map(|f| f.to_path())
        .collect();
    assert_eq!(folders, ["c", "c/entreprises"]);
}

#[test]
fn two_companies_never_share_a_name_but_may_share_a_file_name() {
    let store = workspace();
    let create = |name: &str| CreateCompany::new(&store).execute(&crm(), name);
    assert_eq!(create("ACME"), Err(AppError::CrmName(NameError::Taken)));
    assert_eq!(create("Acme!"), Err(AppError::CrmName(NameError::Taken)));
    assert_eq!(create(""), Err(AppError::CrmName(NameError::Empty)));
    assert_eq!(create("Acme 2").unwrap().as_str(), "acme-2");
    assert_eq!(create("Acme-2").unwrap().as_str(), "acme-2-2");
}

#[test]
fn a_company_is_renamed_keeps_its_file_name_and_its_other_fields_change_alone() {
    let store = workspace();
    change(
        &store,
        "acme",
        CompanyChange::Rename("Acme France".to_owned()),
    )
    .unwrap();
    assert_eq!(
        text(&store, ACME_PATH),
        ACME.replace("# Acme", "# Acme France")
    );
    assert_eq!(
        change(&store, "acme", CompanyChange::Rename("globex".to_owned())),
        Err(AppError::CrmName(NameError::Taken))
    );
    change(
        &store,
        "acme",
        CompanyChange::Field(CompanyField::Sector, "Industrie".to_owned()),
    )
    .unwrap();
    assert!(text(&store, ACME_PATH).contains("secteur: Industrie\n"));
    change(
        &store,
        "acme",
        CompanyChange::Field(CompanyField::Site, String::new()),
    )
    .unwrap();
    assert!(!text(&store, ACME_PATH).contains("site:"));
    change(
        &store,
        "acme",
        CompanyChange::Notes("Autres notes.".to_owned()),
    )
    .unwrap();
    assert!(text(&store, ACME_PATH).ends_with("# Acme France\n\nAutres notes.\n"));
    assert_eq!(
        change(&store, "absente", CompanyChange::Notes(String::new())),
        Err(AppError::FicheGone)
    );
}

#[test]
fn a_deleted_company_goes_to_the_trash_and_its_people_go_to_nodata_with_their_career_closed_today()
{
    let store = workspace();
    let pending = MemoryPendingGestures::default();
    DeleteCompany::new(&store, &pending, &FixedClock::default())
        .execute(&crm(), &reference("acme"))
        .unwrap();
    assert!(store.read(&path(ACME_PATH)).is_err());
    assert_eq!(store.trash().unwrap().notes.len(), 1);
    assert_eq!(
        text(&store, JEAN_PATH),
        JEAN.replace("entreprise: '[[acme]]'\n", "").replace(
            "'[[acme]] · 2026-03-01 →'",
            "'[[acme]] · 2026-03-01 → 2026-11-16'"
        )
    );
    assert_eq!(text(&store, "clients/personnes/marie-durand.md"), MARIE);
    assert_eq!(text(&store, DEVIS_PATH), DEVIS);
    assert!(pending.interrupted().unwrap().is_empty());
}

#[test]
fn a_company_without_people_is_only_trashed_and_one_that_is_gone_is_refused() {
    let store = workspace();
    let pending = MemoryPendingGestures::default();
    let delete = |name: &str| {
        DeleteCompany::new(&store, &pending, &FixedClock::default())
            .execute(&crm(), &reference(name))
    };
    delete("globex").unwrap();
    assert!(store.read(&path("clients/entreprises/globex.md")).is_err());
    assert_eq!(delete("globex"), Err(AppError::FicheGone));
    assert_eq!(text(&store, JEAN_PATH), JEAN);
    assert!(pending.interrupted().unwrap().is_empty());
}
