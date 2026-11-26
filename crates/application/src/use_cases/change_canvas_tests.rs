use domain::Moment;
use domain::canvas_edit::{CanvasEditError, NewCard};

use super::*;
use crate::MemoryHistory;
use crate::testing::{FixedClock, InMemoryNoteStore};
use domain::canvas::CardKind;

fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

fn clock() -> FixedClock {
    FixedClock::at(Moment::new(2026, 11, 26, 14, 30).unwrap())
}

const EMPTY: &str = "{\n\t\"nodes\":[],\n\t\"edges\":[]\n}";

fn card(id: &str, x: i64) -> String {
    format!(r#"{{"id":"{id}","type":"text","text":"","x":{x},"y":0,"width":1,"height":1}}"#)
}

fn add_text(canvas: &mut Canvas) -> Result<String, CanvasEditError> {
    canvas.add_card(NewCard {
        kind: CardKind::Text {
            text: "Neuf".into(),
        },
        x: 5,
        y: 6,
        width: None,
        height: None,
        color: None,
    })
}

#[test]
fn a_gesture_is_saved_as_obsidian_writes_it_and_gives_back_what_it_returned() {
    let store = InMemoryNoteStore::with_notes(&[("p.canvas", EMPTY)]);
    let history = MemoryHistory::default();

    let changed = ChangeCanvas::new(&store, &history, &clock())
        .execute(&path("p.canvas"), add_text)
        .unwrap();

    assert_eq!(changed.saved.canvas.cards[0].id, changed.outcome);
    let written = store.read(&path("p.canvas")).unwrap().content;
    assert_eq!(written, changed.saved.text);
    assert_eq!(written, changed.saved.canvas.to_text());
    assert!(written.contains(r#""text":"Neuf","x":5,"y":6,"width":250,"height":60"#));
}

#[test]
fn the_text_before_the_change_is_kept_as_a_version_that_restores_it() {
    let store = InMemoryNoteStore::with_notes(&[("p.canvas", EMPTY)]);
    let history = MemoryHistory::default();

    ChangeCanvas::new(&store, &history, &clock())
        .execute(&path("p.canvas"), add_text)
        .unwrap();

    let versions = history.versions(&path("p.canvas")).unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(
        history
            .read_version(&path("p.canvas"), &versions[0])
            .unwrap(),
        EMPTY
    );
}

#[test]
fn a_gesture_that_changes_nothing_writes_and_keeps_nothing() {
    let text = Canvas::parse(&format!(r#"{{"nodes":[{}]}}"#, card("a", 3)))
        .unwrap()
        .to_text();
    let store = InMemoryNoteStore::with_notes(&[("p.canvas", &text)]);
    let history = MemoryHistory::default();
    let before = store.read(&path("p.canvas")).unwrap();

    let changed = ChangeCanvas::new(&store, &history, &clock())
        .execute(&path("p.canvas"), |canvas| canvas.move_card("a", 3, 0))
        .unwrap();

    assert_eq!(changed.outcome, ["a"]);
    assert_eq!(store.read(&path("p.canvas")).unwrap(), before);
    assert!(history.versions(&path("p.canvas")).unwrap().is_empty());
}

#[test]
fn a_refused_gesture_writes_and_keeps_nothing_and_says_why() {
    let store = InMemoryNoteStore::with_notes(&[("p.canvas", EMPTY)]);
    let history = MemoryHistory::default();

    let refused = ChangeCanvas::new(&store, &history, &clock())
        .execute(&path("p.canvas"), |canvas| canvas.remove_card("zz"))
        .unwrap_err();

    assert!(matches!(refused, AppError::CanvasEditRefused(_)));
    assert!(
        refused
            .to_string()
            .starts_with("la carte « zz » n'existe pas")
    );
    assert_eq!(store.read(&path("p.canvas")).unwrap().content, EMPTY);
    assert!(history.versions(&path("p.canvas")).unwrap().is_empty());
}

#[test]
fn a_file_that_is_not_a_valid_canvas_is_refused_and_left_alone() {
    let store = InMemoryNoteStore::with_notes(&[("n.md", "# N"), ("bad.canvas", "pas du json")]);
    let history = MemoryHistory::default();
    let clock = clock();
    let change = ChangeCanvas::new(&store, &history, &clock);

    assert!(matches!(
        change.execute(&path("n.md"), add_text),
        Err(AppError::NotACanvas)
    ));
    assert!(matches!(
        change.execute(&path("bad.canvas"), add_text),
        Err(AppError::InvalidCanvas(_))
    ));
    assert!(matches!(
        change.execute(&path("absent.canvas"), add_text),
        Err(AppError::NoteNotFound(_))
    ));
    assert_eq!(
        store.read(&path("bad.canvas")).unwrap().content,
        "pas du json"
    );
    assert_eq!(store.read(&path("n.md")).unwrap().content, "# N");
}

#[test]
fn the_unknown_properties_and_the_tags_of_the_file_are_kept() {
    let text = r#"{"nodes":[{"id":"a","type":"text","text":"","x":0,"y":0,"width":1,"height":1,"inconnu":{"k":[1,2]}}],"tags":["idées"],"autre":true}"#;
    let store = InMemoryNoteStore::with_notes(&[("p.canvas", text)]);
    let history = MemoryHistory::default();

    ChangeCanvas::new(&store, &history, &clock())
        .execute(&path("p.canvas"), add_text)
        .unwrap();

    let written = store.read(&path("p.canvas")).unwrap().content;
    for kept in [
        r#""inconnu":{"k":[1,2]}"#,
        r#""tags":["idées"]"#,
        r#""autre":true"#,
    ] {
        assert!(written.contains(kept), "{kept} : {written}");
    }
}

#[test]
fn a_change_made_in_the_file_meanwhile_is_merged_not_lost() {
    // Le geste lit le fichier ; pendant qu'il s'applique, un autre y ajoute une carte.
    let store = InMemoryNoteStore::with_notes(&[("p.canvas", EMPTY)]);
    let history = MemoryHistory::default();
    let elsewhere = Canvas::parse(&format!(r#"{{"nodes":[{}]}}"#, card("t", 9)))
        .unwrap()
        .to_text();

    ChangeCanvas::new(&store, &history, &clock())
        .execute(&path("p.canvas"), |canvas| {
            store.write(&path("p.canvas"), &elsewhere).unwrap();
            add_text(canvas)
        })
        .unwrap();

    let written = Canvas::parse(&store.read(&path("p.canvas")).unwrap().content).unwrap();
    let texts: Vec<&str> = written.cards.iter().map(|c| c.id.as_str()).collect();
    assert_eq!(texts.len(), 2);
    assert!(texts.contains(&"t"));
}

#[test]
fn a_note_a_canvas_an_image_and_a_pdf_of_the_workspace_exist_and_the_rest_does_not() {
    let store = InMemoryNoteStore::with_notes(&[("Idées/n.md", "# N"), ("c.canvas", EMPTY)])
        .with_file("Idées", "photo.png", b"PNG")
        .with_file("", "plan.PDF", b"PDF");
    let history = MemoryHistory::default();
    let clock = clock();
    let change = ChangeCanvas::new(&store, &history, &clock);

    for found in ["Idées/n.md", " c.canvas ", "Idées/photo.png", "plan.PDF"] {
        assert!(change.ensure_file(found).is_ok(), "{found}");
    }
    for absent in [
        "absent.md",
        "Idées/absent.md",
        "Nulle/part.md",
        "Idées/absent.png",
        "Nulle/p.png",
    ] {
        let said = change.ensure_file(absent).unwrap_err().to_string();
        assert!(
            said.contains(&format!("« {absent} » n'existe pas")),
            "{said}"
        );
    }
    for refused in ["liste.txt", "sans-extension", "../x.png", "a/.cache.png"] {
        let said = change.ensure_file(refused).unwrap_err().to_string();
        assert!(
            said.contains("n'est pas un fichier qu'une carte peut montrer"),
            "{refused} : {said}"
        );
    }
}
