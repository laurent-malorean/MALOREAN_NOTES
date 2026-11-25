//! L'outil de l'application qui cherche par le sens, joué par son protocole sur un faux moteur de
//! sens (fiches 0040 et 0046).

use std::sync::Arc;

use application::testing::{
    FakeMeaningModels, FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore,
};
use application::{MeaningModels, MemoryMeaningIndexes};
use domain::MeaningModel;
use serde_json::{Value, json};

use super::tests::{found, notes_workspace, refused};
use crate::session::Session;

const NOTES: [(&str, &str); 3] = [
    ("tarte.md", "# Tarte\n\n## Dessert\n\npommes sucre beurre"),
    ("cidre.md", "# Cidre\n\npommes fermentées"),
    ("pain.md", "# Pain\n\nfarine levain eau"),
];

/// Une session dont les notes sont indexées avec leurs segments, sur ces modèles ; le calcul des
/// vecteurs est fini (s'il y avait un modèle).
fn session_on(notes: &[(&str, &str)], models: &Arc<FakeMeaningModels>) -> Session {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(
            notes,
        )))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    )
    .with_indexes(Arc::new(MemoryMeaningIndexes))
    .with_meaning_models(Arc::clone(models) as Arc<dyn MeaningModels>);
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session.wait_for_meaning();
    session
}

fn computed(notes: &[(&str, &str)]) -> Session {
    session_on(
        notes,
        &Arc::new(FakeMeaningModels::with(MeaningModel::Small)),
    )
}

fn search(session: &Session, arguments: Value) -> Value {
    let tools = session.open_tools(notes_workspace(), None).unwrap();
    found(
        session,
        tools.key().as_str(),
        "search_by_meaning",
        arguments,
    )
}

