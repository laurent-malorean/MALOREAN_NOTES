//! Les espaces de travail pour les IA, joués par le protocole sur des faux (fiche 0074) : la
//! liste des espaces autorisés, le paramètre `workspace` des outils, l'espace visé ouvert en
//! arrière-plan sans changer l'espace de l'utilisateur.

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use application::testing::{
    CountingSecretMaker, FakeConnectionSocket, FakeOpener, FakePreferences, FixedClock,
    InMemoryConnectionKeys, InMemoryNoteStore,
};
use application::{
    NoteStore, Preferences, StoreError, WorkspaceLocation, WorkspaceName, WorkspaceOpener,
};
use domain::NotePath;
use serde_json::{Value, json};

use super::tests::{found, notes_workspace, refused};
use crate::Session;

/// Un ouvreur dont les dossiers peuvent disparaître.
#[derive(Debug)]
struct Vanishing {
    inner: FakeOpener,
    gone: Arc<AtomicBool>,
}

impl WorkspaceOpener for Vanishing {
    fn open(&self, location: &WorkspaceLocation) -> Result<Arc<dyn NoteStore>, StoreError> {
        if self.gone.load(Ordering::SeqCst) && location.as_str() == "/Users/moi/Notes" {
            return Err(StoreError::Unavailable("dossier disparu".to_owned()));
        }
        self.inner.open(location)
    }
}

/// « Notes » (`pain.md`) puis « Travail » (`devis.md`), ouvert en dernier ; une IA branchée.
struct World {
    session: Session,
    notes: Arc<InMemoryNoteStore>,
    travail: Arc<InMemoryNoteStore>,
    preferences: Arc<FakePreferences>,
    gone: Arc<AtomicBool>,
    key: String,
}

fn world() -> World {
    let notes = Arc::new(InMemoryNoteStore::with_notes(&[(
        "pain.md",
        "# Pain\n\nLa farine.",
    )]));
    let travail = Arc::new(InMemoryNoteStore::with_notes(&[(
        "devis.md",
        "# Devis\n\nLe client.",
    )]));
    let gone = Arc::new(AtomicBool::new(false));
    let opener = Vanishing {
        inner: FakeOpener::by_location(vec![
            ("/Users/moi/Notes", Arc::clone(&notes)),
            ("/Users/moi/Travail", Arc::clone(&travail)),
        ]),
        gone: Arc::clone(&gone),
    };
    let preferences = Arc::new(FakePreferences::default());
    let session = Session::new(
        Arc::new(opener),
        Arc::clone(&preferences) as _,
        Arc::new(FixedClock::default()),
    )
    .with_connection(
        Arc::new(InMemoryConnectionKeys::default()),
        Arc::new(CountingSecretMaker::default()),
        Arc::new(FakeConnectionSocket::default()),
        PathBuf::from("/Applications/MALOREAN Notes.app/Contents/MacOS/malorean-notes"),
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session
        .add_workspace("Travail", "/Users/moi/Travail")
        .unwrap();
    let key = session.create_connection_key().unwrap().secret().to_owned();
    World {
        session,
        notes,
        travail,
        preferences,
        gone,
        key,
    }
}

impl World {
    fn tool(&self, tool: &str, arguments: Value) -> (String, bool) {
        let request = json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                              "params": { "name": tool, "arguments": arguments } });
        let reply: Value = serde_json::from_str(
            &self
                .session
                .answer_connection(&self.key, &request.to_string())
                .unwrap(),
        )
        .unwrap();
        let result = &reply["result"];
        (
            result["content"][0]["text"].as_str().unwrap().to_owned(),
            result["isError"].as_bool().unwrap(),
        )
    }

    fn found(&self, tool: &str, arguments: Value) -> Value {
        let (text, failed) = self.tool(tool, arguments);
        assert!(!failed, "{text}");
        serde_json::from_str(&text).unwrap()
    }

    fn refused(&self, tool: &str, arguments: Value) -> String {
        let (text, failed) = self.tool(tool, arguments);
        assert!(failed, "{text}");
        text
    }

    fn allow(&self, names: &[&str]) {
        for name in names {
            self.session.set_workspace_allowed(name, true).unwrap();
        }
    }

    fn paths_of(&self, arguments: Value) -> Vec<String> {
        self.found("search_notes", arguments)
            .as_array()
            .unwrap()
            .iter()
            .map(|note| note["path"].as_str().unwrap().to_owned())
            .collect()
    }

    fn opened_name(&self) -> String {
        self.session.opened().unwrap().name.as_str().to_owned()
    }
}

fn has(store: &InMemoryNoteStore, path: &str) -> bool {
    store.read(&NotePath::parse(path).unwrap()).is_ok()
}

