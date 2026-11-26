//! Brancher une IA, jouée par le protocole sur des faux : la clé, la prise, la révocation et les
//! outils offerts (fiche 0056).

use std::path::PathBuf;
use std::sync::Arc;

use application::testing::{
    CountingSecretMaker, FakeConnectionSocket, FakeOpener, FakePreferences, FixedClock,
    InMemoryConnectionKeys, InMemoryNoteStore,
};
use application::{ConnectionKeys, ConnectionSocket, StoreError};
use domain::app_tools::AppTool;
use serde_json::{Value, json};

use crate::Session;
use crate::session::app_tools::tests::notes_workspace;

pub(super) struct Fixture {
    pub(super) session: Session,
    keys: Arc<InMemoryConnectionKeys>,
    socket: Arc<FakeConnectionSocket>,
}

pub(super) fn fixture_with(notes: &[(&str, &str)], open_workspace: bool) -> Fixture {
    let keys = Arc::new(InMemoryConnectionKeys::default());
    let socket = Arc::new(FakeConnectionSocket::default());
    let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
    let session = Session::new(
        Arc::new(opener),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    )
    .with_connection(
        keys.clone(),
        Arc::new(CountingSecretMaker::default()),
        socket.clone(),
        PathBuf::from("/Applications/MALOREAN Notes.app/Contents/MacOS/malorean-notes"),
    );
    if open_workspace {
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        // Une IA branchée ne voit que les espaces que l'utilisateur a cochés (fiche 0074).
        session.set_workspace_allowed("Notes", true).unwrap();
    }
    Fixture {
        session,
        keys,
        socket,
    }
}

fn fixture() -> Fixture {
    fixture_with(&[("pain.md", "# Pain\n\nLa farine.")], true)
}

fn asked(session: &Session, key: &str, request: &Value) -> Value {
    serde_json::from_str(
        &session
            .answer_connection(key, &request.to_string())
            .unwrap(),
    )
    .unwrap()
}

pub(super) fn call(session: &Session, key: &str, tool: &str, arguments: &Value) -> Value {
    asked(
        session,
        key,
        &json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                 "params": { "name": tool, "arguments": arguments } }),
    )
}

fn listing() -> Value {
    json!({ "jsonrpc": "2.0", "id": 9, "method": "tools/list" })
}

fn refused(reply: &Value) -> bool {
    reply["error"]["code"] == -32001
}

#[test]
fn without_a_key_nothing_is_open_and_everything_is_refused() {
    let Fixture {
        session, socket, ..
    } = fixture();

    session.open_connection().unwrap();

    assert!(!socket.is_open());
    assert_eq!(session.connection_key().unwrap(), None);
    for key in ["", "secret-1", "n'importe quoi"] {
        assert!(refused(&asked(&session, key, &listing())), "{key}");
    }
}

