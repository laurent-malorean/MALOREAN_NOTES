//! Les outils de l'agenda 12, joués par leur protocole sur des faux (fiche 0104) : mêmes cas
//! d'usage et mêmes refus que l'écran ; l'ordre est celui de la grille.

use serde_json::{Value, json};

use super::canvas_changing_tests::{done, failed};
use super::tests::opened;

const NOTES: [(&str, &str); 9] = [
    (
        "pro/salons.md",
        "---\ntype: agenda-12\ncolonnes: 6\n---\n# Salons\n",
    ),
    (
        "pro/salons/embedded.md",
        "---\ntype: agenda-12-evenement\nmois: 2\njour: 10\nannee: 2027\njour-fin: 13\npays: DE\nville: Nuremberg\ntags: [salon]\n---\n# Salon Embedded World\n\nStand 4A-110.\n",
    ),
    (
        "pro/salons/domaines.md",
        "---\ntype: agenda-12-evenement\nmois: 2\nannee: 2029\n---\n# Renouveler malorean.fr\n",
    ),
    (
        "pro/salons/audit.md",
        "---\ntype: agenda-12-evenement\nmois: 1\njour: 15\n---\n# Audit ISO\n",
    ),
    (
        "pro/salons/archives/passe.md",
        "---\ntype: agenda-12-evenement\nmois: 3\nclos-le: 2026-03-01\n---\n# Salon passé\n",
    ),
    (
        "pro/salons/sans-mois.md",
        "---\ntype: agenda-12-evenement\n---\n# Sans mois\n",
    ),
    ("pro/salons/note.md", "# Ordinaire\n"),
    ("pro/autre.md", "# Autre\n"),
    ("pro/crm.md", "---\ntype: crm\n---\n# CRM\n"),
];

fn titles(cell: &Value) -> Vec<&str> {
    cell["events"]
        .as_array()
        .unwrap()
        .iter()
        .map(|event| event["title"].as_str().unwrap())
        .collect()
}

#[test]
fn read_agenda_12_gives_the_twelve_cells_in_the_order_of_the_grid() {
    let session = opened(&NOTES);
    let read = done(
        &session,
        "read_agenda_12",
        json!({ "path": "pro/salons.md" }),
    );
    let cells = read["cells"].as_array().unwrap();
    assert_eq!(cells.len(), 12);
    let months: Vec<u64> = cells.iter().map(|c| c["month"].as_u64().unwrap()).collect();
    assert_eq!(months, (1..=12).collect::<Vec<u64>>());
    assert_eq!(cells[0]["name"], "janvier");
    assert_eq!(cells[11]["name"], "décembre");
    assert_eq!(titles(&cells[0]), ["Audit ISO"]);
    assert_eq!(
        titles(&cells[1]),
        ["Salon Embedded World", "Renouveler malorean.fr"]
    );
    assert!(titles(&cells[2]).is_empty());
}

#[test]
fn read_agenda_12_gives_the_title_the_columns_and_the_tags_of_the_filter() {
    let session = opened(&NOTES);
    let read = done(
        &session,
        "read_agenda_12",
        json!({ "path": "pro/salons.md" }),
    );
    assert_eq!(read["path"], "pro/salons.md");
    assert_eq!(read["title"], "Salons");
    assert_eq!(read["columns"], 6);
    assert_eq!(read["tags"], json!(["salon"]));
}

#[test]
fn read_agenda_12_leaves_aside_what_it_does_not_read_and_says_nothing_when_complete() {
    let session = opened(&NOTES);
    let read = done(
        &session,
        "read_agenda_12",
        json!({ "path": "pro/salons.md" }),
    );
    assert!(read.get("archives").is_none());
    assert_eq!(read["unreadable"], json!(["pro/salons/sans-mois.md"]));
    assert!(read.get("truncated").is_none());
    assert!(read.get("message").is_none());
}

#[test]
fn an_event_is_read_with_its_fields_and_what_is_empty_is_missing() {
    let session = opened(&NOTES);
    let read = done(
        &session,
        "read_agenda_12",
        json!({ "path": "pro/salons.md" }),
    );
    assert_eq!(
        read["cells"][1]["events"][0],
        json!({
            "path": "pro/salons/embedded.md",
            "title": "Salon Embedded World",
            "month": 2, "day": 10, "year": 2027, "end_day": 13, "end_month": 2,
            "country": "DE", "country_name": "Allemagne", "city": "Nuremberg",
            "tags": ["salon"],
            "line": "10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World",
        })
    );
    assert_eq!(
        read["cells"][0]["events"][0],
        json!({ "path": "pro/salons/audit.md", "title": "Audit ISO", "month": 1, "day": 15,
                "line": "15/01 – Audit ISO" })
    );
}