const NOTHING_ALLOWED: &str = "aucun espace de travail n'est autorisé pour les IA : \
    l'utilisateur doit en cocher un dans les Réglages de MALOREAN Notes, onglet « Brancher une IA »";

#[test]
fn at_first_the_ai_sees_no_workspace_and_is_sent_to_the_settings() {
    let world = world();

    let listed = world.found("list_workspaces", json!({}));

    assert_eq!(
        listed,
        json!({ "workspaces": [], "message": NOTHING_ALLOWED })
    );
}

#[test]
fn at_first_no_tool_reads_or_writes_anywhere_and_the_error_points_to_the_settings() {
    let world = world();
    for arguments in [
        json!({ "query": "devis" }),
        json!({ "query": "farine", "workspace": "Notes" }),
    ] {
        let error = world.refused("search_notes", arguments);
        assert!(
            error.starts_with("aucun espace de travail autorisé ne s'appelle « "),
            "{error}"
        );
        assert!(error.ends_with("onglet « Brancher une IA »"), "{error}");
    }

    let error = world.refused(
        "create_note",
        json!({ "title": "Liste", "workspace": "Notes" }),
    );

    assert!(error.contains("onglet « Brancher une IA »"), "{error}");
    assert!(!has(&world.notes, "liste.md"));
    assert!(!has(&world.travail, "liste.md"));
}

#[test]
fn the_list_shows_only_the_allowed_workspaces_by_name_with_the_open_one_marked() {
    let world = world();
    world.allow(&["Notes"]);

    let only_notes = world.found("list_workspaces", json!({}));
    world.allow(&["Travail"]);
    let both = world.found("list_workspaces", json!({}));

    assert_eq!(
        only_notes,
        json!({ "workspaces": [{ "name": "Notes", "open": false }] })
    );
    assert_eq!(
        both,
        json!({ "workspaces": [
            { "name": "Notes", "open": false },
            { "name": "Travail", "open": true },
        ] })
    );
    assert!(!both.to_string().contains("/Users"));
}

#[test]
fn without_the_parameter_a_tool_aims_at_the_open_workspace_only_if_it_is_allowed() {
    let world = world();
    world.allow(&["Notes"]);

    let error = world.refused("search_notes", json!({ "query": "devis" }));

    assert_eq!(
        error,
        "aucun espace de travail autorisé ne s'appelle « Travail » ; ceux que les IA peuvent \
         utiliser : « Notes »"
    );
    world.allow(&["Travail"]);
    assert_eq!(world.paths_of(json!({ "query": "devis" })), ["devis.md"]);
}

#[test]
fn a_workspace_that_is_not_the_open_one_is_read_in_the_background_by_its_name() {
    let world = world();
    world.allow(&["Notes", "Travail"]);

    let in_notes = world.paths_of(json!({ "query": "farine", "workspace": "notes" }));
    let in_open = world.paths_of(json!({ "query": "farine" }));
    let tags = world.found("list_tags", json!({ "workspace": "Notes" }));

    assert_eq!(in_notes, ["pain.md"]);
    assert!(in_open.is_empty());
    assert_eq!(tags, json!([]));
}

#[test]
fn writing_in_another_workspace_follows_the_rules_and_touches_neither_the_open_one_nor_the_screen()
{
    let world = world();
    world.allow(&["Notes"]);
    world.allow(&["Travail"]);
    let before = world.preferences.workspaces().unwrap();

    let created = world.found(
        "create_note",
        json!({ "title": "Liste", "workspace": "Notes" }),
    );
    let trashed = world.found(
        "trash_note",
        json!({ "path": "pain.md", "workspace": "NOTES" }),
    );

    assert_eq!(created, json!({ "path": "liste.md" }));
    assert_eq!(trashed, json!({ "trashed": "pain.md" }));
    assert!(has(&world.notes, "liste.md"));
    assert!(!has(&world.travail, "liste.md"));
    assert!(!has(&world.notes, "pain.md"));
    assert_eq!(world.opened_name(), "Travail");
    assert_eq!(world.preferences.workspaces().unwrap(), before);
    let on_screen: Vec<_> = world
        .session
        .list_notes("", crate::NoteOrderItem::Modified)
        .unwrap()
        .into_iter()
        .map(|note| note.path)
        .collect();
    assert_eq!(on_screen, ["devis.md"]);
}

#[test]
fn a_name_that_is_unknown_or_not_allowed_is_refused_the_same_way_with_the_allowed_names() {
    let world = world();
    world.allow(&["Travail"]);

    let not_allowed = world.refused("list_tags", json!({ "workspace": "Notes" }));
    let unknown = world.refused("list_tags", json!({ "workspace": "Perso" }));

    assert_eq!(
        not_allowed,
        "aucun espace de travail autorisé ne s'appelle « Notes » ; ceux que les IA peuvent \
         utiliser : « Travail »"
    );
    assert_eq!(unknown, not_allowed.replace("Notes", "Perso"));
}