#[test]
fn creating_the_key_opens_the_socket_and_the_ai_gets_the_same_tools_as_the_claude_column() {
    let Fixture {
        session, socket, ..
    } = fixture();

    let key = session.create_connection_key().unwrap();

    assert!(socket.is_open());
    assert_eq!(key.secret(), "secret-1");
    let reply = asked(&session, key.secret(), &listing());
    let names: Vec<_> = reply["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap().to_owned())
        .collect();
    let expected: Vec<_> = AppTool::ALL
        .iter()
        .map(|tool| tool.name().to_owned())
        .collect();
    assert_eq!(names, expected);
}

#[test]
fn the_tools_of_the_ai_work_on_the_open_workspace_with_the_rules_of_the_application() {
    let Fixture { session, .. } = fixture();
    let key = session.create_connection_key().unwrap();
    let secret = key.secret();

    let found = call(
        &session,
        secret,
        "search_notes",
        &json!({ "query": "farine" }),
    );
    let created = call(
        &session,
        secret,
        "create_note",
        &json!({ "title": "Liste" }),
    );
    let trashed = call(
        &session,
        secret,
        "trash_note",
        &json!({ "path": "pain.md" }),
    );

    assert_eq!(found["result"]["isError"], false);
    assert!(
        found["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("pain.md")
    );
    assert_eq!(created["result"]["isError"], false);
    assert!(session.read_note("liste.md").is_ok());
    assert_eq!(trashed["result"]["isError"], false);
    assert_eq!(session.list_trash().unwrap().notes.len(), 1);
}

#[test]
fn a_connected_ai_sees_and_changes_the_folders_with_the_rules_of_the_application() {
    let Fixture { session, .. } = fixture_with(&[("Travail/plan.md", "# Plan")], true);
    let secret = session.create_connection_key().unwrap();
    let secret = secret.secret();
    let text = |reply: &Value| -> Value {
        assert_eq!(reply["result"]["isError"], false, "{reply}");
        serde_json::from_str(reply["result"]["content"][0]["text"].as_str().unwrap()).unwrap()
    };

    let renamed = call(
        &session,
        secret,
        "rename_folder",
        &json!({ "path": "Travail", "name": "Boulot" }),
    );
    let listed = call(&session, secret, "list_folders", &json!({}));
    let refused_name = call(
        &session,
        secret,
        "rename_folder",
        &json!({ "path": "Boulot", "name": ".cache" }),
    );
    let trashed = call(
        &session,
        secret,
        "trash_folder",
        &json!({ "path": "Boulot" }),
    );

    assert_eq!(text(&renamed), json!({ "path": "Boulot" }));
    assert_eq!(text(&listed), json!({ "folders": ["Boulot"] }));
    assert_eq!(refused_name["result"]["isError"], true);
    assert_eq!(
        refused_name["result"]["content"][0]["text"],
        "nom de dossier invalide : « .cache »"
    );
    assert_eq!(text(&trashed), json!({ "trashed": "Boulot" }));
    assert_eq!(session.list_folders().unwrap(), Vec::<String>::new());
    assert!(
        session
            .list_trash()
            .unwrap()
            .folders
            .contains(&"Boulot".to_owned())
    );
}

#[test]
fn a_connected_ai_reads_and_changes_a_canvas_with_the_rules_of_the_application() {
    let Fixture { session, .. } = fixture_with(
        &[("idees.canvas", r#"{"nodes":[],"edges":[],"tags":["a"]}"#)],
        true,
    );
    let secret = session.create_connection_key().unwrap();
    let secret = secret.secret();
    let text = |reply: &Value| -> Value {
        assert_eq!(reply["result"]["isError"], false, "{reply}");
        serde_json::from_str(reply["result"]["content"][0]["text"].as_str().unwrap()).unwrap()
    };

    let added = call(
        &session,
        secret,
        "add_canvas_card",
        &json!({ "path": "idees.canvas", "type": "text", "text": "Bonjour", "x": 0, "y": 0, "color": "rouge" }),
    );
    let id = text(&added)["card"]["id"].as_str().unwrap().to_owned();
    let linked = call(
        &session,
        secret,
        "add_canvas_card",
        &json!({ "path": "idees.canvas", "type": "link", "url": "https://exemple.fr", "x": 400, "y": 0 }),
    );
    let other = text(&linked)["card"]["id"].as_str().unwrap().to_owned();
    let arrow = call(
        &session,
        secret,
        "add_canvas_arrow",
        &json!({ "path": "idees.canvas", "from": id, "to": other, "label": "voir" }),
    );
    let read = call(
        &session,
        secret,
        "read_canvas",
        &json!({ "path": "idees.canvas" }),
    );
    let refused_color = call(
        &session,
        secret,
        "change_canvas_card",
        &json!({ "path": "idees.canvas", "id": id, "color": "#FF0000" }),
    );

    assert_eq!(text(&arrow)["arrow"]["sense"], "single");
    let read = text(&read);
    assert_eq!(read["card_count"], 2);
    assert_eq!(read["tags"], json!(["a"]));
    assert_eq!(read["cards"][0]["text"], "Bonjour");
    assert_eq!(read["cards"][0]["color"], "rouge");
    assert_eq!(read["arrows"][0]["label"], "voir");
    assert_eq!(refused_color["result"]["isError"], true);
    assert!(
        refused_color["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("n'est pas une couleur de la palette")
    );
    assert_eq!(session.list_versions("idees.canvas").unwrap().len(), 3);
}

#[test]
fn the_tools_name_the_workspace_and_say_it_has_no_templates_folder_until_the_user_chooses_one() {
    let Fixture { session, .. } = fixture();
    let key = session.create_connection_key().unwrap();

    let templates = call(&session, key.secret(), "list_templates", &json!({}));

    assert_eq!(templates["result"]["isError"], true);
    assert!(
        templates["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .starts_with(
                "aucun dossier des modèles n'est choisi pour l'espace de travail « Notes »"
            )
    );
}

#[test]
fn a_wrong_key_is_refused_even_when_another_exists_and_the_answer_says_why() {
    let Fixture { session, .. } = fixture();
    let key = session.create_connection_key().unwrap();

    let wrong = asked(&session, "secret-2", &listing());
    let empty = asked(&session, "", &listing());

    assert!(refused(&wrong));
    assert!(refused(&empty));
    assert_eq!(
        wrong["error"]["message"],
        "clé refusée : cette clé de branchement n'existe pas ou a été révoquée"
    );
    assert!(!refused(&asked(&session, key.secret(), &listing())));
}

#[test]
fn creating_again_gives_the_same_key() {
    let Fixture { session, .. } = fixture();
    let first = session.create_connection_key().unwrap();

    let second = session.create_connection_key().unwrap();

    assert_eq!(second, first);
    assert_eq!(session.connection_key().unwrap(), Some(first));
}

#[test]
fn revoking_closes_the_socket_and_the_old_key_is_refused_for_good() {
    let Fixture {
        session,
        keys,
        socket,
    } = fixture();
    let old = session.create_connection_key().unwrap();

    session.revoke_connection_key().unwrap();

    assert!(!socket.is_open());
    assert_eq!(keys.load().unwrap(), None);
    assert!(refused(&asked(&session, old.secret(), &listing())));
    let new = session.create_connection_key().unwrap();
    assert_ne!(new.secret(), old.secret());
    assert!(socket.is_open());
    assert!(refused(&asked(&session, old.secret(), &listing())));
    assert!(!refused(&asked(&session, new.secret(), &listing())));
}

#[test]
fn a_key_that_could_not_be_erased_leaves_the_socket_open_and_the_key_valid() {
    #[derive(Debug)]
    struct Stuck(InMemoryConnectionKeys);
    impl ConnectionKeys for Stuck {
        fn load(&self) -> Result<Option<domain::connection_key::ConnectionKey>, StoreError> {
            self.0.load()
        }
        fn save(&self, key: &domain::connection_key::ConnectionKey) -> Result<(), StoreError> {
            self.0.save(key)
        }
        fn delete(&self) -> Result<(), StoreError> {
            Err(StoreError::Unavailable("disque plein".to_owned()))
        }
    }
    let socket = Arc::new(FakeConnectionSocket::default());
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(
            InMemoryNoteStore::with_notes(&[]),
        ))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    )
    .with_connection(
        Arc::new(Stuck(InMemoryConnectionKeys::default())),
        Arc::new(CountingSecretMaker::default()),
        socket.clone(),
        PathBuf::from("/Applications/MALOREAN Notes.app/Contents/MacOS/malorean-notes"),
    );
    let key = session.create_connection_key().unwrap();

    let result = session.revoke_connection_key();

    assert_eq!(
        result.unwrap_err().message,
        "stockage indisponible : disque plein"
    );
    assert!(socket.is_open());
    assert!(!refused(&asked(&session, key.secret(), &listing())));
}

#[test]
fn a_socket_that_does_not_open_leaves_no_new_key() {
    let Fixture {
        session,
        keys,
        socket,
    } = fixture();
    socket.fail_to_open(true);

    let result = session.create_connection_key();

    assert_eq!(
        result.unwrap_err().message,
        "stockage indisponible : prise refusée"
    );
    assert_eq!(keys.load().unwrap(), None);
}

#[test]
fn a_socket_that_does_not_open_does_not_take_away_a_key_that_already_existed() {
    let Fixture {
        session,
        keys,
        socket,
    } = fixture();
    let key = session.create_connection_key().unwrap();
    socket.close();
    socket.fail_to_open(true);

    let result = session.create_connection_key();

    assert!(result.is_err());
    assert_eq!(keys.load().unwrap(), Some(key));
}

#[test]
fn at_launch_the_socket_opens_only_if_a_key_exists() {
    let Fixture {
        session, socket, ..
    } = fixture();
    session.create_connection_key().unwrap();
    socket.close();

    session.open_connection().unwrap();

    assert!(socket.is_open());
}

#[test]
fn at_launch_a_socket_that_does_not_open_is_an_error_that_says_why() {
    let Fixture {
        session, socket, ..
    } = fixture();
    session.create_connection_key().unwrap();
    socket.close();
    socket.fail_to_open(true);

    let result = session.open_connection();

    assert_eq!(
        result.unwrap_err().message,
        "stockage indisponible : prise refusée"
    );
}

#[test]
fn the_key_of_a_turn_of_the_claude_column_is_not_the_key_of_the_connection_and_the_other_way_round()
{
    let Fixture { session, .. } = fixture();
    let key = session.create_connection_key().unwrap();
    let tools = session.open_tools(notes_workspace()).unwrap();

    assert!(refused(&asked(&session, tools.key().as_str(), &listing())));
    let turn_reply: Value = serde_json::from_str(
        &session
            .answer_app_tools(key.secret(), &listing().to_string())
            .unwrap(),
    )
    .unwrap();
    assert!(refused(&turn_reply));
}

#[test]
fn without_a_workspace_the_ai_can_still_list_the_tools_but_a_tool_says_why_it_cannot_work() {
    let Fixture { session, .. } = fixture_with(&[], false);
    let key = session.create_connection_key().unwrap();

    let listed = asked(&session, key.secret(), &listing());
    let searched = call(
        &session,
        key.secret(),
        "search_notes",
        &json!({ "query": "x" }),
    );

    assert!(!refused(&listed));
    assert_eq!(searched["result"]["isError"], true);
    assert_eq!(
        searched["result"]["content"][0]["text"],
        "aucun espace de travail n'est ouvert chez l'utilisateur : nommez-en un avec le \
         paramètre « workspace » (voir `list_workspaces`)"
    );
}

#[test]
fn a_session_without_connection_refuses_everything_and_cannot_branch_an_ai() {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(
            InMemoryNoteStore::with_notes(&[]),
        ))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );

    assert!(refused(&asked(&session, "secret-1", &listing())));
    for error in [
        session.create_connection_key().unwrap_err(),
        session.revoke_connection_key().unwrap_err(),
        session.connection_key().unwrap_err(),
        session.open_connection().unwrap_err(),
    ] {
        assert_eq!(error.message, "brancher une IA n'est pas disponible");
    }
}

#[test]
fn an_ai_connected_on_a_workspace_that_is_replaced_by_another_follows_the_open_one() {
    let Fixture { session, .. } = fixture();
    let key = session.create_connection_key().unwrap();
    session.add_workspace("Autre", "/Users/moi/Autre").unwrap();
    session.set_workspace_allowed("Autre", true).unwrap();
    session.open_workspace("Autre").unwrap();

    let viewed = call(&session, key.secret(), "list_tags", &json!({}));

    assert_eq!(viewed["result"]["isError"], false);
}

#[test]
fn without_a_key_the_connection_has_nothing_to_show() {
    let Fixture { session, .. } = fixture();

    assert_eq!(session.connection_info().unwrap().key, None);
}

#[test]
fn with_a_key_the_connection_shows_it_with_its_day_and_the_blocks_to_paste() {
    let Fixture { session, .. } = fixture();
    let key = session.create_connection_key().unwrap();

    let shown = session.connection_info().unwrap().key.unwrap();

    assert_eq!(shown.secret, key.secret());
    assert_eq!(shown.created_on, "16 novembre 2026");
    let program = "/Applications/MALOREAN Notes.app/Contents/MacOS/malorean-notes";
    assert!(shown.claude_config.contains(program));
    assert!(shown.claude_config.contains(key.secret()));
    assert!(shown.codex_config.starts_with("[mcp_servers.malorean]\n"));
    assert!(shown.codex_config.contains(key.secret()));
}

#[test]
fn after_a_revocation_the_connection_shows_no_key_again() {
    let Fixture { session, .. } = fixture();
    session.create_connection_key().unwrap();

    session.revoke_connection_key().unwrap();

    assert_eq!(session.connection_info().unwrap().key, None);
}
