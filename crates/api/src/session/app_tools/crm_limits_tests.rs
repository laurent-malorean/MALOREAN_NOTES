//! La taille de la lecture d'un CRM par une IA (fiche 0081) : chaque limite, la coupure dite, et la
//! réponse la plus lourde sous la limite d'un résultat d'outil de Claude Code.

use serde_json::{Value, json};

use super::crm_reading_tests::CRM;
use super::tests::{found, notes_workspace, opened};
use crate::session::Session;

fn action(i: usize, description: &str) -> (String, String) {
    (
        format!("clients/actions/2026-11-10-a{i:03}.md"),
        format!(
            "---\ntype: crm-action\nstatut: Progress\ndate: '2026-11-10'\npersonnes: \
             ['[[p{i:03}]] · [[e{i:03}]]', '[[p{i:03}]]']\nprojet: '[[j{i:03}]]'\ncanal: e-mail\n\
             couleur: violet\ntags: [urgent, salon, devis]\nnotes: ['[[Plan de la salle]]']\n---\n\
             # Demande de devis numéro {i}\n\n{description}\n\n#### Liste à cocher : Préparation\n\
             - [x] Relire la demande\n- [ ] Chiffrer\n\n#### Commentaires\n- 2026-11-12 10:32 · \
             Rappelé, pas de réponse.\n"
        ),
    )
}

fn person(i: usize) -> (String, String) {
    (
        format!("clients/personnes/p{i:03}.md"),
        format!(
            "---\ntype: crm-personne\nfonction: Responsable maintenance\nentreprise: '[[e{i:03}]]'\n\
             parcours: ['[[e{i:03}]] · 2026-03-01 →']\nemail: p{i:03}@entreprise-numero.fr\n\
             telephone: 06 12 34 56 78\nlinkedin: https://www.linkedin.com/in/p{i:03}\n---\n\
             # Prénom Nom {i}\n\nRencontré au salon.\n"
        ),
    )
}

fn company(i: usize) -> (String, String) {
    (
        format!("clients/entreprises/e{i:03}.md"),
        format!(
            "---\ntype: crm-entreprise\nsite: https://entreprise-numero-{i}.fr\nsecteur: Industrie\n\
             adresse: 12 rue des Lilas, Lyon\ntelephone: 01 23 45 67 89\n---\n# Entreprise {i}\n\n\
             Client historique.\n"
        ),
    )
}

fn project(i: usize) -> (String, String) {
    (
        format!("clients/projets/j{i:03}.md"),
        format!("---\ntype: crm-projet\ncouleur: bleu\ntags: [web, mobile]\n---\n# Projet {i}\n"),
    )
}

fn session_of(notes: &[(String, String)]) -> Session {
    let mut all: Vec<(&str, &str)> = vec![("clients.md", CRM)];
    all.extend(
        notes
            .iter()
            .map(|(path, text)| (path.as_str(), text.as_str())),
    );
    opened(&all)
}

fn read(session: &Session) -> (Value, usize) {
    let tools = session.open_tools(notes_workspace()).unwrap();
    let read = found(
        session,
        tools.key().as_str(),
        "read_crm",
        json!({ "path": "clients.md" }),
    );
    let size = read.to_string().chars().count();
    (read, size)
}

fn actions_given(read: &Value) -> usize {
    read["columns"]
        .as_array()
        .unwrap()
        .iter()
        .map(|column| column["actions"].as_array().unwrap().len())
        .sum()
}

#[test]
fn a_crm_that_fits_in_every_part_is_read_whole() {
    let mut notes: Vec<_> = (0..50).map(|i| action(i, "")).collect();
    notes.extend((0..30).map(person));
    notes.extend((0..30).map(company));
    notes.extend((0..30).map(project));

    let (read, _) = read(&session_of(&notes));

    assert_eq!(actions_given(&read), 50);
    assert_eq!(read["people"].as_array().unwrap().len(), 30);
    assert_eq!(read["companies"].as_array().unwrap().len(), 30);
    assert_eq!(read["projects"].as_array().unwrap().len(), 30);
    assert_eq!(read["truncated"], false);
    assert!(read.get("message").is_none());
}

/// Une lecture de 200 actions lourdes (et une action faite) : la coupure et ce qu'elle donne.
fn heavy_actions() -> (Value, usize) {
    let filler = "é".repeat(150);
    let mut notes: Vec<_> = (0..200).map(|i| action(i, &filler)).collect();
    notes.push((
        "clients/actions/2026-11-01-fait.md".to_owned(),
        "---\ntype: crm-action\nstatut: Done\ndate: '2026-11-01'\n---\n# Fait\n".to_owned(),
    ));
    let (read, _) = read(&session_of(&notes));
    let given = actions_given(&read);
    (read, given)
}