#[test]
fn a_workspace_unchecked_while_the_ai_works_refuses_the_next_call_and_nothing_is_written() {
    let world = world();
    world.allow(&["Notes"]);
    world.found(
        "create_note",
        json!({ "title": "Un", "workspace": "Notes" }),
    );

    world.session.set_workspace_allowed("Notes", false).unwrap();
    let error = world.refused(
        "create_note",
        json!({ "title": "Deux", "workspace": "Notes" }),
    );

    assert!(
        error.starts_with("aucun espace de travail autorisé ne s'appelle « Notes »"),
        "{error}"
    );
    assert!(has(&world.notes, "un.md"));
    assert!(!has(&world.notes, "deux.md"));
    assert!(!has(&world.travail, "deux.md"));
}

#[test]
fn a_workspace_removed_from_the_list_while_the_ai_works_is_refused() {
    let world = world();
    world.allow(&["Notes"]);
    world.session.remove_workspace("Notes").unwrap();

    let error = world.refused(
        "create_note",
        json!({ "title": "Deux", "workspace": "Notes" }),
    );

    assert!(
        error.starts_with("aucun espace de travail autorisé ne s'appelle « Notes »"),
        "{error}"
    );
    assert!(!has(&world.notes, "deux.md"));
}

#[test]
fn a_workspace_whose_folder_has_vanished_is_an_error_and_nothing_is_written_elsewhere() {
    let world = world();
    world.allow(&["Notes"]);
    world.gone.store(true, Ordering::SeqCst);

    let error = world.refused(
        "create_note",
        json!({ "title": "Deux", "workspace": "Notes" }),
    );

    assert_eq!(error, "stockage indisponible : dossier disparu");
    assert!(!has(&world.travail, "deux.md"));
    assert_eq!(world.opened_name(), "Travail");
}

#[test]
fn the_tools_about_the_screen_only_aim_at_the_open_workspace() {
    let world = world();
    world.allow(&["Notes", "Travail"]);

    for tool in ["viewed_note", "show_note"] {
        let error = world.refused(tool, json!({ "path": "pain.md", "workspace": "Notes" }));
        assert_eq!(
            error,
            format!(
                "« {tool} » parle de l'écran de l'utilisateur : il ne vise que l'espace de \
                 travail ouvert chez lui"
            )
        );
    }
}

#[test]
fn another_workspace_has_no_templates_folder_for_the_ai() {
    let world = world();
    world.allow(&["Notes"]);

    let error = world.refused("list_templates", json!({ "workspace": "Notes" }));

    assert!(
        error.starts_with("aucun dossier des modèles n'est choisi"),
        "{error}"
    );
}

#[test]
fn naming_the_open_workspace_works_like_not_naming_it() {
    let world = world();
    world.allow(&["Travail"]);

    assert_eq!(
        world.paths_of(json!({ "query": "devis", "workspace": "travail" })),
        ["devis.md"]
    );
}

