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
                "tags" | "projects" | "people" | "linked_notes" | "cards" => "array",
                "limit" | "x" | "y" | "width" | "height" | "list" | "item" | "comment"
                | "index" => "integer",
                "replace_all" | "done" | "at_end" => "boolean",
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
fn creating_a_canvas_or_a_notebook_requires_a_title() {
    for tool in [AppTool::CreateCanvas, AppTool::CreateResearchNotebook] {
        assert_eq!(
            checked_schema(tool)["required"],
            json!(["title"]),
            "{tool:?}"
        );
    }
}

#[test]
fn each_tool_requires_what_it_cannot_work_without() {
    let path: &[&str] = &["path"];
    let expected: [(AppTool, &[&str]); 51] = [
        (AppTool::ListWorkspaces, &[]),
        (AppTool::SearchNotes, &[]),
        (AppTool::SearchByMeaning, &["question"]),
        (AppTool::ListTags, &[]),
        (AppTool::ListFolders, &[]),
        (AppTool::LinkingNotes, path),
        (AppTool::ReadNote, path),
        (AppTool::ReadCanvas, path),
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
        (AppTool::AddCanvasCard, &["path", "type", "x", "y"]),
        (AppTool::ChangeCanvasCard, &["path", "id"]),
        (AppTool::MoveCanvasCard, &["path", "id", "x", "y"]),
        (
            AppTool::ResizeCanvasCard,
            &["path", "id", "width", "height"],
        ),
        (AppTool::RemoveCanvasCard, &["path", "id"]),
        (AppTool::AddCanvasArrow, &["path", "from", "to"]),
        (AppTool::ChangeCanvasArrow, &["path", "id"]),
        (AppTool::RemoveCanvasArrow, &["path", "id"]),
        (AppTool::AddCanvasGroup, path),
        (AppTool::ChangeCanvasGroup, &["path", "id"]),
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
        (AppTool::EditMindMapNode, &["path", "node"]),
        (AppTool::ColorMindMapNode, &["path", "node", "color"]),
        (AppTool::MoveMindMapNode, &["path", "node", "position"]),
        (AppTool::DeleteMindMapNode, &["path", "node"]),
        (AppTool::CreateCrm, &["title"]),
        (AppTool::ReadCrm, path),
        (AppTool::ViewedNote, &[]),
        (AppTool::ShowNote, path),
    ];
    for (tool, fields) in expected {
        assert_eq!(checked_schema(tool)["required"], json!(fields), "{tool:?}");
    }
}

#[test]
fn each_tool_that_changes_a_crm_requires_its_crm_and_what_it_cannot_work_without() {
    let expected: [(AppTool, &[&str]); 14] = [
        (AppTool::CreateCrmAction, &["path", "title"]),
        (AppTool::ChangeCrmAction, &["path", "action", "operation"]),
        (AppTool::MoveCrmAction, &["path", "action", "status"]),
        (AppTool::DeleteCrmAction, &["path", "action"]),
        (AppTool::CreateCrmPerson, &["path", "name"]),
        (AppTool::ChangeCrmPerson, &["path", "person", "operation"]),
        (AppTool::DeleteCrmPerson, &["path", "person"]),
        (AppTool::CreateCrmCompany, &["path", "name"]),
        (AppTool::ChangeCrmCompany, &["path", "company", "operation"]),
        (AppTool::DeleteCrmCompany, &["path", "company"]),
        (AppTool::CreateCrmProject, &["path", "name"]),
        (AppTool::ChangeCrmProject, &["path", "project", "operation"]),
        (AppTool::DeleteCrmProject, &["path", "project"]),
        (AppTool::ChangeCrmStages, &["path", "operation"]),
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
        "cahier de recherche (utilisez `add_entry` ; `create_research_notebook` en crée un)",
        "une carte mentale (lisez-la avec `read_mind_map`, modifiez-la avec `add_mind_map_child`",
        "un canvas",
        "utilisez `read_canvas` et les outils du canvas",
        "`create_canvas` en crée un",
        "une fiche de CRM (utilisez `read_crm` et les outils du CRM)",
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
        "cahier de recherche (il se crée avec `create_research_notebook`, on y ajoute des entrées avec `add_entry`",
        "une carte mentale (lisez-la avec `read_mind_map`), un CRM",
        "un canvas se lit avec `read_canvas` (il se crée avec `create_canvas`), un CRM et ses fiches avec `read_crm`",
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
fn the_tools_that_change_a_node_say_what_stays_and_what_they_refuse() {
    assert_eq!(
        fields_of(AppTool::EditMindMapNode),
        ["detail", "node", "path", "title", "workspace"]
    );
    assert_eq!(
        fields_of(AppTool::ColorMindMapNode),
        ["color", "node", "path", "workspace"]
    );
    let edit = tool_description(AppTool::EditMindMapNode)["description"]
        .as_str()
        .unwrap()
        .to_owned();
    for phrase in [
        "reste tel quel",
        "`detail` vide efface",
        "ses enfants et sa couleur",
        "ni `title` ni `detail`",
    ] {
        assert!(edit.contains(phrase), "{phrase}");
    }
    let color = tool_description(AppTool::ColorMindMapNode)["description"]
        .as_str()
        .unwrap()
        .to_owned();
    for phrase in [
        "10 couleurs de la palette",
        "ardoise",
        "`aucune`",
        "Pas de couleur libre",
        "l'erreur donne la palette",
    ] {
        assert!(color.contains(phrase), "{phrase}");
    }
}

#[test]
fn the_tools_that_move_or_delete_a_node_name_their_options_and_say_what_they_refuse() {
    assert_eq!(
        fields_of(AppTool::MoveMindMapNode),
        [
            "node",
            "path",
            "place_x",
            "place_y",
            "position",
            "target",
            "workspace"
        ]
    );
    assert_eq!(
        fields_of(AppTool::DeleteMindMapNode),
        ["node", "path", "workspace"]
    );
    let moving = tool_description(AppTool::MoveMindMapNode)["description"]
        .as_str()
        .unwrap()
        .to_owned();
    for phrase in [
        "`child`",
        "`before` ou `after`",
        "`root`",
        "seulement déplacé sur la carte",
        "sa propre branche",
        "relisez la carte",
    ] {
        assert!(moving.contains(phrase), "{phrase}");
    }
    let deleting = tool_description(AppTool::DeleteMindMapNode)["description"]
        .as_str()
        .unwrap()
        .to_owned();
    for phrase in [
        "toute sa branche",
        "rien ne la demande",
        "historique des versions",
        "`deleted`",
    ] {
        assert!(deleting.contains(phrase), "{phrase}");
    }
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
