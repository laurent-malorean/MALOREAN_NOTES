//! Les outils de l'application, joués par leur protocole comme Claude Code les joue, sur des
//! faux (fiche 0040).

use std::sync::{Arc, mpsc};
use std::thread;

use application::testing::{
    FakeClaudeCode, FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore,
};
use application::{ClaudeError, WorkspaceName};
use domain::claude::{ClaudeEvent, ConversationId, TurnSettings};
use serde_json::{Value, json};

use super::*;

fn session_with(notes: &[(&str, &str)], claude: Option<Arc<FakeClaudeCode>>) -> Session {
    let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
    let session = Session::new(
        Arc::new(opener),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    let session = match claude {
        Some(claude) => session.with_claude(claude),
        None => session,
    };
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session
}

pub(super) fn opened(notes: &[(&str, &str)]) -> Session {
    session_with(notes, None)
}

pub(super) fn notes_workspace() -> WorkspaceName {
    WorkspaceName::new("Notes").unwrap()
}

/// La réponse, lue, à la demande `request` présentée avec `key`.
fn asked(session: &Session, key: &str, request: &Value) -> Value {
    serde_json::from_str(&session.answer_app_tools(key, &request.to_string()).unwrap()).unwrap()
}

/// Ce que rend l'outil `tool` appelé avec `arguments` : son texte, et s'il a échoué.
fn called(session: &Session, key: &str, tool: &str, arguments: Value) -> (String, bool) {
    let reply = asked(
        session,
        key,
        &json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                 "params": { "name": tool, "arguments": arguments } }),
    );
    let result = &reply["result"];
    (
        result["content"][0]["text"].as_str().unwrap().to_owned(),
        result["isError"].as_bool().unwrap(),
    )
}

/// Ce que rend l'outil, réussi, lu en JSON.
pub(super) fn found(session: &Session, key: &str, tool: &str, arguments: Value) -> Value {
    let (text, failed) = called(session, key, tool, arguments);
    assert!(!failed, "{text}");
    serde_json::from_str(&text).unwrap()
}

/// L'outil échoue, et dit pourquoi.
pub(super) fn refused(session: &Session, key: &str, tool: &str, arguments: Value) -> String {
    let (text, failed) = called(session, key, tool, arguments);
    assert!(failed, "{text}");
    text
}

fn listing() -> Value {
    json!({ "jsonrpc": "2.0", "id": 9, "method": "tools/list" })
}

fn key_refused(reply: &Value) -> bool {
    reply["error"]["code"] == -32001
}

#[test]
fn outside_a_turn_every_request_is_refused() {
    let session = opened(&[("a.md", "# A")]);
    assert!(key_refused(&asked(&session, "", &listing())));
    assert!(key_refused(&asked(&session, "devinée", &listing())));
}

#[test]
fn the_key_of_a_turn_reaches_claude_code_and_opens_the_tools_until_the_end_of_the_turn() {
    let claude = Arc::new(FakeClaudeCode::hanging(vec![
        ClaudeEvent::ConversationStarted(ConversationId::new("c1").unwrap()),
    ]));
    let session = session_with(&[("a.md", "# A")], Some(Arc::clone(&claude)));
    let (sender, received) = mpsc::channel();
    let listing = listing().to_string();
    // Rien ne doit pouvoir échouer pendant que le tour attend : tout est relevé, le tour arrêté,
    // puis vérifié.
    let (key, during, other, busy, keys, after_busy, after) = thread::scope(|scope| {
        let running = scope.spawn(|| {
            session.send_to_claude("Bonjour", None, TurnSettings::default(), |item| {
                sender.send(item).ok();
            })
        });
        received.recv().ok();
        let key = claude.tools_keys().first().cloned().flatten();
        let key_text = key.as_ref().map_or("", AppToolsKey::as_str).to_owned();
        let during = session.answer_app_tools(&key_text, &listing);
        let other = session.answer_app_tools("autre", &listing);
        // Un tour refusé pendant celui-ci ne change pas la clé.
        let busy = session.send_to_claude("Encore", None, TurnSettings::default(), |_| {});
        let keys = claude.tools_keys().len();
        let after_busy = session.answer_app_tools(&key_text, &listing);
        session.stop_claude();
        let _ended = running.join();
        let after = session.answer_app_tools(&key_text, &listing);
        (key, during, other, busy, keys, after_busy, after)
    });
    let read = |reply: Option<String>| -> Value { serde_json::from_str(&reply.unwrap()).unwrap() };
    assert_eq!(key.unwrap().as_str().len(), 32);
    assert_eq!(
        read(during)["result"]["tools"].as_array().unwrap().len(),
        AppTool::ALL.len()
    );
    assert!(key_refused(&read(other)));
    assert_eq!(busy.unwrap_err().message, ClaudeError::Busy.to_string());
    assert_eq!(keys, 1);
    assert!(read(after_busy)["result"].is_object());
    assert!(key_refused(&read(after)));
}

