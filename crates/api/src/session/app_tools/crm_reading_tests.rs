//! L'outil `read_crm`, joué par son protocole sur des faux (fiche 0081) : un CRM en données, ses
//! filtres, sa taille bornée, ses refus. L'horloge est arrêtée le lundi 16 novembre 2026.

use serde_json::{Value, json};

use super::tests::{found, notes_workspace, opened, refused};
use super::workspaces_tests::world;
use crate::session::Session;

pub(super) const CRM: &str =
    "---\ntype: crm\netapes: [Progress, WaitingFor]\ntags: [b2b]\n---\n# Clients\n";
pub(super) const ACME: &str = "---\ntype: crm-entreprise\nsite: https://acme.fr\nsecteur: Industrie\n---\n# Acme\n\nClient historique.\n";
pub(super) const GLOBEX: &str = "---\ntype: crm-entreprise\n---\n# Globex\n";
pub(super) const JEAN: &str = "---\ntype: crm-personne\nfonction: Responsable maintenance\nentreprise: '[[acme]]'\nparcours: ['[[acme]] · 2026-03-01 →']\nemail: jean@acme.fr\ntags: [salon]\n---\n# Jean Dupont\n\nRencontré au salon.\n";
pub(super) const MARIE: &str = "---\ntype: crm-personne\n---\n# Marie Durand\n";
pub(super) const REFONTE: &str =
    "---\ntype: crm-projet\ncouleur: bleu\ntags: [web]\n---\n# Refonte\n";
pub(super) const DEVIS: &str = "---\ntype: crm-action\npersonnes: ['[[jean-dupont]] · [[acme]]', '[[marie-durand]]']\nstatut: Progress\ndate: '2026-11-10'\ncanal: e-mail\nprojet: '[[refonte]]'\ncouleur: violet\nrang: 1\ntags: [urgent]\nnotes: ['[[Plan]]']\n---\n# Demande de devis\n\nPour 3 postes.\n\n#### Liste à cocher : Préparation\n- [x] Relire la demande\n- [ ] Chiffrer\n\n#### Commentaires\n- 2026-11-12 10:32 · Rappelé, pas de réponse.\n  Retenter jeudi.\n";
pub(super) const APPEL: &str =
    "---\ntype: crm-action\npersonnes: ['[[marie-durand]]']\ndate: '2026-11-16'\n---\n# Appel\n";
pub(super) const FAIT: &str =
    "---\ntype: crm-action\nstatut: Done\ndate: '2026-11-01'\n---\n# Fait\n";

pub(super) const DEVIS_PATH: &str = "clients/actions/2026-11-10-demande-de-devis.md";
pub(super) const APPEL_PATH: &str = "clients/actions/2026-11-12-appel.md";
pub(super) const FAIT_PATH: &str = "clients/actions/2026-11-01-fait.md";
pub(super) const DEVIS_REF: &str = "2026-11-10-demande-de-devis";
pub(super) const APPEL_REF: &str = "2026-11-12-appel";
pub(super) const FAIT_REF: &str = "2026-11-01-fait";

/// Le CRM « Clients » : deux entreprises, deux personnes (Jean chez Acme, Marie dans NODATA), un
/// projet, trois actions (une en retard, une du jour, une faite) et une note qui n'en fait pas
/// partie.
pub(super) const CLIENTS: [(&str, &str); 10] = [
    ("clients.md", CRM),
    ("clients/entreprises/acme.md", ACME),
    ("clients/entreprises/globex.md", GLOBEX),
    ("clients/personnes/jean-dupont.md", JEAN),
    ("clients/personnes/marie-durand.md", MARIE),
    ("clients/projets/refonte.md", REFONTE),
    (DEVIS_PATH, DEVIS),
    (APPEL_PATH, APPEL),
    (FAIT_PATH, FAIT),
    ("plan.md", "# Plan"),
];

pub(super) fn clients() -> Session {
    opened(&CLIENTS)
}

fn read_with(session: &Session, arguments: Value) -> Value {
    let tools = session.open_tools(notes_workspace()).unwrap();
    found(session, tools.key().as_str(), "read_crm", arguments)
}

