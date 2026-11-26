//! Les descriptions des outils de l'application (fiche 0040) : nom, schéma de l'entrée, mots que
//! lit l'IA.

use super::*;

/// Le schéma de l'entrée de l'outil, vérifié : un objet, chaque champ décrit, chaque champ
/// exigé connu.
fn checked_schema(tool: AppTool) -> Value {
    let described = tool_description(tool);
    assert_eq!(described["name"], tool.name());
    assert!(!described["description"].as_str().unwrap().is_empty());
    let schema = described["inputSchema"].clone();
    assert_eq!(schema["type"], "object");
    schema
}

#[test]
fn each_tool_is_described_by_its_name_and_an_object_schema() {
    for tool in AppTool::ALL {
        let schema = checked_schema(tool);
        let properties = schema["properties"].as_object().unwrap();
        let unknown = schema["required"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|field| !properties.contains_key(field.as_str().unwrap()))
            .count();
        assert_eq!(unknown, 0, "{tool:?}");
        let kinds: Vec<_> = properties
            .iter()
            .map(|(name, property)| (name.as_str(), property["type"].as_str().unwrap()))
            .collect();
        assert!(kinds.iter().all(|(name, kind)| *kind
            == match *name {
                "tags" => "array",
                "limit" => "integer",
                "replace_all" => "boolean",
                "place_x" | "place_y" => "number",
                _ => "string",
            }));
        assert!(
            properties
                .values()
                .all(|p| !p["description"].as_str().unwrap().is_empty())
        );
    }
}

#[test]
fn each_tool_requires_what_it_cannot_work_without() {
    let path: &[&str] = &["path"];
    let expected: [(AppTool, &[&str]); 35] = [
        (AppTool::ListWorkspaces, &[]),
        (AppTool::SearchNotes, &[]),
        (AppTool::SearchByMeaning, &["question"]),
        (AppTool::ListTags, &[]),
        (AppTool::ListFolders, &[]),
        (AppTool::LinkingNotes, path),
        (AppTool::ReadNote, path),
        (AppTool::ListTemplates, &[]),
        (AppTool::ListVersions, path),
        (AppTool::ReadVersion, &["path", "version"]),
        (AppTool::CreateNote, &["title"]),
        (AppTool::CreateFolder, path),
        (AppTool::RenameFolder, &["path", "name"]),
        (AppTool::MoveFolder, &["path", "folder"]),
        (AppTool::TrashFolder, path),
        (AppTool::CreateNoteFromTemplate, &["template", "title"]),
        (AppTool::TrashNote, path),
        (AppTool::RenameNote, &["path", "title"]),
        (AppTool::MoveNote, &["path", "folder"]),
        (AppTool::RestoreVersion, &["path", "version"]),
        (AppTool::ReplaceInNote, &["path", "old_text", "new_text"]),
        (AppTool::AddTags, &["path", "tags"]),
        (AppTool::RemoveTags, &["path", "tags"]),
        (AppTool::PinNote, path),
        (AppTool::UnpinNote, path),
        (AppTool::AddAttachment, &["path", "file"]),
        (AppTool::AddEntry, &["path", "text"]),
        (AppTool::CreateMindMap, &["title"]),
        (AppTool::ReadMindMap, path),
        (AppTool::AddMindMapChild, &["path", "node", "title"]),
        (AppTool::AddMindMapSibling, &["path", "node", "title"]),
        (AppTool::AddMindMapRoot, &["path", "title"]),
        (AppTool::CreateCrm, &["title"]),
        (AppTool::ViewedNote, &[]),
        (AppTool::ShowNote, path),
    ];
    for (tool, fields) in expected {
        assert_eq!(checked_schema(tool)["required"], json!(fields), "{tool:?}");
    }
}

