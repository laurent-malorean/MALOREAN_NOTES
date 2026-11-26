//! L'outil `search_notes` dit combien de fois les mots cherchés sont trouvés dans chaque note
//! (`matches`), pour juger la pertinence (fiche 0086).

use serde_json::json;

use super::tests::{found, notes_workspace, opened, paths};

#[test]
fn a_result_gives_the_number_of_occurrences_of_the_words_in_the_whole_note() {
    let long = "a".repeat(400);
    let session = opened(&[
        (
            "anatomie.md",
            "# Anatomie\nL'anatomy du corps, Tomy et tomyx",
        ),
        ("loin.md", &format!("# Loin\ntomy {long} TOMY")),
        ("autre.md", "# Autre\nrien"),
    ]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();

    let result = found(&session, key, "search_notes", json!({ "query": "tomy" }));

    let mut by_path: Vec<(&str, i64)> = result
        .as_array()
        .unwrap()
        .iter()
        .map(|note| {
            (
                note["path"].as_str().unwrap(),
                note["matches"].as_i64().unwrap(),
            )
        })
        .collect();
    by_path.sort_unstable();
    assert_eq!(by_path, [("anatomie.md", 3), ("loin.md", 2)]);
}

#[test]
fn the_real_shape_of_a_result_carries_matches_next_to_the_excerpt() {
    let session = opened(&[(
        "a.md",
        "---\ntags: [maison]\n---\n# Alpha\ndu pain frais, Pain",
    )]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();

    let result = found(&session, key, "search_notes", json!({ "query": "pain" }));

    assert_eq!(
        result,
        json!([{ "path": "a.md", "title": "Alpha", "folder": "", "tags": ["maison"],
                 "excerpt": "# Alpha du pain frais, Pain", "matches": 2 }])
    );
}

#[test]
fn without_words_there_is_no_count() {
    let session = opened(&[("a.md", "---\ntags: [maison]\n---\n# Alpha\npain")]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();

    for arguments in [
        json!({ "tag": "maison" }),
        json!({ "folder": "" }),
        json!({ "query": "   ", "tag": "maison" }),
    ] {
        let result = found(&session, key, "search_notes", arguments);
        assert_eq!(paths(&result), ["a.md"]);
        assert!(result[0].get("matches").is_none());
    }
}

#[test]
fn a_tag_filter_does_not_stop_the_count() {
    let session = opened(&[("a.md", "---\ntags: [maison]\n---\n# Alpha\npain pain")]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();

    let result = found(
        &session,
        key,
        "search_notes",
        json!({ "query": "pain", "tag": "maison" }),
    );

    assert_eq!(result[0]["matches"], 2);
}

#[test]
fn a_mind_map_node_gives_its_count_too() {
    let session = opened(&[(
        "carte.md",
        "---\ntype: carte-mentale\n---\n# Carte\n\n- Racine\n  - Anatomy et tomy\n",
    )]);
    let tools = session.open_tools(notes_workspace()).unwrap();
    let key = tools.key().as_str();

    let result = found(&session, key, "search_notes", json!({ "query": "tomy" }));

    let nodes: Vec<_> = result
        .as_array()
        .unwrap()
        .iter()
        .filter(|note| note.get("node").is_some())
        .collect();
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0]["matches"], 2);
}

#[test]
fn the_description_says_that_a_word_is_also_found_inside_a_longer_word() {
    let described = super::catalog::tool_description(super::AppTool::SearchNotes);
    let description = described["description"].as_str().unwrap();
    let query = described["inputSchema"]["properties"]["query"]["description"]
        .as_str()
        .unwrap();
    for phrase in [
        "à l'intérieur d'un mot plus long",
        "« tomy » trouve « anatomy »",
        "majuscules et accents ignorés",
        "`matches`",
        "nombre d'occurrences",
        "`read_note`",
    ] {
        assert!(description.contains(phrase), "{phrase} : {description}");
    }
    assert!(
        query.contains("à l'intérieur d'un mot plus long"),
        "{query}"
    );
}
