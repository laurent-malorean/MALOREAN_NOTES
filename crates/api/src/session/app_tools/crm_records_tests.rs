//! Les outils qui changent les personnes, les entreprises, les projets et les étapes d'un CRM,
//! joués par leur protocole sur des faux (fiche 0081) : chaque geste, ses refus dits à l'IA, le
//! nettoyage des fiches qui nomment une fiche supprimée.

use serde_json::{Value, json};

use super::crm_actions_tests::{done, failed, fiche};
use super::crm_reading_tests::{DEVIS_PATH, DEVIS_REF, clients};
use crate::session::Session;

const JEAN_PATH: &str = "clients/personnes/jean-dupont.md";
const MARIE_PATH: &str = "clients/personnes/marie-durand.md";
const ACME_PATH: &str = "clients/entreprises/acme.md";
const REFONTE_PATH: &str = "clients/projets/refonte.md";

/// L'outil `tool` appelé sur le CRM « Clients » avec ces arguments en plus.
fn call(session: &Session, tool: &str, arguments: Value) -> Value {
    let mut all = json!({ "path": "clients.md" });
    for (name, value) in arguments.as_object().unwrap() {
        all[name] = value.clone();
    }
    done(session, tool, all)
}

fn refuse(session: &Session, tool: &str, arguments: Value) -> String {
    let mut all = json!({ "path": "clients.md" });
    for (name, value) in arguments.as_object().unwrap() {
        all[name] = value.clone();
    }
    failed(session, tool, all)
}

/// Ce que `read_crm` rend de la partie `part` (`people`, `companies`, `projects`), la fiche `reference`.
fn read_fiche(session: &Session, part: &str, reference: &str) -> Value {
    let read = done(session, "read_crm", json!({ "path": "clients.md" }));
    read[part]
        .as_array()
        .unwrap()
        .iter()
        .find(|fiche| fiche["ref"] == reference)
        .cloned()
        .unwrap_or(Value::Null)
}

#[test]
fn a_person_is_created_in_nodata_without_a_company() {
    let session = clients();

    let result = call(
        &session,
        "create_crm_person",
        json!({ "name": "Paul Martin" }),
    );

    assert_eq!(
        result,
        json!({ "path": "clients.md", "ref": "paul-martin",
                "fiche": "clients/personnes/paul-martin.md" })
    );
    let paul = read_fiche(&session, "people", "paul-martin");
    assert_eq!(paul["name"], "Paul Martin");
    assert!(paul.get("company").is_none());
    let read = done(&session, "read_crm", json!({ "path": "clients.md" }));
    assert!(
        read["nodata"]["people"]
            .as_array()
            .unwrap()
            .contains(&json!("paul-martin"))
    );
}

#[test]
fn a_person_created_in_a_company_enters_it_today_and_the_career_says_so() {
    let session = clients();

    call(
        &session,
        "create_crm_person",
        json!({ "name": "Paul Martin", "company": "globex" }),
    );

    let paul = read_fiche(&session, "people", "paul-martin");
    assert_eq!(paul["company"], "globex");
    assert_eq!(
        paul["career"],
        json!([{ "company": "globex", "from": "2026-11-16" }])
    );
    assert_eq!(
        read_fiche(&session, "companies", "globex")["people"],
        json!(["paul-martin"])
    );
}

#[test]
fn a_person_with_a_refused_name_or_company_is_not_created() {
    let session = clients();

    let empty = refuse(&session, "create_crm_person", json!({ "name": "" }));
    let taken = refuse(
        &session,
        "create_crm_person",
        json!({ "name": "JEAN dupont" }),
    );
    let gone = refuse(
        &session,
        "create_crm_person",
        json!({ "name": "Paul", "company": "inconnue" }),
    );

    assert!(empty.contains("vide"), "{empty}");
    assert!(taken.contains("déjà"), "{taken}");
    assert!(gone.starts_with("Cette fiche n'existe plus."), "{gone}");
    assert_eq!(read_fiche(&session, "people", "paul"), Value::Null);
}

fn change_person(session: &Session, arguments: Value) -> Value {
    let mut all = json!({ "person": "jean-dupont" });
    for (name, value) in arguments.as_object().unwrap() {
        all[name] = value.clone();
    }
    call(session, "change_crm_person", all)
}