#[test]
fn the_archives_are_added_on_request_with_their_closing_day() {
    let session = opened(&NOTES);
    let read = done(
        &session,
        "read_agenda_12",
        json!({ "path": "pro/salons.md", "include_archives": true }),
    );
    assert_eq!(
        read["archives"],
        json!([{ "path": "pro/salons/archives/passe.md", "title": "Salon passé", "month": 3,
                 "closed_on": "2026-03-01", "line": "Salon passé" }])
    );
    let without = done(
        &session,
        "read_agenda_12",
        json!({ "path": "pro/salons.md", "include_archives": false }),
    );
    assert!(without.get("archives").is_none());
}

#[test]
fn the_tag_filter_keeps_only_the_events_that_carry_the_tag() {
    let session = opened(&NOTES);
    let read = done(
        &session,
        "read_agenda_12",
        json!({ "path": "pro/salons.md", "tag": "Salon" }),
    );
    assert_eq!(titles(&read["cells"][1]), ["Salon Embedded World"]);
    assert!(titles(&read["cells"][0]).is_empty());
}

#[test]
fn reading_a_note_that_is_not_an_agenda_is_refused_and_so_is_a_missing_path() {
    let session = opened(&NOTES);
    assert_eq!(
        failed(
            &session,
            "read_agenda_12",
            json!({ "path": "pro/autre.md" })
        ),
        "cette note n'est pas un agenda 12"
    );
    assert_eq!(
        failed(&session, "read_agenda_12", json!({})),
        "il manque « path »"
    );
    assert_eq!(
        failed(
            &session,
            "read_agenda_12",
            json!({ "path": "pro/salons.md", "include_archives": "oui" })
        ),
        "« include_archives » est true ou false"
    );
}

#[test]
fn a_huge_agenda_is_cut_cleanly_and_the_cut_is_told() {
    let long = "x".repeat(900);
    let mut notes: Vec<(String, String)> = vec![(
        "salons.md".to_owned(),
        "---\ntype: agenda-12\n---\n# Salons\n".to_owned(),
    )];
    for number in 0..120 {
        notes.push((
            format!("salons/e{number:03}.md"),
            format!(
                "---\ntype: agenda-12-evenement\nmois: 1\nville: {long}\n---\n# Événement {number:03}\n"
            ),
        ));
    }
    let refs: Vec<(&str, &str)> = notes
        .iter()
        .map(|(p, c)| (p.as_str(), c.as_str()))
        .collect();
    let session = opened(&refs);
    let read = done(&session, "read_agenda_12", json!({ "path": "salons.md" }));
    assert_eq!(read["truncated"], true);
    let kept = read["cells"][0]["events"].as_array().unwrap().len();
    assert!(kept > 0 && kept < 120, "{kept}");
    let message = read["message"].as_str().unwrap();
    assert!(
        message.contains(&format!("{} événement(s) ne sont pas rendus", 120 - kept)),
        "{message}"
    );
    assert!(message.contains("60000"), "{message}");
    let text = serde_json::to_string(&read).unwrap();
    assert!(text.chars().count() < 70_000, "{}", text.chars().count());
}

#[test]
fn add_agenda_12_event_creates_the_event_like_the_screen() {
    let session = opened(&NOTES);
    let added = done(
        &session,
        "add_agenda_12_event",
        json!({ "path": "pro/salons.md", "title": "Vivatech", "month": 5, "day": 30, "year": 2027,
                "end_day": 2, "end_month": 6, "country": "fr", "city": "Paris",
                "tags": ["salon", "pro"] }),
    );
    assert_eq!(added["path"], "pro/salons/vivatech.md");
    assert_eq!(added["agenda"], "pro/salons.md");
    assert_eq!(
        added["event"]["line"],
        "30/05 → 02/06 [2027] – 🇫🇷 (Paris) – Vivatech"
    );
    assert_eq!(added["event"]["end_month"], 6);
    let text = session.read_note("pro/salons/vivatech.md").unwrap().content;
    assert_eq!(
        text,
        "---\ntype: agenda-12-evenement\nmois: 5\njour: 30\nannee: 2027\njour-fin: 2\nmois-fin: 6\npays: FR\nville: Paris\ntags: [salon, pro]\n---\n# Vivatech\n"
    );
}

#[test]
fn the_end_month_defaults_to_the_month_of_the_start() {
    let session = opened(&NOTES);
    let added = done(
        &session,
        "add_agenda_12_event",
        json!({ "path": "pro/salons.md", "title": "Congrès", "month": 9, "day": 3, "end_day": 5 }),
    );
    assert_eq!(added["event"]["line"], "03–05/09 – Congrès");
    assert_eq!(added["event"]["end_month"], 9);
}