#[test]
fn the_search_by_meaning_takes_a_question_and_a_limit_and_tells_when_to_use_it() {
    let described = tool_description(AppTool::SearchByMeaning);
    let mut fields: Vec<_> = described["inputSchema"]["properties"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    fields.sort();
    assert_eq!(fields, ["limit", "question", "workspace"]);
    let description = described["description"].as_str().unwrap();
    assert!(description.contains("mots exacts"), "{description}");
    assert!(description.contains("`reason`"), "{description}");
}

#[test]
fn the_searches_say_that_they_find_the_crms_and_their_cards_with_the_path_of_their_crm() {
    for tool in [AppTool::SearchNotes, AppTool::SearchByMeaning] {
        let description = tool_description(tool)["description"]
            .as_str()
            .unwrap()
            .to_owned();
        assert!(
            description.contains("`crm`, le chemin de son CRM"),
            "{description}"
        );
    }
    let described = tool_description(AppTool::SearchNotes);
    let description = described["description"].as_str().unwrap();
    let property = described["inputSchema"]["properties"]["content_type"]["description"]
        .as_str()
        .unwrap();
    for kind in [
        "crm",
        "crm-entreprise",
        "crm-personne",
        "crm-action",
        "crm-projet",
    ] {
        let named = format!("`{kind}`");
        assert!(description.contains(&named), "{kind}");
        assert!(property.contains(&named), "{kind}");
    }
}

#[test]
fn the_linking_notes_tell_that_an_action_links_by_its_notes_and_gives_its_crm() {
    let description = tool_description(AppTool::LinkingNotes)["description"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(description.contains("notes liées, sa description ou un commentaire"));
    assert!(description.contains("`type` et `crm`"));
}

#[test]
fn replacing_a_text_takes_a_note_two_texts_and_an_option_and_tells_every_refusal() {
    let described = tool_description(AppTool::ReplaceInNote);
    let mut fields: Vec<_> = described["inputSchema"]["properties"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    fields.sort();
    assert_eq!(
        fields,
        ["new_text", "old_text", "path", "replace_all", "workspace"]
    );
    let description = described["description"].as_str().unwrap();
    for expected in [
        "historique des versions",
        "à l'identique",
        "jamais un motif",
        "`new_text` vide",
        "introuvable ou vide ou identique",
        "nombre d'occurrences et leurs lignes",
        "`replace_all` à true",
        "cahier de recherche (utilisez `add_entry`)",
        "carte mentale, un canvas ou un CRM",
        "utilisez ensuite le `path` rendu",
        "`path`, `title` et `replacements`",
        "lisez d'abord la note avec `read_note`",
    ] {
        assert!(description.contains(expected), "{expected}");
    }
}

#[test]
fn the_folder_tools_tell_the_ai_their_inputs_what_follows_and_what_is_refused() {
    let fields = |tool: AppTool| -> Vec<String> {
        let mut fields: Vec<_> = tool_description(tool)["inputSchema"]["properties"]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
        fields.sort();
        fields
    };
    assert_eq!(fields(AppTool::ListFolders), ["workspace"]);
    assert_eq!(fields(AppTool::RenameFolder), ["name", "path", "workspace"]);
    assert_eq!(fields(AppTool::MoveFolder), ["folder", "path", "workspace"]);
    assert_eq!(fields(AppTool::TrashFolder), ["path", "workspace"]);
    let said = |tool: AppTool, expected: &[&str]| {
        let description = tool_description(tool)["description"]
            .as_str()
            .unwrap()
            .to_owned();
        for expected in expected {
            assert!(description.contains(expected), "{tool:?}: {expected}");
        }
    };
    said(
        AppTool::ListFolders,
        &["`folders`", "node_modules", "corbeille"],
    );
    said(
        AppTool::RenameFolder,
        &[
            "historique des versions",
            "`[[Dossier/titre]]`",
            "`.assets`",
            "la racine",
        ],
    );
    said(
        AppTool::MoveFolder,
        &[
            "historique des versions",
            "lui-même",
            "du même nom",
            "la racine",
        ],
    );
    said(
        AppTool::TrashFolder,
        &["jamais effacé", "`trashed`", "la racine"],
    );
}

#[test]
fn reading_a_note_takes_a_path_and_tells_the_header_the_limit_and_every_refusal() {
    let described = tool_description(AppTool::ReadNote);
    let mut fields: Vec<_> = described["inputSchema"]["properties"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    fields.sort();
    assert_eq!(fields, ["path", "workspace"]);
    let description = described["description"].as_str().unwrap();
    for expected in [
        "`old_text` de `replace_in_note`",
        "`header`",
        "lignes `---` comprises",
        "`header` suivi de `body` redonne le fichier à l'identique",
        "60 000 caractères",
        "`truncated` vaut alors true et `message` le dit",
        "cahier de recherche (on y ajoute des entrées avec `add_entry`",
        "une carte mentale (lisez-la avec `read_mind_map`), un canvas",
        "introuvable",
    ] {
        assert!(description.contains(expected), "{expected}");
    }
}

#[test]
fn reading_a_mind_map_takes_a_path_and_tells_the_tree_the_limit_and_the_tools_that_change_it() {
    let described = tool_description(AppTool::ReadMindMap);
    let mut fields: Vec<_> = described["inputSchema"]["properties"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    fields.sort();
    assert_eq!(fields, ["path", "workspace"]);
    let description = described["description"].as_str().unwrap();
    for expected in [
        "en arbre, pas en texte de fichier",
        "`node` (son chemin dans la carte",
        "`1.0.2`",
        "`color`",
        "turquoise",
        "`detail`",
        "`children`",
        "`place`",
        "50 000 caractères d'arbre",
        "`truncated` vaut true et `message` le dit",
        "relisez la carte",
        "branches pliées",
        "`add_mind_map_child`",
        "`delete_mind_map_node`",
    ] {
        assert!(description.contains(expected), "{expected}");
    }
}

/// Les champs de l'entrée d'un outil, triés.
fn fields_of(tool: AppTool) -> Vec<String> {
    let described = tool_description(tool);
    let mut fields: Vec<_> = described["inputSchema"]["properties"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    fields.sort();
    fields
}

#[test]
fn the_tools_that_add_a_node_take_its_text_and_say_where_it_goes_and_what_they_give_back() {
    let node = ["detail", "node", "path", "title", "workspace"];
    assert_eq!(fields_of(AppTool::AddMindMapChild), node);
    assert_eq!(fields_of(AppTool::AddMindMapSibling), node);
    assert_eq!(
        fields_of(AppTool::AddMindMapRoot),
        ["detail", "path", "place_x", "place_y", "title", "workspace"]
    );
    for (tool, expected) in [
        (AppTool::AddMindMapChild, "dernier enfant"),
        (AppTool::AddMindMapSibling, "juste en dessous"),
        (AppTool::AddMindMapRoot, "à la fin"),
    ] {
        let description = tool_description(tool)["description"]
            .as_str()
            .unwrap()
            .to_owned();
        for phrase in [
            expected,
            "`node` (le chemin du nœud ajouté)",
            "Refusé, sans rien changer",
        ] {
            assert!(description.contains(phrase), "{tool:?} : {phrase}");
        }
    }
    let place = &tool_description(AppTool::AddMindMapRoot)["inputSchema"]["properties"]["place_x"];
    assert_eq!(place["type"], "number");
    assert!(place["description"].as_str().unwrap().contains("ensemble"));
}

#[test]
fn the_search_takes_words_tag_folder_and_content_type() {
    let schema = tool_description(AppTool::SearchNotes)["inputSchema"].clone();
    let mut fields: Vec<_> = schema["properties"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    fields.sort();
    assert_eq!(
        fields,
        ["content_type", "folder", "query", "tag", "workspace"]
    );
}

#[test]
fn every_tool_but_the_list_of_workspaces_takes_an_optional_workspace() {
    for tool in AppTool::ALL {
        let schema = checked_schema(tool);
        let property = &schema["properties"]["workspace"];
        if tool == AppTool::ListWorkspaces {
            assert!(property.is_null());
            continue;
        }
        assert_eq!(property["type"], "string", "{tool:?}");
        let description = property["description"].as_str().unwrap();
        assert!(description.contains("`list_workspaces`"), "{tool:?}");
        assert!(!schema["required"].to_string().contains("workspace"));
    }
}

#[test]
fn the_list_of_workspaces_says_that_it_shows_names_and_the_open_one_and_points_to_the_settings() {
    let described = tool_description(AppTool::ListWorkspaces);
    let description = described["description"].as_str().unwrap();
    for expected in [
        "autorisés pour les IA",
        "`open`",
        "« Brancher une IA »",
        "paramètre `workspace`",
    ] {
        assert!(description.contains(expected), "{expected}");
    }
    assert_eq!(described["inputSchema"]["properties"], json!({}));
}