#[test]
fn a_person_is_renamed_and_keeps_her_reference_and_her_notes_are_replaced() {
    let session = clients();

    let renamed = change_person(
        &session,
        json!({ "operation": "rename", "name": "Jean Durand" }),
    );
    let noted = change_person(
        &session,
        json!({ "operation": "notes", "notes": "Nouveau texte." }),
    );

    assert_eq!(renamed["person"]["ref"], "jean-dupont");
    assert_eq!(renamed["person"]["name"], "Jean Durand");
    assert_eq!(noted["person"]["notes"], "Nouveau texte.");
    assert!(fiche(&session, JEAN_PATH).contains("# Jean Durand"));
}

#[test]
fn the_fields_of_a_person_are_set_and_removed_with_an_empty_value() {
    let session = clients();

    for (field, key) in [
        ("role", "role"),
        ("phone", "phone"),
        ("linkedin", "linkedin"),
    ] {
        let set = change_person(
            &session,
            json!({ "operation": "field", "field": field, "value": "valeur" }),
        );
        assert_eq!(set["person"][key], "valeur");
    }
    let removed = change_person(
        &session,
        json!({ "operation": "field", "field": "role", "value": "" }),
    );
    assert!(removed["person"].get("role").is_none());
    assert_eq!(removed["person"]["phone"], "valeur");
}

#[test]
fn an_email_that_belongs_to_another_person_is_kept_with_a_warning() {
    let session = clients();

    let own = change_person(
        &session,
        json!({ "operation": "field", "field": "email", "value": "jean@acme.fr" }),
    );
    let shared = call(
        &session,
        "change_crm_person",
        json!({ "person": "marie-durand", "operation": "field", "field": "email", "value": "jean@acme.fr" }),
    );

    assert!(own.get("warning").is_none());
    assert_eq!(shared["person"]["email"], "jean@acme.fr");
    assert!(
        shared["warning"]
            .as_str()
            .unwrap()
            .contains("déjà celui d'une autre personne")
    );
}

#[test]
fn a_person_changes_company_on_a_day_and_the_old_passage_is_closed() {
    let session = clients();

    let moved = change_person(
        &session,
        json!({ "operation": "company", "company": "globex", "day": "2026-11-20" }),
    );

    assert_eq!(moved["person"]["company"], "globex");
    assert_eq!(
        moved["person"]["career"],
        json!([{ "company": "acme", "from": "2026-03-01", "to": "2026-11-20" },
               { "company": "globex", "from": "2026-11-20" }])
    );
}

#[test]
fn a_change_of_company_without_a_day_is_today_and_without_a_company_goes_to_nodata() {
    let session = clients();

    let nodata = change_person(&session, json!({ "operation": "company", "company": "" }));

    assert!(nodata["person"].get("company").is_none());
    assert_eq!(nodata["person"]["career"][0]["to"], "2026-11-16");
}

#[test]
fn a_refused_change_of_a_person_says_why() {
    let session = clients();

    assert!(
        refuse(
            &session,
            "change_crm_person",
            json!({ "person": "jean-dupont", "operation": "rename", "name": "" })
        )
        .contains("vide")
    );
    assert!(
        refuse(
            &session,
            "change_crm_person",
            json!({ "person": "jean-dupont", "operation": "field", "field": "age", "value": "3" })
        )
        .contains("age")
    );
    assert!(
        refuse(&session, "change_crm_person", json!({ "person": "jean-dupont", "operation": "company", "company": "x", "day": "demain" }))
            .contains("demain")
    );
    assert!(
        refuse(
            &session,
            "change_crm_person",
            json!({ "person": "inconnue", "operation": "notes", "notes": "x" })
        )
        .starts_with("Cette fiche n'existe plus.")
    );
    assert!(
        refuse(
            &session,
            "change_crm_person",
            json!({ "person": "jean-dupont", "operation": "delete" })
        )
        .starts_with("« delete » n'est pas une opération de change_crm_person")
    );
}

#[test]
fn a_deleted_person_goes_to_the_trash_and_is_taken_out_of_her_actions() {
    let session = clients();
    assert!(fiche(&session, DEVIS_PATH).contains("[[jean-dupont]]"));

    let result = call(
        &session,
        "delete_crm_person",
        json!({ "person": "jean-dupont" }),
    );

    assert_eq!(
        result,
        json!({ "path": "clients.md", "deleted": "jean-dupont" })
    );
    assert!(session.read_note(JEAN_PATH).is_err());
    assert!(!fiche(&session, DEVIS_PATH).contains("jean-dupont"));
    assert!(fiche(&session, DEVIS_PATH).contains("[[marie-durand]]"));
    assert!(!session.list_trash().unwrap().notes.is_empty());
    assert!(
        refuse(
            &session,
            "delete_crm_person",
            json!({ "person": "jean-dupont" })
        )
        .starts_with("Cette fiche n'existe plus.")
    );
}

