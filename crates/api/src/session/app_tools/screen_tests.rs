//! Les outils de l'application qui touchent à l'interface, joués par leur protocole avec une
//! fausse interface (fiche 0040).

use std::sync::{Arc, Mutex, OnceLock, Weak};

use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};
use serde_json::json;

use super::AppScreen;
use super::tests::{found, notes_workspace, refused};
use crate::session::Session;

/// Une interface qui garde les notes montrées et les demandes reçues ; avec `answer`, elle répond
/// aussitôt à chaque demande de ce que l'utilisateur regarde.
#[derive(Debug, Default)]
struct FakeScreen {
    session: OnceLock<Weak<Session>>,
    answer: Option<(Option<String>, String)>,
    shown: Mutex<Vec<String>>,
    asked: Mutex<Vec<u64>>,
}

impl AppScreen for FakeScreen {
    fn show_note(&self, path: &str) {
        self.shown.lock().unwrap().push(path.to_owned());
    }

    fn ask_view(&self, request: u64) {
        self.asked.lock().unwrap().push(request);
        let session = self.session.get().and_then(Weak::upgrade);
        if let (Some(session), Some((note, selection))) = (session, self.answer.clone()) {
            session.answer_view(request, note, selection);
        }
    }
}

fn with_screen(notes: &[(&str, &str)], screen: FakeScreen) -> (Arc<Session>, Arc<FakeScreen>) {
    let screen = Arc::new(screen);
    let session = Arc::new(
        Session::new(
            Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(
                notes,
            )))),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        )
        .with_screen(Arc::clone(&screen) as Arc<dyn AppScreen>),
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    screen.session.set(Arc::downgrade(&session)).unwrap();
    (session, screen)
}

fn answering(note: Option<&str>, selection: &str) -> FakeScreen {
    FakeScreen {
        answer: Some((note.map(str::to_owned), selection.to_owned())),
        ..FakeScreen::default()
    }
}

#[test]
fn the_viewed_note_and_its_selection_come_from_the_interface_at_the_time_of_the_call() {
    let (session, screen) = with_screen(
        &[("Travail/a.md", "# Alpha\ndu pain")],
        answering(Some("Travail/a.md"), "du pain"),
    );
    let tools = session.open_tools(notes_workspace(), None).unwrap();
    let key = tools.key().as_str();
    assert_eq!(
        found(&session, key, "viewed_note", json!({})),
        json!({ "workspace": "Notes", "note": { "path": "Travail/a.md", "title": "Alpha" },
                "selection": "du pain" })
    );
    found(&session, key, "viewed_note", json!({}));
    assert_eq!(*screen.asked.lock().unwrap(), [0, 1]);
    assert!(session.views.lock().unwrap().is_empty());
}

#[test]
fn without_an_open_note_the_viewed_note_is_none() {
    for note in [None, Some("disparue.md"), Some("../x.md")] {
        let (session, _) = with_screen(&[], answering(note, ""));
        let tools = session.open_tools(notes_workspace(), None).unwrap();
        assert_eq!(
            found(&session, tools.key().as_str(), "viewed_note", json!({})),
            json!({ "workspace": "Notes", "note": null, "selection": "" })
        );
    }
}

#[test]
fn an_interface_that_does_not_answer_makes_the_tool_fail_in_time() {
    let (session, screen) = with_screen(&[], FakeScreen::default());
    let tools = session.open_tools(notes_workspace(), None).unwrap();
    assert_eq!(
        refused(&session, tools.key().as_str(), "viewed_note", json!({})),
        "l'interface n'a pas répondu : réessayez"
    );
    assert!(session.views.lock().unwrap().is_empty());
    // Une réponse arrivée trop tard, ou à une demande inconnue, ne change rien.
    session.answer_view(screen.asked.lock().unwrap()[0], None, String::new());
    session.answer_view(99, None, String::new());
}

#[test]
fn a_note_is_shown_to_the_user_only_if_it_exists() {
    let (session, screen) = with_screen(&[("a.md", "# A")], FakeScreen::default());
    let tools = session.open_tools(notes_workspace(), None).unwrap();
    let key = tools.key().as_str();
    assert_eq!(
        found(&session, key, "show_note", json!({ "path": "a.md" })),
        json!({ "shown": "a.md" })
    );
    assert!(refused(&session, key, "show_note", json!({ "path": "b.md" })).contains("b.md"));
    assert_eq!(
        refused(&session, key, "show_note", json!({})),
        "il manque « path »"
    );
    assert_eq!(*screen.shown.lock().unwrap(), ["a.md"]);
}

#[test]
fn without_an_interface_the_screen_tools_say_so() {
    let session = super::tests::opened(&[("a.md", "# A")]);
    let tools = session.open_tools(notes_workspace(), None).unwrap();
    let key = tools.key().as_str();
    let absent = "l'interface de MALOREAN Notes n'est pas là pour répondre";
    assert_eq!(refused(&session, key, "viewed_note", json!({})), absent);
    assert_eq!(
        refused(&session, key, "show_note", json!({ "path": "a.md" })),
        absent
    );
}