#[test]
fn actions_beyond_their_place_are_cut_in_the_order_of_the_columns() {
    let (read, given) = heavy_actions();

    assert!((30..200).contains(&given), "{given}");
    assert_eq!(
        read["columns"][1]["actions"].as_array().unwrap().len(),
        given
    );
    assert_eq!(
        read["columns"][1]["actions"][0]["title"],
        "Demande de devis numéro 0"
    );
    assert_eq!(read["columns"][3]["actions"], json!([]));
}

#[test]
fn the_columns_count_every_card_even_the_ones_that_are_not_given() {
    let (read, _) = heavy_actions();

    assert_eq!(read["columns"][1]["count"], 200);
    assert_eq!(read["columns"][3]["count"], 1);
}

#[test]
fn the_message_says_how_many_actions_are_given_and_how_to_go_on() {
    let (read, given) = heavy_actions();

    assert_eq!(read["truncated"], true);
    let message = read["message"].as_str().unwrap();
    assert!(message.contains(&format!("{given} actions sur 201 sont données")));
    assert!(message.contains("la réponse en donne 34000 caractères au plus pour les actions"));
    assert!(message.contains("filtrez par `person`, `company`, `projects`, `tags` ou `search`"));
    assert!(message.contains("`search_notes`"));
    assert!(!message.contains("personnes sur"));
    assert!(!message.contains("fiche(s) ont un texte coupé"));
}

#[test]
fn people_companies_and_projects_beyond_their_place_are_cut_and_each_part_is_named() {
    let mut notes: Vec<_> = (0..200).map(person).collect();
    notes.extend((0..200).map(company));
    notes.extend((0..200).map(project));

    let (read, _) = read(&session_of(&notes));

    let people = read["people"].as_array().unwrap().len();
    let companies = read["companies"].as_array().unwrap().len();
    let projects = read["projects"].as_array().unwrap().len();
    assert!(people < 200 && companies < 200 && projects < 200);
    assert!(people > 20 && companies > 20 && projects > 20);
    assert_eq!(read["truncated"], true);
    let message = read["message"].as_str().unwrap();
    assert!(message.contains(&format!("{people} personnes sur 200 sont données")));
    assert!(message.contains(&format!("{companies} entreprises sur 200 sont données")));
    assert!(message.contains(&format!("{projects} projets sur 200 sont données")));
    assert!(!message.contains("actions sur"));
}

#[test]
fn a_text_longer_than_the_place_is_cut_and_marked_and_the_next_action_is_left_out() {
    let text = "é".repeat(60_000);
    let notes = vec![action(1, &text), action(2, "court")];

    let (read, _) = read(&session_of(&notes));

    let progress = read["columns"][1]["actions"].as_array().unwrap();
    assert_eq!(progress.len(), 1);
    let kept = progress[0]["description"].as_str().unwrap().chars().count();
    assert_eq!(kept, 34_000);
    assert_eq!(progress[0]["text_truncated"], true);
    assert_eq!(read["truncated"], true);
    let message = read["message"].as_str().unwrap();
    assert!(message.contains("1 actions sur 2 sont données"));
    assert!(message.contains("1 fiche(s) ont un texte coupé : elles portent `text_truncated`"));
}

#[test]
fn a_long_text_is_read_whole_once_the_filters_leave_room() {
    let text = "é".repeat(20_000);
    let notes = vec![action(1, &text), action(2, &text), action(3, "court")];
    let session = session_of(&notes);

    let tools = session.open_tools(notes_workspace()).unwrap();
    let alone = found(
        &session,
        tools.key().as_str(),
        "read_crm",
        json!({ "path": "clients.md", "search": "numéro 1" }),
    );

    let action = &alone["columns"][1]["actions"][0];
    assert_eq!(
        action["description"].as_str().unwrap().chars().count(),
        20_000
    );
    assert!(action.get("text_truncated").is_none());
    assert_eq!(alone["truncated"], false);
}

/// La réponse la plus lourde que les places permettent reste sous 70 000 caractères, de quoi
/// tenir largement sous les 25 000 jetons d'un résultat d'outil de Claude Code.
#[test]
fn the_heaviest_answer_stays_under_the_limit_of_a_tool_result() {
    let filler = "é".repeat(150);
    let mut notes: Vec<_> = (0..200).map(|i| action(i, &filler)).collect();
    notes.extend((0..200).map(person));
    notes.extend((0..200).map(company));
    notes.extend((0..200).map(project));

    let (read, size) = read(&session_of(&notes));

    assert!(size < 70_000, "{size}");
    assert!(size > 60_000, "{size}");
    assert_eq!(read["truncated"], true);
}