#[test]
fn with_no_workspace_open_the_ai_must_name_one() {
    let world = world();
    world.allow(&["Notes"]);
    let session = Session::new(
        Arc::new(FakeOpener::by_location(vec![(
            "/Users/moi/Notes",
            Arc::clone(&world.notes),
        )])),
        Arc::clone(&world.preferences) as _,
        Arc::new(FixedClock::default()),
    )
    .with_connection(
        Arc::new(InMemoryConnectionKeys::default()),
        Arc::new(CountingSecretMaker::default()),
        Arc::new(FakeConnectionSocket::default()),
        PathBuf::from("/app"),
    );
    let key = session.create_connection_key().unwrap().secret().to_owned();
    let ask = |arguments: Value| -> Value {
        let request = json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": { "name": "search_notes", "arguments": arguments } });
        serde_json::from_str(
            &session
                .answer_connection(&key, &request.to_string())
                .unwrap(),
        )
        .unwrap()
    };

    let without = ask(json!({ "query": "farine" }));
    let named = ask(json!({ "query": "farine", "workspace": "Notes" }));

    assert_eq!(without["result"]["isError"], true);
    assert_eq!(
        without["result"]["content"][0]["text"],
        "aucun espace de travail n'est ouvert chez l'utilisateur : nommez-en un avec le \
         paramètre « workspace » (voir `list_workspaces`)"
    );
    assert_eq!(named["result"]["isError"], false);
    assert!(
        named["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("pain.md")
    );
    let listed = session.answer_connection(
        &key,
        &json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": { "name": "list_workspaces", "arguments": {} } })
        .to_string(),
    );
    assert!(listed.unwrap().contains(r#"\"open\":false"#));
}

/// La colonne Claude Code : son espace du tour reste le défaut, autorisé ou non.
#[test]
fn the_claude_column_keeps_its_workspace_of_the_turn_as_the_default_even_if_not_allowed() {
    let world = world();
    let tools = world
        .session
        .open_tools(WorkspaceName::new("Travail").unwrap(), None)
        .unwrap();
    let key = tools.key().as_str().to_owned();

    let by_default = found(
        &world.session,
        &key,
        "search_notes",
        json!({ "query": "devis" }),
    );
    let named = found(
        &world.session,
        &key,
        "search_notes",
        json!({ "query": "devis", "workspace": "TRAVAIL" }),
    );
    let other = refused(
        &world.session,
        &key,
        "search_notes",
        json!({ "workspace": "Notes" }),
    );

    assert_eq!(by_default[0]["path"], "devis.md");
    assert_eq!(named, by_default);
    assert!(
        other.starts_with("aucun espace de travail autorisé ne s'appelle « Notes »"),
        "{other}"
    );
}

#[test]
fn the_claude_column_can_aim_at_another_allowed_workspace() {
    let world = world();
    world.allow(&["Notes"]);
    let tools = world
        .session
        .open_tools(WorkspaceName::new("Travail").unwrap(), None)
        .unwrap();
    let key = tools.key().as_str().to_owned();

    let in_notes = found(
        &world.session,
        &key,
        "search_notes",
        json!({ "query": "farine", "workspace": "Notes" }),
    );
    let listed = found(&world.session, &key, "list_workspaces", json!({}));

    assert_eq!(in_notes[0]["path"], "pain.md");
    assert_eq!(
        listed,
        json!({ "workspaces": [{ "name": "Notes", "open": false }] })
    );
}

#[test]
fn the_claude_column_still_refuses_a_turn_whose_workspace_is_no_longer_open() {
    let world = world();
    let tools = world.session.open_tools(notes_workspace(), None).unwrap();
    let key = tools.key().as_str().to_owned();

    let error = refused(&world.session, &key, "list_tags", json!({}));

    assert_eq!(
        error,
        "l'espace de travail « Notes » de ce tour n'est plus ouvert : rien n'a été fait"
    );
}

#[test]
fn a_text_is_replaced_in_another_workspace_without_touching_the_open_one_or_the_screen() {
    let world = world();
    world.allow(&["Notes", "Travail"]);
    let before = world.preferences.workspaces().unwrap();

    let replaced = world.found(
        "replace_in_note",
        json!({ "path": "pain.md", "old_text": "La farine.", "new_text": "Le levain.",
                "workspace": "notes" }),
    );

    assert_eq!(
        replaced,
        json!({ "path": "pain.md", "title": "Pain", "replacements": 1 })
    );
    let text = |store: &InMemoryNoteStore, path: &str| {
        store.read(&NotePath::parse(path).unwrap()).unwrap().content
    };
    assert_eq!(text(&world.notes, "pain.md"), "# Pain\n\nLe levain.");
    assert_eq!(text(&world.travail, "devis.md"), "# Devis\n\nLe client.");
    assert_eq!(world.opened_name(), "Travail");
    assert_eq!(world.preferences.workspaces().unwrap(), before);
    assert_eq!(world.paths_of(json!({ "query": "client" })), ["devis.md"]);
    assert_eq!(
        world.paths_of(json!({ "query": "levain", "workspace": "Notes" })),
        ["pain.md"]
    );
}

#[test]
fn a_text_is_replaced_in_the_open_workspace_only_if_it_is_allowed() {
    let world = world();
    let arguments = json!({ "path": "devis.md", "old_text": "Le client.", "new_text": "Le prix." });

    let error = world.refused("replace_in_note", arguments.clone());
    assert!(error.contains("onglet « Brancher une IA »"), "{error}");
    world.allow(&["Travail"]);
    world.found("replace_in_note", arguments);

    let text = world
        .travail
        .read(&NotePath::parse("devis.md").unwrap())
        .unwrap()
        .content;
    assert_eq!(text, "# Devis\n\nLe prix.");
}

#[test]
fn replacing_a_text_in_a_workspace_that_is_not_allowed_writes_nothing() {
    let world = world();
    world.allow(&["Travail"]);

    let error = world.refused(
        "replace_in_note",
        json!({ "path": "pain.md", "old_text": "La farine.", "new_text": "X", "workspace": "Notes" }),
    );

    assert_eq!(
        error,
        "aucun espace de travail autorisé ne s'appelle « Notes » ; ceux que les IA peuvent \
         utiliser : « Travail »"
    );
    assert!(has(&world.notes, "pain.md"));
    let text = world
        .notes
        .read(&NotePath::parse("pain.md").unwrap())
        .unwrap()
        .content;
    assert_eq!(text, "# Pain\n\nLa farine.");
}
