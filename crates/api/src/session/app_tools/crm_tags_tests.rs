//! Les étiquettes d'un CRM et de ses fiches par les outils `add_tags` et `remove_tags` (fiches 0070
//! et 0081) : seule la propriété `tags` change, le reste du fichier reste identique.

use serde_json::json;

use super::crm_actions_tests::{action, done, fiche};
use super::crm_reading_tests::{CRM, DEVIS, DEVIS_PATH, DEVIS_REF, REFONTE, clients};

const REFONTE_PATH: &str = "clients/projets/refonte.md";

#[test]
fn the_tags_of_an_action_are_added_and_removed_and_only_the_tags_line_changes() {
    let session = clients();

    let added = done(
        &session,
        "add_tags",
        json!({ "path": DEVIS_PATH, "tags": ["salon", "#Urgent", "devis"] }),
    );
    let removed = done(
        &session,
        "remove_tags",
        json!({ "path": DEVIS_PATH, "tags": ["urgent"] }),
    );

    assert_eq!(
        added,
        json!({ "path": DEVIS_PATH, "tags": ["urgent", "salon", "devis"] })
    );
    assert_eq!(
        removed,
        json!({ "path": DEVIS_PATH, "tags": ["salon", "devis"] })
    );
    let after = fiche(&session, DEVIS_PATH);
    assert_eq!(
        after.replace("tags: [salon, devis]", "tags: [urgent]"),
        DEVIS
    );
}

#[test]
fn the_tags_of_an_action_are_seen_by_read_crm_by_its_filter_and_by_the_search() {
    let session = clients();
    done(
        &session,
        "add_tags",
        json!({ "path": DEVIS_PATH, "tags": ["salon"] }),
    );

    assert_eq!(
        action(&session, DEVIS_REF)["tags"],
        json!(["urgent", "salon"])
    );
    let read = done(
        &session,
        "read_crm",
        json!({ "path": "clients.md", "tags": ["salon"] }),
    );
    assert_eq!(read["columns"][1]["actions"][0]["ref"], DEVIS_REF);
    assert_eq!(read["tags"], json!(["salon", "urgent"]));
    let found = done(
        &session,
        "search_notes",
        json!({ "tag": "salon", "content_type": "crm-action" }),
    );
    assert_eq!(found[0]["path"], DEVIS_PATH);
}

#[test]
fn the_tags_of_a_project_are_changed_and_read_crm_gives_them() {
    let session = clients();

    let added = done(
        &session,
        "add_tags",
        json!({ "path": REFONTE_PATH, "tags": ["site"] }),
    );
    done(
        &session,
        "remove_tags",
        json!({ "path": REFONTE_PATH, "tags": ["web"] }),
    );

    assert_eq!(added["tags"], json!(["web", "site"]));
    let read = done(&session, "read_crm", json!({ "path": "clients.md" }));
    assert_eq!(read["projects"][0]["tags"], json!(["site"]));
    assert_eq!(
        fiche(&session, REFONTE_PATH),
        REFONTE.replace("tags: [web]", "tags: [site]")
    );
}

#[test]
fn the_tags_of_the_crm_itself_are_changed_without_touching_its_other_properties() {
    let session = clients();

    let added = done(
        &session,
        "add_tags",
        json!({ "path": "clients.md", "tags": ["vip"] }),
    );

    assert_eq!(added["tags"], json!(["b2b", "vip"]));
    assert_eq!(
        fiche(&session, "clients.md"),
        CRM.replace("tags: [b2b]", "tags: [b2b, vip]")
    );
}
