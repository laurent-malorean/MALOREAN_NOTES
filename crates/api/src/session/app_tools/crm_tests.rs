//! Les outils de l'application devant un CRM et ses fiches : la recherche et les liens entrants
//! les rendent avec leur type et le chemin de leur CRM (fiche 0061).

use serde_json::json;

use super::tests::{found, notes_workspace, opened, paths};

/// Un CRM et ses fiches, pour les recherches.
const CRM_NOTES: [(&str, &str); 4] = [
    ("clients.md", "---\ntype: crm\ntags: [b2b]\n---\n# Clients"),
    (
        "clients/actions/2026-11-24-devis.md",
        "---\ntype: crm-action\nstatut: TODO\ntags: [urgent]\n---\n# Demande de devis\n\nPour trois postes.",
    ),
    (
        "clients/personnes/jean-dupont.md",
        "---\ntype: crm-personne\nemail: jean@acme.fr\n---\n# Jean Dupont\n\nRencontré au salon.",
    ),
    ("autre.md", "# Autre\n\nTrois postes aussi."),
];

#[test]
fn a_search_finds_the_cards_of_a_crm_with_their_type_and_the_path_of_their_crm() {
    let session = opened(&CRM_NOTES);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();
    let by_words = found(
        &session,
        key,
        "search_notes",
        json!({ "query": "trois postes" }),
    );
    let action = by_words
        .as_array()
        .unwrap()
        .iter()
        .find(|note| note["path"] == "clients/actions/2026-11-24-devis.md")
        .unwrap();
    assert_eq!(
        *action,
        json!({ "path": "clients/actions/2026-11-24-devis.md", "title": "Demande de devis",
                "folder": "clients/actions", "tags": ["urgent"], "type": "crm-action",
                "crm": "clients.md", "excerpt": "Demande de devis Pour trois postes. urgent" })
    );
    let mut found_paths = paths(&by_words);
    found_paths.sort_unstable();
    assert_eq!(
        found_paths,
        ["autre.md", "clients/actions/2026-11-24-devis.md"]
    );
    let plain = by_words
        .as_array()
        .unwrap()
        .iter()
        .find(|note| note["path"] == "autre.md")
        .unwrap();
    assert!(plain.get("type").is_none() && plain.get("crm").is_none());
    let person = found(&session, key, "search_notes", json!({ "query": "salon" }));
    assert_eq!(person[0]["type"], "crm-personne");
    assert_eq!(person[0]["crm"], "clients.md");
}

#[test]
fn a_crm_is_found_itself_with_its_type_and_no_crm_of_its_own() {
    let session = opened(&CRM_NOTES);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();
    let crms = found(
        &session,
        key,
        "search_notes",
        json!({ "tag": "b2b", "content_type": "crm" }),
    );
    assert_eq!(
        crms,
        json!([{ "path": "clients.md", "title": "Clients", "folder": "", "tags": ["b2b"],
                 "type": "crm" }])
    );
    let by_title = found(&session, key, "search_notes", json!({ "query": "clients" }));
    assert_eq!(paths(&by_title), ["clients.md"]);
    let by_tag = found(&session, key, "search_notes", json!({ "tag": "urgent" }));
    assert_eq!(paths(&by_tag), ["clients/actions/2026-11-24-devis.md"]);
}

#[test]
fn a_search_can_keep_to_one_kind_of_card() {
    let session = opened(&CRM_NOTES);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();
    for (kind, expected) in [
        ("crm-action", "clients/actions/2026-11-24-devis.md"),
        ("crm-personne", "clients/personnes/jean-dupont.md"),
    ] {
        let one = found(
            &session,
            key,
            "search_notes",
            json!({ "content_type": kind }),
        );
        assert_eq!(paths(&one), [expected]);
    }
    for kind in ["crm-entreprise", "crm-projet"] {
        let none = found(
            &session,
            key,
            "search_notes",
            json!({ "content_type": kind }),
        );
        assert_eq!(none, json!([]));
    }
    let by_email = found(
        &session,
        key,
        "search_notes",
        json!({ "query": "jean@acme.fr" }),
    );
    assert_eq!(paths(&by_email), ["clients/personnes/jean-dupont.md"]);
}

#[test]
fn the_linking_notes_of_a_note_tell_the_type_and_the_crm_of_a_card() {
    let linked = opened(&[
        ("plan.md", "# Plan"),
        (
            "c/actions/2026-11-24-devis.md",
            "---\ntype: crm-action\nnotes: ['[[Plan]]']\n---\n# Devis",
        ),
    ]);
    let linked_tools = linked.open_tools(notes_workspace()).unwrap();
    assert_eq!(
        found(
            &linked,
            linked_tools.key().as_str(),
            "linking_notes",
            json!({ "path": "plan.md" })
        ),
        json!([{ "path": "c/actions/2026-11-24-devis.md", "title": "Devis",
                 "folder": "c/actions", "type": "crm-action", "crm": "c.md" }])
    );
}