#[test]
fn each_turn_has_its_own_key() {
    let claude = Arc::new(FakeClaudeCode::replaying(Vec::new()));
    let session = session_with(&[], Some(Arc::clone(&claude)));
    for _ in 0..2 {
        session
            .send_to_claude("Bonjour", None, TurnSettings::default(), |_| {})
            .unwrap();
    }
    let keys = claude.tools_keys();
    assert_ne!(keys[0], keys[1]);
    assert!(keys.iter().all(Option::is_some));
}

#[test]
fn the_tools_only_act_in_the_workspace_of_the_turn() {
    let session = opened(&[("a.md", "# A")]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str().to_owned();
    session.add_workspace("Autre", "/Users/moi/Autre").unwrap();
    assert_eq!(
        refused(&session, &key, "list_tags", json!({})),
        "l'espace de travail « Notes » de ce tour n'est plus ouvert : rien n'a été fait"
    );
    session.open_workspace("Notes").unwrap();
    assert_eq!(found(&session, &key, "list_tags", json!({})), json!([]));
}

#[test]
fn the_tools_need_an_open_workspace() {
    let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
    let session = Session::new(
        Arc::new(opener),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    let tools = session.open_tools(notes_workspace()).unwrap();
    assert_eq!(
        refused(&session, tools.key().as_str(), "list_tags", json!({})),
        "aucun espace de travail n'est ouvert"
    );
}

#[test]
fn tools_are_opened_for_one_turn_at_a_time() {
    let session = opened(&[]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    assert!(session.open_tools(notes_workspace()).is_none());
    drop(tools);
    assert!(session.open_tools(notes_workspace()).is_some());
}

/// Les chemins des notes que rend une recherche.
pub(super) fn paths(found: &Value) -> Vec<&str> {
    found
        .as_array()
        .unwrap()
        .iter()
        .map(|note| note["path"].as_str().unwrap())
        .collect()
}

#[test]
fn the_search_uses_the_index_by_words_tag_folder_and_content_type() {
    let session = opened(&[
        ("a.md", "---\ntags: [maison]\n---\n# Alpha\ndu pain frais"),
        ("Travail/b.md", "---\ntags: [maison]\n---\n# Bêta\npain"),
        ("Travail/Projets/c.md", "# Gamma\ndu lait"),
        (
            "cahier.md",
            "---\ntype: cahier-de-recherche\n---\n# Cahier\n## 2026\n### Novembre\n\
             #### Lundi 16\n- 09:42 - du pain\n- 10:00 - du sel",
        ),
    ]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();
    let by_words = found(&session, key, "search_notes", json!({ "query": "PAIN" }));
    let mut found_paths = paths(&by_words);
    found_paths.sort_unstable();
    assert_eq!(found_paths, ["Travail/b.md", "a.md", "cahier.md"]);
    let notebooks = found(
        &session,
        key,
        "search_notes",
        json!({ "query": "pain", "content_type": "cahier-de-recherche" }),
    );
    assert_eq!(paths(&notebooks), ["cahier.md"]);
    assert!(
        notebooks[0]["excerpt"]
            .as_str()
            .unwrap()
            .contains("du pain")
    );
    let alpha = by_words
        .as_array()
        .unwrap()
        .iter()
        .find(|note| note["path"] == "a.md")
        .unwrap();
    assert_eq!(
        *alpha,
        json!({ "path": "a.md", "title": "Alpha", "folder": "", "tags": ["maison"],
                "excerpt": "# Alpha du pain frais", "matches": 1 })
    );
    let in_folder = found(
        &session,
        key,
        "search_notes",
        json!({ "folder": "Travail" }),
    );
    let mut in_folder = paths(&in_folder);
    in_folder.sort_unstable();
    assert_eq!(in_folder, ["Travail/Projets/c.md", "Travail/b.md"]);
    let tagged = found(
        &session,
        key,
        "search_notes",
        json!({ "tag": "maison", "folder": "Travail", "query": "pain", "content_type": "note" }),
    );
    assert_eq!(paths(&tagged), ["Travail/b.md"]);
    let everything = found(&session, key, "search_notes", json!({ "query": "  " }));
    assert_eq!(paths(&everything).len(), 4);
    assert!(everything[0].get("excerpt").is_none());
}

#[test]
fn a_search_with_a_tag_gives_only_the_notes_that_carry_it() {
    let session = opened(&[
        ("a.md", "---\ntags: [maison]\n---\n# Alpha\ndu pain"),
        ("b.md", "---\ntags: [travail]\n---\n# Bêta\ndu pain"),
        ("c.md", "# Gamma\ndu pain"),
    ]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();
    let tagged = found(&session, key, "search_notes", json!({ "tag": "maison" }));
    let tagged_by_words = found(
        &session,
        key,
        "search_notes",
        json!({ "tag": "maison", "query": "pain" }),
    );
    let untagged = found(&session, key, "search_notes", json!({ "query": "pain" }));
    let mut untagged = paths(&untagged);
    untagged.sort_unstable();
    assert_eq!(paths(&tagged), ["a.md"]);
    assert_eq!(paths(&tagged_by_words), ["a.md"]);
    assert_eq!(untagged, ["a.md", "b.md", "c.md"]);
}

#[test]
fn a_search_shows_at_most_its_limit_of_notes() {
    let notes: Vec<(String, String)> = (0..=MAX)
        .map(|n| (format!("n{n}.md"), format!("# Note {n}")))
        .collect();
    let borrowed: Vec<(&str, &str)> = notes
        .iter()
        .map(|(path, text)| (path.as_str(), text.as_str()))
        .collect();
    let session = opened(&borrowed);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let all = found(&session, tools.key().as_str(), "search_notes", json!({}));
    assert_eq!(all.as_array().unwrap().len(), MAX);
}

const MAX: usize = application::use_cases::MAX_RESULTS;

#[test]
fn a_search_by_an_unknown_content_type_or_an_invalid_folder_is_refused() {
    let session = opened(&[("a.md", "# A")]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();
    assert_eq!(
        refused(
            &session,
            key,
            "search_notes",
            json!({ "content_type": "kanban" })
        ),
        "type de contenu inconnu : « kanban » ; ceux d'une note : « note », « cahier-de-recherche », « carte-mentale », \
         « crm », « crm-entreprise », « crm-personne », « crm-action », « crm-projet », \
         « agenda-12 », « agenda-12-evenement »"
    );
    assert!(
        refused(
            &session,
            key,
            "search_notes",
            json!({ "content_type": "entree" })
        )
        .starts_with("type de contenu inconnu : « entree »")
    );
    assert_eq!(
        refused(&session, key, "search_notes", json!({ "folder": "../x" })),
        "dossier invalide"
    );
}

#[test]
fn tags_are_listed_with_their_number_of_notes() {
    let session = opened(&[
        ("a.md", "---\ntags: [maison, jardin]\n---\n# A"),
        ("b.md", "---\ntags: [maison]\n---\n# B"),
    ]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    assert_eq!(
        found(&session, tools.key().as_str(), "list_tags", Value::Null),
        json!([{ "name": "jardin", "count": 1 }, { "name": "maison", "count": 2 }])
    );
}

#[test]
fn the_linking_notes_of_a_note_are_given() {
    let session = opened(&[
        ("a.md", "# Alpha"),
        ("Travail/b.md", "# Bêta\nvoir [[alpha]]"),
    ]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();
    assert_eq!(
        found(&session, key, "linking_notes", json!({ "path": "a.md" })),
        json!([{ "path": "Travail/b.md", "title": "Bêta", "folder": "Travail" }])
    );
    assert_eq!(
        refused(&session, key, "linking_notes", json!({})),
        "il manque « path »"
    );
    assert_eq!(
        refused(&session, key, "linking_notes", json!({ "path": " " })),
        "il manque « path »"
    );
}

#[test]
fn template_names_come_from_the_templates_folder_chosen_for_the_workspace() {
    let session = opened(&[
        ("Modèles/r.md", "# Réunion"),
        ("Modèles/j.md", "# Journal"),
        ("Modèles/Vieux/v.md", "# Vieux"),
        ("a.md", "# A"),
    ]);
    let without = session.open_tools(notes_workspace()).unwrap();
    assert_eq!(
        refused(
            &session,
            without.key().as_str(),
            "list_templates",
            json!({})
        ),
        "aucun dossier des modèles n'est choisi pour l'espace de travail « Notes » : \
         l'utilisateur peut en choisir un dans les Réglages de MALOREAN Notes, onglet « Écriture »"
    );
    drop(without);
    session.set_templates_folder(Some("Modèles")).unwrap();
    let tools = session.open_tools(notes_workspace()).unwrap();
    assert_eq!(
        found(&session, tools.key().as_str(), "list_templates", json!({})),
        json!([{ "name": "Journal" }, { "name": "Réunion" }])
    );
}

#[test]
fn the_versions_of_a_note_are_listed_and_read() {
    let session = opened(&[("a.md", "# A\nancien")]);
    session.keep_version("a.md").unwrap();
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();
    assert_eq!(
        found(&session, key, "list_versions", json!({ "path": "a.md" })),
        json!([{ "id": "2026-11-16 18h30", "label": "16 novembre 2026 à 18:30" }])
    );
    let (text, failed) = called(
        &session,
        key,
        "read_version",
        json!({ "path": "a.md", "version": "2026-11-16 18h30" }),
    );
    assert_eq!((text.as_str(), failed), ("# A\nancien", false));
    assert_eq!(
        refused(&session, key, "read_version", json!({ "path": "a.md" })),
        "il manque « version »"
    );
    assert_eq!(
        refused(&session, key, "list_versions", json!({ "path": "../a.md" })),
        "nom de note invalide : « ../a.md »"
    );
}

#[test]
fn a_search_gives_the_nodes_of_mind_maps_with_the_path_of_their_map_and_of_the_node() {
    let session = opened(&[
        (
            "Idees/carte.md",
            "---\ntype: carte-mentale\ntags: [labo]\n---\n# Recettes\n\n- Pain\n  - Levain\n    > farine\n",
        ),
        ("note.md", "# Note\nlevain"),
    ]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();
    let by_words = found(&session, key, "search_notes", json!({ "query": "levain" }));
    let nodes: Vec<&Value> = by_words
        .as_array()
        .unwrap()
        .iter()
        .filter(|found| found.get("node").is_some())
        .collect();
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0]["path"], "Idees/carte.md");
    assert_eq!(nodes[0]["node"], "0.0");
    assert_eq!(nodes[0]["title"], "Levain");
    // La carte elle-même n'est trouvée que par son titre et ses étiquettes.
    let maps = found(
        &session,
        key,
        "search_notes",
        json!({ "query": "recettes", "content_type": "carte-mentale" }),
    );
    assert_eq!(paths(&maps), ["Idees/carte.md"]);
    assert!(maps[0].get("node").is_none());
    let none = found(
        &session,
        key,
        "search_notes",
        json!({ "query": "pain", "content_type": "carte-mentale" }),
    );
    assert!(paths(&none).is_empty());
    let in_other_folder = found(
        &session,
        key,
        "search_notes",
        json!({ "query": "levain", "folder": "Autre" }),
    );
    assert!(in_other_folder.as_array().unwrap().is_empty());
}
