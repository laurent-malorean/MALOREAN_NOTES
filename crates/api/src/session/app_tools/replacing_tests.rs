//! L'outil `replace_in_note`, joué par son protocole sur des faux (fiche 0075) : le remplacement
//! d'un texte, ses refus dits à l'IA, les règles de la saisie (version, index, titre, en-tête).

use serde_json::{Value, json};

use super::tests::{found, notes_workspace, opened, paths, refused};
use crate::session::Session;

/// Joue l'outil pendant un tour ; rend ce qu'il rend, lu en JSON.
fn done(session: &Session, arguments: Value) -> Value {
    let tools = session.open_tools(notes_workspace()).unwrap();
    found(session, tools.key().as_str(), "replace_in_note", arguments)
}

/// Joue l'outil, qui échoue ; rend pourquoi.
fn failed(session: &Session, arguments: Value) -> String {
    let tools = session.open_tools(notes_workspace()).unwrap();
    refused(session, tools.key().as_str(), "replace_in_note", arguments)
}

fn text(session: &Session, path: &str) -> String {
    session.read_note(path).unwrap().content
}

fn replace(path: &str, old: &str, new: &str) -> Value {
    json!({ "path": path, "old_text": old, "new_text": new })
}

#[test]
fn a_text_is_replaced_and_the_tool_gives_the_path_the_title_and_the_count() {
    let session = opened(&[(
        "a.md",
        "---\ntags: [x]\n---\n# Pain\n\nLa farine.\nLe sel.\n",
    )]);

    let result = done(&session, replace("a.md", "La farine.", "Le levain."));

    assert_eq!(
        result,
        json!({ "path": "a.md", "title": "Pain", "replacements": 1 })
    );
    assert_eq!(
        text(&session, "a.md"),
        "---\ntags: [x]\n---\n# Pain\n\nLe levain.\nLe sel.\n"
    );
}

#[test]
fn a_text_is_deleted_by_an_empty_new_text_and_inserted_by_repeating_a_line() {
    let session = opened(&[("a.md", "# T\n\nUn.\n\nTrois.\n")]);

    done(&session, replace("a.md", "Un.\n", "Un.\n\nDeux.\n"));
    assert_eq!(text(&session, "a.md"), "# T\n\nUn.\n\nDeux.\n\nTrois.\n");
    done(&session, replace("a.md", "\nDeux.\n", ""));

    assert_eq!(text(&session, "a.md"), "# T\n\nUn.\n\nTrois.\n");
}

#[test]
fn spaces_and_line_breaks_of_the_texts_are_kept_as_given() {
    let session = opened(&[("a.md", "# T\na  b\nc")]);

    done(&session, replace("a.md", "a  b\n", " x\n\n"));

    assert_eq!(text(&session, "a.md"), "# T\n x\n\nc");
}

#[test]
fn the_text_before_the_change_is_kept_as_a_version() {
    let session = opened(&[("a.md", "# A\nancien")]);

    done(&session, replace("a.md", "ancien", "nouveau"));

    let versions = session.list_versions("a.md").unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(
        session.read_version("a.md", &versions[0].id).unwrap(),
        "# A\nancien"
    );
}

#[test]
fn the_search_index_follows_the_new_text() {
    let session = opened(&[("a.md", "# A\nla farine")]);

    done(&session, replace("a.md", "farine", "levure"));

    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();
    let search = |query: &str| {
        let result = found(&session, key, "search_notes", json!({ "query": query }));
        paths(&result).len()
    };
    assert_eq!(search("levure"), 1);
    assert_eq!(search("farine"), 0);
}

#[test]
fn a_repeated_text_is_refused_with_its_lines_unless_all_the_occurrences_are_asked() {
    let session = opened(&[("a.md", "# A\nun\ndeux\nun\n")]);

    let error = failed(&session, replace("a.md", "un", "1"));

    assert_eq!(
        error,
        "le texte à remplacer (old_text) apparaît 2 fois (lignes 2 et 4) : ajoutez du texte \
         autour pour qu'il n'apparaisse qu'une fois, ou passez replace_all à true pour \
         remplacer toutes les occurrences ; rien n'a été changé"
    );
    assert_eq!(text(&session, "a.md"), "# A\nun\ndeux\nun\n");
    let all = done(
        &session,
        json!({ "path": "a.md", "old_text": "un", "new_text": "1", "replace_all": true }),
    );
    assert_eq!(all["replacements"], 2);
    assert_eq!(text(&session, "a.md"), "# A\n1\ndeux\n1\n");
}

#[test]
fn a_replace_all_that_is_not_true_does_not_replace_every_occurrence() {
    let session = opened(&[("a.md", "# A\nun\nun")]);

    for value in [json!(false), json!("true"), json!(null), json!(1)] {
        let arguments = json!({ "path": "a.md", "old_text": "un", "new_text": "1",
                                "replace_all": value });
        assert!(failed(&session, arguments).contains("apparaît 2 fois"));
    }

    assert_eq!(text(&session, "a.md"), "# A\nun\nun");
}