fn paths(result: &Value) -> Vec<&str> {
    result["notes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|note| note["path"].as_str().unwrap())
        .collect()
}

#[test]
fn a_question_finds_the_notes_by_their_meaning_with_the_section_found() {
    let session = computed(&NOTES);
    let result = search(&session, json!({ "question": "dessert aux pommes" }));
    assert_eq!(result["meaning_used"], true);
    assert!(result.get("reason").is_none(), "{result}");
    assert_eq!(result["notes"][0]["path"], "tarte.md");
    assert_eq!(result["notes"][0]["title"], "Tarte");
    assert_eq!(
        result["notes"][0]["excerpt"],
        "Dessert — pommes sucre beurre"
    );
    assert_eq!(paths(&result)[..2], ["tarte.md", "cidre.md"]);
}

const CRM_NOTES: [(&str, &str); 3] = [
    ("clients.md", "---\ntype: crm\n---\n# Clients"),
    (
        "clients/actions/2026-11-24-devis.md",
        "---\ntype: crm-action\n---\n# Demande de devis\n\nPour trois postes de travail.",
    ),
    ("pain.md", "# Pain\n\nfarine levain eau"),
];

#[test]
fn a_card_is_found_by_its_meaning_with_its_type_and_the_path_of_its_crm() {
    let session = computed(&CRM_NOTES);
    let result = search(&session, json!({ "question": "clients devis" }));
    assert_eq!(result["meaning_used"], true);
    assert_eq!(
        result["notes"][0],
        json!({ "path": "clients/actions/2026-11-24-devis.md", "title": "Demande de devis",
                "type": "crm-action", "crm": "clients.md",
                "excerpt": "Pour trois postes de travail." })
    );
    let plain = result["notes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|note| note["path"] == "pain.md")
        .unwrap();
    assert!(plain.get("type").is_none() && plain.get("crm").is_none());
}

#[test]
fn a_crm_found_by_its_words_alone_has_its_type_and_no_crm_of_its_own() {
    let session = session_on(&CRM_NOTES, &Arc::new(FakeMeaningModels::default()));
    let result = search(&session, json!({ "question": "clients" }));
    assert_eq!(result["meaning_used"], false);
    let crm = result["notes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|note| note["path"] == "clients.md")
        .unwrap();
    assert_eq!(crm["type"], "crm");
    assert!(crm.get("crm").is_none());
}

#[test]
fn without_the_model_the_words_answer_alone_and_the_reason_is_told_to_claude() {
    let session = session_on(&NOTES, &Arc::new(FakeMeaningModels::default()));
    let result = search(&session, json!({ "question": "pommes" }));
    assert_eq!(result["meaning_used"], false);
    assert_eq!(
        result["reason"],
        "le modèle « E5 petit » n'est pas téléchargé : téléchargez-le dans les réglages ; \
         en attendant, seule la recherche par mots répond"
    );
    let mut found_by_words = paths(&result);
    found_by_words.sort_unstable();
    assert_eq!(found_by_words, ["cidre.md", "tarte.md"]);
}

#[test]
fn before_the_vectors_are_computed_the_words_answer_alone_and_the_reason_is_told() {
    // Le modèle arrive sans passer par la session : aucun calcul n'est demandé.
    let models = Arc::new(FakeMeaningModels::default());
    let session = session_on(&NOTES, &models);
    models
        .download(MeaningModel::Small, &mut |_| {
            std::ops::ControlFlow::Continue(())
        })
        .unwrap();
    let result = search(&session, json!({ "question": "pommes" }));
    assert_eq!(result["meaning_used"], false);
    assert!(
        result["reason"]
            .as_str()
            .unwrap()
            .starts_with("le sens des notes n'est pas encore calculé"),
        "{result}"
    );
    assert_eq!(paths(&result).len(), 2);
}

#[test]
fn a_blank_or_missing_question_is_refused() {
    let session = computed(&NOTES);
    let tools = session.open_tools(notes_workspace(), None).unwrap();
    let key = tools.key().as_str();
    for arguments in [
        json!({}),
        json!({ "question": "  " }),
        json!({ "limit": 3 }),
    ] {
        assert_eq!(
            refused(&session, key, "search_by_meaning", arguments),
            "il manque « question »"
        );
    }
}

fn many_notes() -> Vec<(String, String)> {
    (0..105)
        .map(|n| (format!("n{n:03}.md"), format!("# N{n}\n\npommes")))
        .collect()
}

fn computed_many() -> Session {
    let owned = many_notes();
    let notes: Vec<(&str, &str)> = owned
        .iter()
        .map(|(p, c)| (p.as_str(), c.as_str()))
        .collect();
    computed(&notes)
}

#[test]
fn the_number_of_notes_is_ten_by_default_and_the_limit_when_it_is_given_up_to_a_hundred() {
    let session = computed_many();
    let count = |arguments: Value| paths(&search(&session, arguments)).len();
    let question = "pommes";
    assert_eq!(count(json!({ "question": question })), 10);
    assert_eq!(count(json!({ "question": question, "limit": null })), 10);
    assert_eq!(count(json!({ "question": question, "limit": 1 })), 1);
    assert_eq!(count(json!({ "question": question, "limit": 3 })), 3);
    assert_eq!(count(json!({ "question": question, "limit": 100 })), 100);
    assert_eq!(count(json!({ "question": question, "limit": 1000 })), 100);
}

#[test]
fn an_invalid_limit_is_refused_with_what_is_expected() {
    let session = computed(&NOTES);
    let tools = session.open_tools(notes_workspace(), None).unwrap();
    let key = tools.key().as_str();
    for limit in [json!(0), json!(-1), json!("3"), json!(1.5), json!(true)] {
        assert_eq!(
            refused(
                &session,
                key,
                "search_by_meaning",
                json!({ "question": "pommes", "limit": limit })
            ),
            "« limit » est un nombre entier d'au moins 1"
        );
    }
}

#[test]
fn the_tool_needs_the_workspace_of_the_turn() {
    let session = computed(&NOTES);
    let tools = session
        .open_tools(application::WorkspaceName::new("Autre").unwrap(), None)
        .unwrap();
    assert!(
        refused(
            &session,
            tools.key().as_str(),
            "search_by_meaning",
            json!({ "question": "pommes" })
        )
        .contains("Autre")
    );
}