#[test]
fn an_event_with_only_a_title_and_a_month_is_created_in_that_cell() {
    let session = opened(&NOTES);
    let added = done(
        &session,
        "add_agenda_12_event",
        json!({ "path": "pro/salons.md", "title": "Audit qualité", "month": 11 }),
    );
    assert_eq!(added["event"]["month"], 11);
    let read = done(
        &session,
        "read_agenda_12",
        json!({ "path": "pro/salons.md" }),
    );
    assert_eq!(titles(&read["cells"][10]), ["Audit qualité"]);
}

/// Les arguments d'un événement valable de février, avec ceux que le test change.
fn february(extra: Value) -> Value {
    let mut base = json!({ "path": "pro/salons.md", "title": "T", "month": 2 });
    for (key, value) in extra.as_object().unwrap() {
        base[key] = value.clone();
    }
    base
}

fn refused_with(extra: Value) -> String {
    failed(&opened(&NOTES), "add_agenda_12_event", february(extra))
}

#[test]
fn adding_an_event_with_an_impossible_date_is_refused_with_the_messages_of_the_screen() {
    let no_day = "Ce jour n'existe pas dans ce mois.";
    assert_eq!(refused_with(json!({ "day": 31 })), no_day);
    assert_eq!(refused_with(json!({ "day": 29, "year": 2027 })), no_day);
    assert_eq!(
        refused_with(json!({ "end_day": 5 })),
        "La fin exige un jour de début."
    );
    assert_eq!(
        refused_with(json!({ "day": 10, "end_day": 5 })),
        "La fin est avant le début."
    );
    assert_eq!(
        refused_with(json!({ "year": 0 })),
        "L'année doit être comprise entre 1 et 9999."
    );
    assert_eq!(
        refused_with(json!({ "end_month": 3 })),
        "« end_month » exige « end_day »"
    );
}

#[test]
fn adding_an_event_with_a_wrong_month_country_or_title_is_refused() {
    assert_eq!(
        refused_with(json!({ "month": 13 })),
        "« 13 » n'est pas un mois : un nombre de 1 (janvier) à 12 (décembre) est attendu."
    );
    assert_eq!(
        refused_with(json!({ "country": "ZZ" })),
        "« ZZ » n'est pas un pays connu : un code sur deux lettres (FR, DE, US…) est attendu."
    );
    assert_eq!(
        refused_with(json!({ "title": "  " })),
        "il manque « title »"
    );
    assert_eq!(
        refused_with(json!({ "month": null })),
        "il manque « month » : un nombre de 1 à 12"
    );
}

#[test]
fn adding_an_event_with_badly_typed_arguments_is_refused() {
    assert_eq!(
        refused_with(json!({ "day": "dix" })),
        "« day » doit être un entier"
    );
    assert_eq!(
        refused_with(json!({ "day": -3 })),
        "« day » doit être un entier positif"
    );
    assert_eq!(
        refused_with(json!({ "tags": "salon" })),
        "« tags » est une liste de textes"
    );
    assert_eq!(
        refused_with(json!({ "tags": [3] })),
        "« tags » est une liste de textes"
    );
}

#[test]
fn adding_an_event_to_a_note_that_is_not_an_agenda_is_refused_and_nothing_is_written() {
    let session = opened(&NOTES);
    assert_eq!(
        failed(
            &session,
            "add_agenda_12_event",
            json!({ "path": "pro/autre.md", "title": "T", "month": 2 })
        ),
        "cette note n'est pas un agenda 12"
    );
    assert!(session.read_note("pro/salons/t.md").is_err());
}

#[test]
fn close_agenda_12_event_moves_the_event_to_the_archives() {
    let session = opened(&NOTES);
    let closed = done(
        &session,
        "close_agenda_12_event",
        json!({ "path": "pro/salons/audit.md" }),
    );
    assert_eq!(
        closed,
        json!({ "closed": "pro/salons/archives/audit.md", "successor": null })
    );
    let read = done(
        &session,
        "read_agenda_12",
        json!({ "path": "pro/salons.md", "include_archives": true }),
    );
    assert!(titles(&read["cells"][0]).is_empty());
    assert_eq!(read["archives"].as_array().unwrap().len(), 2);
}

#[test]
fn closing_with_prepare_next_creates_the_copy_in_the_grid() {
    let session = opened(&NOTES);
    let closed = done(
        &session,
        "close_agenda_12_event",
        json!({ "path": "pro/salons/embedded.md", "prepare_next": true }),
    );
    assert_eq!(
        closed,
        json!({ "closed": "pro/salons/archives/embedded.md",
                "successor": "pro/salons/salon-embedded-world.md" })
    );
    let copy = session
        .read_note("pro/salons/salon-embedded-world.md")
        .unwrap()
        .content;
    assert_eq!(
        copy,
        "---\ntype: agenda-12-evenement\nmois: 2\npays: DE\nville: Nuremberg\ntags: [salon]\n---\n# Salon Embedded World\n"
    );
}