#[test]
fn a_text_that_is_not_there_empty_or_identical_is_refused_and_nothing_is_written() {
    let session = opened(&[("a.md", "# A\nun")]);

    assert!(failed(&session, replace("a.md", "deux", "x")).contains("introuvable"));
    assert!(failed(&session, replace("a.md", "", "x")).contains("est vide"));
    assert!(failed(&session, replace("a.md", "un", "un")).contains("identique"));

    assert_eq!(text(&session, "a.md"), "# A\nun");
    assert!(session.list_versions("a.md").unwrap().is_empty());
}

#[test]
fn a_missing_argument_is_named() {
    let session = opened(&[("a.md", "# A")]);

    assert_eq!(
        failed(&session, json!({ "old_text": "a", "new_text": "b" })),
        "il manque « path »"
    );
    assert_eq!(
        failed(&session, json!({ "path": "a.md", "new_text": "b" })),
        "il manque « old_text »"
    );
    assert_eq!(
        failed(&session, json!({ "path": "a.md", "old_text": "A" })),
        "il manque « new_text »"
    );
}

#[test]
fn an_invalid_or_missing_note_is_refused() {
    let session = opened(&[("a.md", "# A")]);

    assert_eq!(
        failed(&session, replace("../a.md", "A", "B")),
        session.read_note("../a.md").unwrap_err().message
    );
    assert_eq!(
        failed(&session, replace("b.md", "A", "B")),
        "la note « b.md » n'existe pas"
    );
}

#[test]
fn a_research_notebook_a_mind_map_and_a_canvas_are_refused_untouched() {
    let notebook = "---\ntype: cahier-de-recherche\n---\n# Levures\n";
    let map = "---\ntype: carte-mentale\n---\n# Idées\n- un\n";
    let session = opened(&[("c.md", notebook), ("m.md", map), ("x.canvas", "{}")]);

    assert_eq!(
        failed(&session, replace("c.md", "Levures", "Autre")),
        "cette note est un cahier de recherche : on n'y ajoute que des entrées (add_entry), son \
         texte ne se remplace jamais"
    );
    assert_eq!(
        failed(&session, replace("m.md", "un", "deux")),
        "cette note est une carte mentale : replace_in_note ne change que le texte des notes \
         simples ; lisez la carte avec read_mind_map et modifiez-la avec add_mind_map_child, \
         add_mind_map_sibling, add_mind_map_root, edit_mind_map_node, color_mind_map_node, \
         move_mind_map_node ou delete_mind_map_node"
    );
    let canvas = failed(&session, replace("x.canvas", "{}", "[]"));
    assert!(canvas.starts_with("cette note est un canvas : replace_in_note ne change que"));
    assert!(canvas.contains("read_canvas") && canvas.contains("add_canvas_card"));

    assert_eq!(text(&session, "c.md"), notebook);
    assert_eq!(text(&session, "m.md"), map);
    assert_eq!(text(&session, "x.canvas"), "{}");
}

#[test]
fn a_new_title_renames_the_file_and_the_attachment_links_follow() {
    let session = opened(&[("voyage.md", "# Voyage\n![vue](voyage.assets/vue.png)\n")]);

    let result = done(&session, replace("voyage.md", "# Voyage", "# Lisbonne"));

    assert_eq!(
        result,
        json!({ "path": "lisbonne.md", "title": "Lisbonne", "replacements": 1 })
    );
    assert_eq!(
        text(&session, "lisbonne.md"),
        "# Lisbonne\n![vue](lisbonne.assets/vue.png)\n"
    );
    assert!(session.read_note("voyage.md").is_err());
}

#[test]
fn a_text_that_is_not_the_title_keeps_the_file_name_even_if_it_differs_from_the_title() {
    let session = opened(&[("notes-du-lundi.md", "# Réunion\nPoint un")]);

    let result = done(
        &session,
        replace("notes-du-lundi.md", "Point un", "Point deux"),
    );

    assert_eq!(result["path"], "notes-du-lundi.md");
    assert_eq!(result["title"], "Réunion");
}

#[test]
fn a_crm_and_its_fiches_are_refused_untouched_and_sent_to_the_crm_tools() {
    let crm = "---\ntype: crm\n---\n# Clients\n";
    let action = "---\ntype: crm-action\n---\n# Appeler\n";
    let session = opened(&[("clients.md", crm), ("clients/actions/a.md", action)]);

    let said_crm = failed(&session, replace("clients.md", "Clients", "Autre"));
    let said_action = failed(
        &session,
        replace("clients/actions/a.md", "Appeler", "Autre"),
    );

    assert!(said_crm.starts_with("cette note est un CRM : replace_in_note ne change que"));
    assert!(said_action.starts_with(
        "cette note est une fiche de CRM, de type « crm-action » : replace_in_note ne change que"
    ));
    for said in [said_crm, said_action] {
        assert!(
            said.contains("read_crm") && said.contains("change_crm_action"),
            "{said}"
        );
    }
    assert_eq!(text(&session, "clients.md"), crm);
    assert_eq!(text(&session, "clients/actions/a.md"), action);
}