fn read(session: &Session) -> Value {
    read_with(session, json!({ "path": "clients.md" }))
}

fn unread(session: &Session, arguments: Value) -> String {
    let tools = session.open_tools(notes_workspace()).unwrap();
    refused(session, tools.key().as_str(), "read_crm", arguments)
}

fn column<'a>(read: &'a Value, status: &str) -> &'a Value {
    read["columns"]
        .as_array()
        .unwrap()
        .iter()
        .find(|column| column["status"] == status)
        .unwrap()
}

fn refs(column: &Value) -> Vec<&str> {
    column["actions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|action| action["ref"].as_str().unwrap())
        .collect()
}

#[test]
fn a_crm_is_read_with_its_title_its_day_its_stages_and_the_tags_of_its_actions() {
    let read = read(&clients());

    assert_eq!(read["path"], "clients.md");
    assert_eq!(read["title"], "Clients");
    assert_eq!(read["today"], "2026-11-16");
    assert_eq!(read["stages"], json!(["Progress", "WaitingFor"]));
    assert_eq!(read["tags"], json!(["urgent"]));
    assert_eq!(read["truncated"], false);
    assert!(read.get("message").is_none());
    assert!(read.get("unreadable").is_none());
}

#[test]
fn a_crm_has_one_column_per_status_in_order_and_its_nodata() {
    let read = read(&clients());

    let statuses: Vec<&str> = read["columns"]
        .as_array()
        .unwrap()
        .iter()
        .map(|column| column["status"].as_str().unwrap())
        .collect();
    assert_eq!(
        statuses,
        ["TODO", "Progress", "WaitingFor", "Done", "Cancel"]
    );
    assert_eq!(
        read["nodata"],
        json!({ "people": ["marie-durand"], "tally": { "open": 2, "late": 1, "today": 1 } })
    );
}

#[test]
fn an_open_column_gives_its_counts_and_its_actions_in_the_order_of_the_screen() {
    let read = read(&clients());

    let todo = column(&read, "TODO");
    assert_eq!(todo["closed"], false);
    assert_eq!(
        (todo["count"].clone(), todo["late"].clone()),
        (json!(1), json!(0))
    );
    assert_eq!(refs(todo), [APPEL_REF]);
    let progress = column(&read, "Progress");
    assert_eq!(
        (progress["count"].clone(), progress["late"].clone()),
        (json!(1), json!(1))
    );
    assert_eq!(refs(progress), [DEVIS_REF]);
    let waiting = column(&read, "WaitingFor");
    assert_eq!(waiting["count"], 0);
    assert_eq!(waiting["actions"], json!([]));
}

#[test]
fn a_closed_column_says_so() {
    let read = read(&clients());

    let done = column(&read, "Done");
    assert_eq!(done["closed"], true);
    assert_eq!(refs(done), [FAIT_REF]);
    assert_eq!(column(&read, "Cancel")["closed"], true);
}

#[test]
fn an_action_is_read_with_everything_the_window_of_an_action_shows() {
    let read = read(&clients());

    let devis = &column(&read, "Progress")["actions"][0];
    assert_eq!(
        *devis,
        json!({
            "ref": DEVIS_REF,
            "fiche": DEVIS_PATH,
            "title": "Demande de devis",
            "status": "Progress",
            "date": "2026-11-10",
            "late_days": 6,
            "people": [{ "ref": "jean-dupont", "company": "acme" }, { "ref": "marie-durand" }],
            "project": "refonte",
            "channel": "e-mail",
            "color": "violet",
            "tags": ["urgent"],
            "linked_notes": ["Plan"],
            "description": "Pour 3 postes.",
            "checklists": [{ "index": 0, "name": "Préparation", "items": [
                { "index": 0, "done": true, "text": "Relire la demande" },
                { "index": 1, "done": false, "text": "Chiffrer" } ] }],
            "comments": [{ "index": 0, "at": "2026-11-12 10:32",
                           "text": "Rappelé, pas de réponse.\nRetenter jeudi." }]
        })
    );
    // Le rang n'est jamais rendu : l'IA n'y touche pas.
    assert!(!devis.to_string().contains("rank"));
    assert!(!devis.to_string().contains("rang"));
}

#[test]
fn an_action_of_today_says_so_and_an_empty_one_says_only_what_it_has() {
    let read = read(&clients());

    let appel = &column(&read, "TODO")["actions"][0];
    assert_eq!(
        *appel,
        json!({
            "ref": APPEL_REF,
            "fiche": APPEL_PATH,
            "title": "Appel",
            "status": "TODO",
            "date": "2026-11-16",
            "due_today": true,
            "people": [{ "ref": "marie-durand" }]
        })
    );
    let fait = &column(&read, "Done")["actions"][0];
    assert!(fait.get("due_today").is_none() && fait.get("late_days").is_none());
}

#[test]
fn people_companies_and_projects_are_read_with_their_fields_and_their_tallies() {
    let read = read(&clients());

    assert_eq!(
        read["people"],
        json!([
            { "ref": "jean-dupont", "fiche": "clients/personnes/jean-dupont.md",
              "name": "Jean Dupont", "role": "Responsable maintenance", "company": "acme",
              "career": [{ "company": "acme", "from": "2026-03-01" }],
              "email": "jean@acme.fr", "notes": "Rencontré au salon.",
              "tally": { "open": 1, "late": 1, "today": 0 } },
            { "ref": "marie-durand", "fiche": "clients/personnes/marie-durand.md",
              "name": "Marie Durand", "tally": { "open": 2, "late": 1, "today": 1 } }
        ])
    );
    assert_eq!(
        read["companies"],
        json!([
            { "ref": "acme", "fiche": "clients/entreprises/acme.md", "name": "Acme",
              "site": "https://acme.fr", "sector": "Industrie", "notes": "Client historique.",
              "people": ["jean-dupont"], "tally": { "open": 1, "late": 1, "today": 0 } },
            { "ref": "globex", "fiche": "clients/entreprises/globex.md", "name": "Globex",
              "people": [], "tally": { "open": 0, "late": 0, "today": 0 } }
        ])
    );
    assert_eq!(
        read["projects"],
        json!([{ "ref": "refonte", "fiche": "clients/projets/refonte.md", "name": "Refonte",
                 "color": "bleu", "tags": ["web"],
                 "tally": { "open": 1, "late": 1, "today": 0 } }])
    );
}

/// Les références des actions de la colonne `status` d'une lecture avec ces filtres.
fn filtered(session: &Session, status: &str, filters: Value) -> Vec<String> {
    let mut arguments = json!({ "path": "clients.md" });
    for (name, value) in filters.as_object().unwrap() {
        arguments[name] = value.clone();
    }
    let read = read_with(session, arguments);
    refs(column(&read, status))
        .into_iter()
        .map(str::to_owned)
        .collect()
}

#[test]
fn the_person_and_company_filters_keep_the_actions_of_their_people() {
    let session = clients();

    assert_eq!(
        filtered(&session, "Progress", json!({ "person": "jean-dupont" })),
        [DEVIS_REF]
    );
    assert!(filtered(&session, "TODO", json!({ "person": "jean-dupont" })).is_empty());
    assert_eq!(
        filtered(&session, "Progress", json!({ "company": "acme" })),
        [DEVIS_REF]
    );
    assert!(filtered(&session, "TODO", json!({ "company": "acme" })).is_empty());
    assert_eq!(
        filtered(&session, "TODO", json!({ "company": "NODATA" })),
        [APPEL_REF]
    );
}

#[test]
fn the_search_project_and_tag_filters_keep_the_actions_that_answer() {
    let session = clients();

    assert_eq!(
        filtered(&session, "Progress", json!({ "search": "POSTES" })),
        [DEVIS_REF]
    );
    assert!(filtered(&session, "TODO", json!({ "search": "POSTES" })).is_empty());
    assert_eq!(
        filtered(&session, "Progress", json!({ "projects": ["refonte"] })),
        [DEVIS_REF]
    );
    assert!(filtered(&session, "TODO", json!({ "projects": ["refonte"] })).is_empty());
    assert_eq!(
        filtered(&session, "Progress", json!({ "tags": ["urgent"] })),
        [DEVIS_REF]
    );
    assert!(filtered(&session, "Done", json!({ "tags": ["urgent"] })).is_empty());
}

#[test]
fn filters_add_up_and_leave_the_counts_and_the_other_lists_alone() {
    let session = clients();

    let both = json!({ "person": "marie-durand", "tags": ["urgent"] });
    assert_eq!(filtered(&session, "Progress", both), [DEVIS_REF]);
    let none = json!({ "person": "jean-dupont", "search": "introuvable" });
    assert!(filtered(&session, "Progress", none).is_empty());
    let read = read_with(
        &session,
        json!({ "path": "clients.md", "person": "jean-dupont" }),
    );
    // Les nombres des en-têtes et les autres listes ne changent pas avec un filtre.
    assert_eq!(column(&read, "TODO")["count"], 1);
    assert_eq!(read["people"].as_array().unwrap().len(), 2);
}

#[test]
fn a_filter_with_a_bad_reference_or_a_bad_list_is_refused() {
    let session = clients();

    assert!(
        unread(&session, json!({ "path": "clients.md", "person": "[pas]" }))
            .contains("n'est pas une référence valable")
    );
    assert_eq!(
        unread(
            &session,
            json!({ "path": "clients.md", "projects": "refonte" })
        ),
        "« projects » est une liste de textes"
    );
    assert_eq!(
        unread(&session, json!({ "path": "clients.md", "tags": [1] })),
        "« tags » est une liste de textes"
    );
}

#[test]
fn reading_a_crm_writes_nothing_and_keeps_no_version() {
    let session = clients();

    read(&session);

    assert_eq!(session.read_note(DEVIS_PATH).unwrap().content, DEVIS);
    assert!(session.list_versions(DEVIS_PATH).unwrap().is_empty());
}

#[test]
fn a_note_a_missing_crm_and_a_missing_path_are_refused() {
    let session = clients();

    assert_eq!(
        unread(&session, json!({ "path": "plan.md" })),
        "cette note n'est pas un CRM"
    );
    assert!(unread(&session, json!({ "path": "absent.md" })).contains("absent.md"));
    assert_eq!(unread(&session, json!({})), "il manque « path »");
}

#[test]
fn an_unreadable_fiche_is_named_and_left_aside() {
    let session = opened(&[
        ("clients.md", CRM),
        (
            "clients/personnes/sans-titre.md",
            "---\ntype: crm-personne\n---\nsans titre",
        ),
        ("clients/personnes/marie-durand.md", MARIE),
    ]);

    let read = read(&session);

    assert_eq!(
        read["unreadable"],
        json!(["clients/personnes/sans-titre.md"])
    );
    assert_eq!(read["people"].as_array().unwrap().len(), 1);
}

#[test]
fn a_crm_in_a_folder_gives_the_paths_of_its_fiches_from_its_folder() {
    let session = opened(&[
        ("Ventes/clients.md", CRM),
        ("Ventes/clients/personnes/marie-durand.md", MARIE),
    ]);

    let read = read_with(&session, json!({ "path": "Ventes/clients.md" }));

    assert_eq!(read["path"], "Ventes/clients.md");
    assert_eq!(
        read["people"][0]["fiche"],
        "Ventes/clients/personnes/marie-durand.md"
    );
}

#[test]
fn a_crm_is_read_in_another_workspace_without_changing_the_open_one() {
    let world = world();
    world.allow(&["Notes", "Travail"]);
    for (path, text) in CLIENTS {
        application::NoteStore::write(&*world.notes, &domain::NotePath::parse(path).unwrap(), text)
            .unwrap();
    }

    let read = world.found(
        "read_crm",
        json!({ "path": "clients.md", "workspace": "Notes" }),
    );

    assert_eq!(read["title"], "Clients");
    assert_eq!(world.opened_name(), "Travail");
    assert!(
        world
            .refused("read_crm", json!({ "path": "clients.md" }))
            .contains("clients.md")
    );
}