#[test]
fn closing_is_refused_for_a_closed_gone_or_foreign_note() {
    let session = opened(&NOTES);
    let refused = |path: &str| failed(&session, "close_agenda_12_event", json!({ "path": path }));
    assert_eq!(
        refused("pro/salons/archives/passe.md"),
        "Cet événement est déjà clos."
    );
    assert_eq!(
        refused("pro/salons/absent.md"),
        "Cet événement n'existe plus."
    );
    assert_eq!(
        refused("pro/salons/note.md"),
        "cette note n'est pas un événement d'un agenda 12"
    );
    assert_eq!(
        failed(
            &session,
            "close_agenda_12_event",
            json!({ "path": "pro/salons/audit.md", "prepare_next": "oui" })
        ),
        "« prepare_next » est true ou false"
    );
    assert!(session.read_note("pro/salons/audit.md").is_ok());
}

#[test]
fn the_text_of_an_event_is_read_and_written_with_the_tools_of_the_notes() {
    let session = opened(&NOTES);
    let read = done(
        &session,
        "read_note",
        json!({ "path": "pro/salons/embedded.md" }),
    );
    assert!(read["body"].as_str().unwrap().contains("Stand 4A-110."));
    done(
        &session,
        "replace_in_note",
        json!({ "path": "pro/salons/embedded.md", "old_text": "Stand 4A-110.", "new_text": "Stand 5B-200." }),
    );
    let text = session.read_note("pro/salons/embedded.md").unwrap().content;
    assert!(text.contains("Stand 5B-200."));
    assert!(text.contains("mois: 2\n"));
}

#[test]
fn the_agenda_itself_is_refused_by_the_text_tools_and_sent_to_its_own() {
    let session = opened(&NOTES);
    let said = failed(&session, "read_note", json!({ "path": "pro/salons.md" }));
    assert!(said.contains("read_agenda_12"), "{said}");
    let said = failed(
        &session,
        "replace_in_note",
        json!({ "path": "pro/salons.md", "old_text": "Salons", "new_text": "X" }),
    );
    assert!(said.contains("read_agenda_12"), "{said}");
}

#[test]
fn the_search_finds_an_event_and_an_agenda_with_their_type_and_the_path_of_the_agenda() {
    let session = opened(&NOTES);
    let found = done(&session, "search_notes", json!({ "query": "nuremberg" }));
    assert_eq!(
        found[0],
        json!({ "path": "pro/salons/embedded.md", "title": "Salon Embedded World",
                "folder": "pro/salons", "tags": ["salon"], "type": "agenda-12-evenement",
                "agenda": "pro/salons.md", "excerpt": "Nuremberg Allemagne salon # Salon Embedded World Stand 4A-110.", "matches": 1 })
    );
    let events = done(
        &session,
        "search_notes",
        json!({ "content_type": "agenda-12-evenement" }),
    );
    assert_eq!(events.as_array().unwrap().len(), 5);
    let agenda = done(
        &session,
        "search_notes",
        json!({ "content_type": "agenda-12" }),
    );
    assert_eq!(agenda[0]["path"], "pro/salons.md");
    assert_eq!(agenda[0]["type"], "agenda-12");
    assert!(agenda[0].get("agenda").is_none() && agenda[0].get("crm").is_none());
}

#[test]
fn an_unknown_content_type_names_the_agenda_12_types_too() {
    let session = opened(&NOTES);
    let said = failed(
        &session,
        "search_notes",
        json!({ "content_type": "kanban" }),
    );
    assert!(
        said.contains("« agenda-12 », « agenda-12-evenement »"),
        "{said}"
    );
}

#[test]
fn the_agenda_follows_its_events_to_the_trash_and_back() {
    let session = opened(&NOTES);
    let trashed = done(&session, "trash_note", json!({ "path": "pro/salons.md" }));
    assert_eq!(trashed["trashed"], "pro/salons.md");
    assert!(session.read_note("pro/salons/embedded.md").is_err());
    assert!(session.read_note("pro/salons/archives/passe.md").is_err());
}

#[test]
fn the_agenda_tools_are_held_back_by_the_web_guard_when_they_change_something() {
    use domain::app_tools::AppTool;
    assert!(!AppTool::ReadAgenda12.changes_notes());
    assert!(AppTool::AddAgenda12Event.changes_notes());
    assert!(AppTool::CloseAgenda12Event.changes_notes());
}