#[test]
fn a_company_is_created_changed_and_its_duplicates_refused() {
    let session = clients();

    let created = call(&session, "create_crm_company", json!({ "name": "Initech" }));
    let renamed = call(
        &session,
        "change_crm_company",
        json!({ "company": "initech", "operation": "rename", "name": "Initech SA" }),
    );
    let site = call(
        &session,
        "change_crm_company",
        json!({ "company": "initech", "operation": "field", "field": "site", "value": "https://initech.fr" }),
    );
    let sector = call(
        &session,
        "change_crm_company",
        json!({ "company": "initech", "operation": "field", "field": "sector", "value": "Logiciel" }),
    );
    let notes = call(
        &session,
        "change_crm_company",
        json!({ "company": "initech", "operation": "notes", "notes": "À rappeler." }),
    );

    assert_eq!(created["fiche"], "clients/entreprises/initech.md");
    assert_eq!(renamed["company"]["name"], "Initech SA");
    assert_eq!(site["company"]["site"], "https://initech.fr");
    assert_eq!(sector["company"]["sector"], "Logiciel");
    assert_eq!(notes["company"]["notes"], "À rappeler.");
    assert!(refuse(&session, "create_crm_company", json!({ "name": "ACME" })).contains("déjà"));
}

#[test]
fn the_address_and_the_phone_of_a_company_are_fields_and_an_unknown_field_is_refused() {
    let session = clients();

    let address = call(
        &session,
        "change_crm_company",
        json!({ "company": "acme", "operation": "field", "field": "address", "value": "12 rue des Lilas" }),
    );
    let phone = call(
        &session,
        "change_crm_company",
        json!({ "company": "acme", "operation": "field", "field": "phone", "value": "01 23" }),
    );
    let cleared = call(
        &session,
        "change_crm_company",
        json!({ "company": "acme", "operation": "field", "field": "site", "value": "" }),
    );

    assert_eq!(address["company"]["address"], "12 rue des Lilas");
    assert_eq!(phone["company"]["phone"], "01 23");
    assert!(cleared["company"].get("site").is_none());
    assert!(
        refuse(
            &session,
            "change_crm_company",
            json!({ "company": "acme", "operation": "field", "field": "taille", "value": "1" })
        )
        .contains("taille")
    );
}

#[test]
fn a_deleted_company_goes_to_the_trash_and_its_people_go_to_nodata() {
    let session = clients();

    let result = call(&session, "delete_crm_company", json!({ "company": "acme" }));

    assert_eq!(result, json!({ "path": "clients.md", "deleted": "acme" }));
    assert!(session.read_note(ACME_PATH).is_err());
    let jean = read_fiche(&session, "people", "jean-dupont");
    assert!(jean.get("company").is_none());
    assert_eq!(jean["career"][0]["to"], "2026-11-16");
    assert!(
        refuse(&session, "delete_crm_company", json!({ "company": "acme" }))
            .starts_with("Cette fiche n'existe plus.")
    );
}

#[test]
fn a_project_is_created_with_the_least_used_color_renamed_and_recolored() {
    let session = clients();

    let created = call(&session, "create_crm_project", json!({ "name": "Salon" }));
    let renamed = call(
        &session,
        "change_crm_project",
        json!({ "project": "salon", "operation": "rename", "name": "Salon 2027" }),
    );
    let colored = call(
        &session,
        "change_crm_project",
        json!({ "project": "salon", "operation": "color", "color": "vert" }),
    );

    assert_eq!(created["fiche"], "clients/projets/salon.md");
    assert_eq!(read_fiche(&session, "projects", "salon")["color"], "vert");
    assert_eq!(renamed["project"]["name"], "Salon 2027");
    assert_eq!(colored["project"]["color"], "vert");
}

#[test]
fn a_new_project_takes_the_first_color_nobody_uses() {
    let session = clients();

    call(&session, "create_crm_project", json!({ "name": "Salon" }));

    // Le projet existant est bleu : la première couleur de la palette, rouge, est la moins utilisée.
    assert_eq!(read_fiche(&session, "projects", "salon")["color"], "rouge");
}

#[test]
fn a_refused_change_of_a_project_says_why() {
    let session = clients();

    assert!(refuse(&session, "create_crm_project", json!({ "name": "refonte" })).contains("déjà"));
    assert!(
        refuse(
            &session,
            "change_crm_project",
            json!({ "project": "refonte", "operation": "color", "color": "pourpre" })
        )
        .contains("pourpre")
    );
    assert!(
        refuse(
            &session,
            "change_crm_project",
            json!({ "project": "refonte", "operation": "rename", "name": "" })
        )
        .contains("vide")
    );
    assert!(
        refuse(
            &session,
            "change_crm_project",
            json!({ "project": "inconnu", "operation": "rename", "name": "A" })
        )
        .starts_with("Cette fiche n'existe plus.")
    );
}

