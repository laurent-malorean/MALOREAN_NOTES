//! Les descriptions des outils du canvas (fiche 0079) : leurs champs, ce qu'ils rendent, ce qui est
//! refusé, dits à l'IA.

use domain::app_tools::AppTool;
use domain::mind_map::PALETTE;

use super::catalog::tool_description;

fn fields(tool: AppTool) -> Vec<String> {
    let mut fields: Vec<_> = tool_description(tool)["inputSchema"]["properties"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    fields.sort();
    fields
}

fn description(tool: AppTool) -> String {
    tool_description(tool)["description"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn says(tool: AppTool, expected: &[&str]) {
    let description = description(tool);
    for word in expected {
        assert!(description.contains(word), "{tool:?} : {word}");
    }
}

const EXPECTED_FIELDS: [(AppTool, &[&str]); 11] = [
    (AppTool::ReadCanvas, &["path", "workspace"]),
    (
        AppTool::AddCanvasCard,
        &[
            "color",
            "file",
            "height",
            "path",
            "text",
            "type",
            "url",
            "width",
            "workspace",
            "x",
            "y",
        ],
    ),
    (
        AppTool::ChangeCanvasCard,
        &["color", "file", "id", "path", "text", "url", "workspace"],
    ),
    (
        AppTool::MoveCanvasCard,
        &["id", "path", "workspace", "x", "y"],
    ),
    (
        AppTool::ResizeCanvasCard,
        &["height", "id", "path", "width", "workspace"],
    ),
    (AppTool::RemoveCanvasCard, &["id", "path", "workspace"]),
    (
        AppTool::AddCanvasArrow,
        &[
            "color",
            "from",
            "from_side",
            "label",
            "path",
            "sense",
            "to",
            "to_side",
            "workspace",
        ],
    ),
    (
        AppTool::ChangeCanvasArrow,
        &[
            "color",
            "from",
            "from_side",
            "id",
            "label",
            "path",
            "sense",
            "to",
            "to_side",
            "workspace",
        ],
    ),
    (AppTool::RemoveCanvasArrow, &["id", "path", "workspace"]),
    (
        AppTool::AddCanvasGroup,
        &[
            "cards",
            "color",
            "height",
            "label",
            "path",
            "width",
            "workspace",
            "x",
            "y",
        ],
    ),
    (
        AppTool::ChangeCanvasGroup,
        &["color", "id", "label", "path", "workspace"],
    ),
];

#[test]
fn each_canvas_tool_takes_its_fields_and_the_workspace() {
    for (tool, wanted) in EXPECTED_FIELDS {
        assert_eq!(fields(tool), wanted, "{tool:?}");
    }
}

#[test]
fn creating_a_canvas_takes_a_title_and_a_folder_and_sends_to_the_tools_that_fill_it() {
    assert_eq!(
        fields(AppTool::CreateCanvas),
        ["folder", "title", "workspace"]
    );
    says(
        AppTool::CreateCanvas,
        &[
            "Crée un canvas vide",
            "nom du fichier tiré du titre",
            "sans écraser",
            "créé avec ses parents",
            "Rend son chemin",
            "`add_canvas_card`",
            "`add_canvas_arrow`",
            "`add_canvas_group`",
            "`read_canvas`",
        ],
    );
    says(
        AppTool::CreateNote,
        &["un canvas se crée avec `create_canvas`"],
    );
}

#[test]
fn reading_a_canvas_tells_what_it_gives_its_limits_and_that_it_is_cut_aloud() {
    says(
        AppTool::ReadCanvas,
        &[
            "sans le JSON du fichier",
            "`cards`",
            "`arrows`",
            "`members`",
            "`other_color`",
            "`sense`",
            "`from_side`",
            "`tags`",
            "150 cartes, 150 flèches et 20 000 caractères",
            "`truncated` vaut true et `message` dit ce qui manque",
            "jamais de coupure silencieuse",
        ],
    );
}

#[test]
fn the_tools_that_change_a_canvas_name_their_results_and_keep_the_previous_text_as_a_version() {
    for tool in [
        AppTool::AddCanvasCard,
        AppTool::ChangeCanvasCard,
        AppTool::MoveCanvasCard,
        AppTool::ResizeCanvasCard,
        AppTool::RemoveCanvasCard,
        AppTool::AddCanvasArrow,
        AppTool::ChangeCanvasArrow,
        AppTool::RemoveCanvasArrow,
        AppTool::AddCanvasGroup,
        AppTool::ChangeCanvasGroup,
    ] {
        says(tool, &["historique des versions", "Rend `path`", "Refusé"]);
    }
    says(AppTool::MoveCanvasCard, &["`moved`", "suivent"]);
    says(
        AppTool::RemoveCanvasCard,
        &["`removed_arrows`", "`restore_version`"],
    );
    says(
        AppTool::AddCanvasCard,
        &["250 × 60", "400 × 300", "`add_canvas_group`"],
    );
    says(
        AppTool::AddCanvasGroup,
        &["marge de 20", "400 × 300", "Pas les deux"],
    );
    says(
        AppTool::AddCanvasArrow,
        &["deux cartes différentes", "pointe à l'arrivée"],
    );
}

#[test]
fn the_color_is_a_name_of_the_palette_and_never_free() {
    for tool in [
        AppTool::AddCanvasCard,
        AppTool::ChangeCanvasCard,
        AppTool::AddCanvasArrow,
        AppTool::ChangeCanvasArrow,
        AppTool::AddCanvasGroup,
        AppTool::ChangeCanvasGroup,
    ] {
        let schema = tool_description(tool)["inputSchema"].clone();
        let color = schema["properties"]["color"]["description"]
            .as_str()
            .unwrap();
        for name in PALETTE {
            assert!(color.contains(name), "{tool:?} : {name}");
        }
        assert!(color.contains("`aucune`"));
        assert!(color.contains("pas d'hexadécimal"));
    }
}

#[test]
fn the_sides_and_the_senses_of_an_arrow_are_listed() {
    for tool in [AppTool::AddCanvasArrow, AppTool::ChangeCanvasArrow] {
        let schema = tool_description(tool)["inputSchema"].clone();
        let properties = &schema["properties"];
        assert_eq!(
            properties["sense"]["enum"],
            serde_json::json!(["none", "single", "both"])
        );
        for side in ["from_side", "to_side"] {
            assert_eq!(
                properties[side]["enum"],
                serde_json::json!(["top", "right", "bottom", "left"])
            );
        }
    }
    let schema = tool_description(AppTool::AddCanvasCard)["inputSchema"].clone();
    assert_eq!(
        schema["properties"]["type"]["enum"],
        serde_json::json!(["text", "file", "link"])
    );
}