#[test]
fn a_deleted_project_goes_to_the_trash_and_its_actions_lose_it() {
    let session = clients();
    assert!(fiche(&session, DEVIS_PATH).contains("projet:"));

    let result = call(
        &session,
        "delete_crm_project",
        json!({ "project": "refonte" }),
    );

    assert_eq!(
        result,
        json!({ "path": "clients.md", "deleted": "refonte" })
    );
    assert!(session.read_note(REFONTE_PATH).is_err());
    assert!(!fiche(&session, DEVIS_PATH).contains("projet:"));
    let read = done(&session, "read_crm", json!({ "path": "clients.md" }));
    assert!(read["columns"][1]["actions"][0].get("project").is_none());
    assert!(
        refuse(
            &session,
            "delete_crm_project",
            json!({ "project": "refonte" })
        )
        .starts_with("Cette fiche n'existe plus.")
    );
}

fn stages(session: &Session, arguments: Value) -> Value {
    call(session, "change_crm_stages", arguments)["stages"].clone()
}

#[test]
fn a_stage_is_added_before_done_renamed_moved_and_removed() {
    let session = clients();

    assert_eq!(
        stages(&session, json!({ "operation": "add", "name": "Revue" })),
        json!(["Progress", "WaitingFor", "Revue"])
    );
    assert_eq!(
        stages(
            &session,
            json!({ "operation": "move", "name": "Revue", "index": 0 })
        ),
        json!(["Revue", "Progress", "WaitingFor"])
    );
    assert_eq!(
        stages(
            &session,
            json!({ "operation": "rename", "from": "Revue", "to": "Relecture" })
        ),
        json!(["Relecture", "Progress", "WaitingFor"])
    );
    assert_eq!(
        stages(
            &session,
            json!({ "operation": "remove", "name": "Relecture" })
        ),
        json!(["Progress", "WaitingFor"])
    );
    assert!(fiche(&session, "clients.md").contains("etapes: [Progress, WaitingFor]"));
}

#[test]
fn renaming_a_stage_moves_its_actions_and_removing_it_sends_them_back_to_todo() {
    let session = clients();

    stages(
        &session,
        json!({ "operation": "rename", "from": "Progress", "to": "En cours" }),
    );
    let renamed = fiche(&session, DEVIS_PATH);
    assert!(renamed.contains("statut: En cours") && renamed.contains("rang: 1"));
    stages(
        &session,
        json!({ "operation": "remove", "name": "En cours" }),
    );
    let removed = fiche(&session, DEVIS_PATH);
    assert!(removed.contains("statut: TODO") && !removed.contains("rang:"));
    let read = done(&session, "read_crm", json!({ "path": "clients.md" }));
    assert_eq!(read["columns"][0]["count"], 2);
}

#[test]
fn a_refused_change_of_stages_says_why_and_changes_nothing() {
    let session = clients();
    let long = "a".repeat(41);
    let before = fiche(&session, "clients.md");

    for (arguments, said) in [
        (
            json!({ "operation": "add", "name": "todo" }),
            "sont déjà des colonnes",
        ),
        (
            json!({ "operation": "add", "name": "progress" }),
            "Une autre étape porte déjà ce nom.",
        ),
        (
            json!({ "operation": "add", "name": "" }),
            "Le nom de l'étape est vide.",
        ),
        (
            json!({ "operation": "add", "name": long }),
            "40 caractères au plus",
        ),
        (
            json!({ "operation": "remove", "name": "Inconnue" }),
            "Cette étape n'existe pas.",
        ),
        (
            json!({ "operation": "move", "name": "Progress" }),
            "il manque « index »",
        ),
        (
            json!({ "operation": "fusionner" }),
            "n'est pas une opération de change_crm_stages",
        ),
    ] {
        let text = refuse(&session, "change_crm_stages", arguments);
        assert!(text.contains(said), "{text}");
    }
    assert_eq!(fiche(&session, "clients.md"), before);
    let _ = DEVIS_REF;
}

#[test]
fn a_change_of_a_person_keeps_the_text_before_as_a_version() {
    let session = clients();

    change_person(&session, json!({ "operation": "notes", "notes": "Autre." }));

    assert_eq!(session.list_versions(JEAN_PATH).unwrap().len(), 1);
    assert!(session.list_versions(MARIE_PATH).unwrap().is_empty());
}
