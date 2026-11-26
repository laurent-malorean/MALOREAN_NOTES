//! Le protocole MCP des outils de l'application (fiche 0040) : une demande JSON-RPC par ligne,
//! une réponse par ligne. Seules les demandes d'un serveur d'outils sont comprises : se présenter
//! (`initialize`), répondre présent (`ping`), lister les outils (`tools/list`) et en appeler un
//! (`tools/call`). Rien ici ne dépend du transport : la prise locale aujourd'hui, peut-être le
//! réseau demain.

use domain::app_tools::{APP_TOOLS_SERVER, AppTool};
use serde_json::{Value, json};

use super::catalog::tool_description;

/// La version du protocole donnée quand Claude Code n'en demande pas.
const PROTOCOL_VERSION: &str = "2025-06-18";

/// Codes d'erreur de JSON-RPC.
const PARSE_ERROR: i64 = -32700;
const INVALID_REQUEST: i64 = -32600;
const METHOD_NOT_FOUND: i64 = -32601;
/// Code d'erreur de l'application : la demande vient sans une clé valable (celle du tour en cours,
/// ou la clé de branchement).
const KEY_REFUSED: i64 = -32001;

/// Ce que l'application dit à Claude de ses outils, à la présentation.
const INSTRUCTIONS: &str = "Outils de MALOREAN Notes, l'application de notes de l'utilisateur, \
    pour l'espace de travail ouvert et pour les autres que l'utilisateur a autorisés pour les IA \
    (`list_workspaces` les donne par leur nom ; chaque autre outil accepte le paramètre \
    `workspace`, et vise sans lui l'espace ouvert). Passez par eux pour chercher (avec l'index de l'application), \
    pour connaître les étiquettes, les liens entrants, les modèles de note et l'historique des \
    versions, pour créer, renommer, ranger, étiqueter, épingler ou jeter une note selon ses règles, \
    pour savoir quelle note l'utilisateur regarde et lui en montrer une. Pour lire le texte d'une note simple, utilisez `read_note` ; pour le changer, utilisez `replace_in_note` (un texte exact, recopié de `read_note`, remplacé \
    par un autre ; refusé s'il apparaît plusieurs fois, sauf `replace_all`). Une carte mentale (`type: carte-mentale`) se crée avec `create_mind_map`, se lit en arbre avec `read_mind_map` \
    (chaque nœud avec son chemin : `0`, `0.1`, `1.0.2`) et se modifie avec `add_mind_map_child`, `add_mind_map_sibling`, \
    `add_mind_map_root`, `edit_mind_map_node`, `color_mind_map_node` (les couleurs de la palette seulement), \
    `move_mind_map_node` et `delete_mind_map_node`, qui appliquent les règles de l'écran : ne l'écrivez pas à la \
    main, et ne touchez jamais à la propriété `racines` de son en-tête (tenue par l'application) ; les chemins \
    se renumérotent après un ajout, un déplacement ou une suppression : relisez la carte avant de viser un autre \
    nœud ; `read_note` et `replace_in_note` refusent une carte. Les notes sont désignées par leur chemin depuis l'espace de travail \
    (`dossier/nom.md`). Les dossiers aussi (`dossier/sous-dossier`) : `list_folders` donne l'arbre, \
    `create_folder`, `rename_folder`, `move_folder` et `trash_folder` en créent, renomment, déplacent et \
    mettent à la corbeille un avec tout son contenu. \
    Un canvas (fichier `.canvas`) ne se lit ni ne se change comme une note : `read_canvas` le rend en données \
    (cartes, flèches, groupes, avec leurs identifiants), et un outil par geste le change : \
    `add_canvas_card`, `change_canvas_card`, `move_canvas_card`, `resize_canvas_card`, `remove_canvas_card`, \
    `add_canvas_arrow`, `change_canvas_arrow`, `remove_canvas_arrow`, `add_canvas_group` et `change_canvas_group` ; \
    une couleur y est un nom de la palette (`rouge`, `bleu`…), jamais un hexadécimal, et chaque changement garde \
    la version d'avant dans l'historique (`restore_version` l'annule). \
    Un CRM (`type: crm`, créé par `create_crm`) est une note ; ses entreprises, personnes, actions et \
    projets sont des fiches (des notes) rangées dans des dossiers qui portent le nom de son fichier, \
    qui ne se lisent ni ne s'écrivent à la main : `read_crm` rend le CRM en données (colonnes du \
    Kanban avec leurs actions, personnes, entreprises, projets, étapes ; filtres facultatifs), une \
    fiche se désigne par sa référence (`ref`), et les outils du CRM le changent : \
    `create_crm_action`, `change_crm_action`, `move_crm_action`, `delete_crm_action`, \
    `create_crm_person`, `change_crm_person`, `delete_crm_person`, `create_crm_company`, \
    `change_crm_company`, `delete_crm_company`, `create_crm_project`, `change_crm_project`, \
    `delete_crm_project` et `change_crm_stages` (le changement d'une fiche prend une `operation` qui \
    nomme le geste de l'interface) ; les étiquettes d'une fiche se changent avec `add_tags` et \
    `remove_tags`. Règles : pour changer le statut d'une action, utilisez `move_crm_action` avec le \
    nom exact d'une colonne du CRM (`TODO`, `Done`, `Cancel` et ses étapes) ; ne supprimez rien sans \
    que l'utilisateur le demande ; pour un compte rendu sur une action, ajoutez un commentaire \
    (`add_comment`) plutôt que de réécrire sa description ; ne renommez jamais le fichier d'une \
    fiche, ni ne renommez, déplacez ou jetez les dossiers de fiches d'un CRM.";

/// L'issue d'un appel d'outil : le texte rendu à Claude, ou ce qui a empêché l'outil.
pub(super) type ToolOutcome = Result<String, String>;

/// La réponse à la ligne `line`, s'il en faut une (une notification n'en a pas). `refusal` est
/// ce que l'on répond quand la demande ne vient pas avec une clé valable (rien si elle en a
/// une) ; `call` joue un outil sur ses arguments.
pub(super) fn answer(
    line: &str,
    refusal: Option<&str>,
    call: impl FnOnce(AppTool, &Value) -> ToolOutcome,
) -> Option<String> {
    let Ok(request) = serde_json::from_str::<Value>(line) else {
        return Some(error(&Value::Null, PARSE_ERROR, "demande illisible"));
    };
    // Une notification n'attend pas de réponse.
    let id = request.get("id")?;
    if let Some(refusal) = refusal {
        return Some(error(id, KEY_REFUSED, refusal));
    }
    let params = &request["params"];
    let result = match request["method"].as_str() {
        Some("initialize") => initialized(params),
        Some("ping") => json!({}),
        Some("tools/list") => {
            json!({ "tools": AppTool::ALL.iter().map(|tool| tool_description(*tool)).collect::<Vec<_>>() })
        }
        Some("tools/call") => called(params, call),
        Some(_) => return Some(error(id, METHOD_NOT_FOUND, "méthode inconnue")),
        None => return Some(error(id, INVALID_REQUEST, "demande sans méthode")),
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string())
}

/// La présentation du serveur, dans la version du protocole que Claude Code demande.
fn initialized(params: &Value) -> Value {
    json!({
        "protocolVersion": params["protocolVersion"].as_str().unwrap_or(PROTOCOL_VERSION),
        "capabilities": { "tools": {} },
        "serverInfo": {
            "name": APP_TOOLS_SERVER,
            "title": "MALOREAN Notes",
            "version": env!("CARGO_PKG_VERSION"),
        },
        "instructions": INSTRUCTIONS,
    })
}

/// L'appel d'un outil : son texte, ou ce qui l'a empêché, signalé en erreur à Claude.
fn called(params: &Value, call: impl FnOnce(AppTool, &Value) -> ToolOutcome) -> Value {
    let outcome = match params["name"].as_str().and_then(AppTool::named) {
        Some(tool) => {
            let arguments = params.get("arguments").unwrap_or(&Value::Null);
            call(tool, arguments)
        }
        None => Err("outil inconnu de MALOREAN Notes".to_owned()),
    };
    let (text, failed) = match outcome {
        Ok(text) => (text, false),
        Err(reason) => (reason, true),
    };
    json!({ "content": [{ "type": "text", "text": text }], "isError": failed })
}

fn error(id: &Value, code: i64, message: &str) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn replied(line: &str) -> Value {
        replied_by(line, |_, _| Ok("fait".to_owned()))
    }

    fn replied_by(line: &str, call: impl FnOnce(AppTool, &Value) -> ToolOutcome) -> Value {
        serde_json::from_str(&answer(line, None, call).unwrap()).unwrap()
    }

    #[test]
    fn the_server_introduces_itself_in_the_version_asked_for() {
        let reply = replied(
            r#"{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}"#,
        );
        assert_eq!(reply["jsonrpc"], "2.0");
        assert_eq!(reply["id"], 0);
        let result = &reply["result"];
        assert_eq!(result["protocolVersion"], "2025-11-25");
        assert_eq!(result["capabilities"], json!({ "tools": {} }));
        assert_eq!(result["serverInfo"]["name"], "malorean_notes");
        assert_eq!(result["serverInfo"]["title"], "MALOREAN Notes");
        assert_eq!(result["serverInfo"]["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(result["instructions"], INSTRUCTIONS);
        let reply = replied(r#"{"jsonrpc":"2.0","id":1,"method":"initialize"}"#);
        assert_eq!(reply["result"]["protocolVersion"], PROTOCOL_VERSION);
    }

    #[test]
    fn the_introduction_names_the_tools_that_read_and_change_a_canvas() {
        let reply = replied(r#"{"jsonrpc":"2.0","id":0,"method":"initialize"}"#);
        let text = reply["result"]["instructions"].as_str().unwrap();
        for expected in [
            "`.canvas`",
            "`read_canvas`",
            "`add_canvas_card`",
            "`change_canvas_card`",
            "`move_canvas_card`",
            "`resize_canvas_card`",
            "`remove_canvas_card`",
            "`add_canvas_arrow`",
            "`change_canvas_arrow`",
            "`remove_canvas_arrow`",
            "`add_canvas_group`",
            "`change_canvas_group`",
            "nom de la palette",
            "`restore_version` l'annule",
        ] {
            assert!(text.contains(expected), "{expected}");
        }
    }

    #[test]
    fn the_introduction_names_the_tools_that_see_and_change_the_folders() {
        let reply = replied(r#"{"jsonrpc":"2.0","id":0,"method":"initialize"}"#);
        let text = reply["result"]["instructions"].as_str().unwrap();
        for expected in [
            "`list_folders`",
            "`create_folder`",
            "`rename_folder`",
            "`move_folder`",
            "`trash_folder`",
            "corbeille",
            "dossiers de fiches d'un CRM",
        ] {
            assert!(text.contains(expected), "{expected}");
        }
    }

    #[test]
    fn the_introduction_sends_the_changes_of_a_simple_note_to_replace_in_note() {
        let reply = replied(r#"{"jsonrpc":"2.0","id":0,"method":"initialize"}"#);
        let text = reply["result"]["instructions"].as_str().unwrap();
        for expected in [
            "`replace_in_note`",
            "`replace_all`",
            "note simple",
            "`read_note`",
        ] {
            assert!(text.contains(expected), "{expected}");
        }
        assert!(!text.contains("remplacer un passage"), "{text}");
    }

    #[test]
    fn the_introduction_names_the_tools_that_read_and_change_a_mind_map() {
        let reply = replied(r#"{"jsonrpc":"2.0","id":0,"method":"initialize"}"#);
        let text = reply["result"]["instructions"].as_str().unwrap();
        for expected in [
            "`create_mind_map`",
            "`read_mind_map`",
            "`0.1`, `1.0.2`",
            "`add_mind_map_child`",
            "`add_mind_map_sibling`",
            "`add_mind_map_root`",
            "`edit_mind_map_node`",
            "`color_mind_map_node` (les couleurs de la palette seulement)",
            "`move_mind_map_node`",
            "`delete_mind_map_node`",
            "ne touchez jamais à la propriété `racines`",
            "relisez la carte avant de viser un autre nœud",
            "`read_note` et `replace_in_note` refusent une carte",
        ] {
            assert!(text.contains(expected), "{expected}");
        }
        assert!(!text.contains("l'écrivez comme une note"), "{text}");
    }

    #[test]
    fn the_introduction_tells_how_to_choose_a_workspace() {
        let reply = replied(r#"{"jsonrpc":"2.0","id":0,"method":"initialize"}"#);
        let text = reply["result"]["instructions"].as_str().unwrap();
        for expected in [
            "`list_workspaces`",
            "le paramètre `workspace`",
            "autorisés pour les IA",
        ] {
            assert!(text.contains(expected), "{expected}");
        }
    }

    /// La consigne sur les CRM dans la présentation du serveur (fiche 0081).
    #[test]
    fn the_introduction_gives_the_instructions_on_crms() {
        let reply = replied(r#"{"jsonrpc":"2.0","id":0,"method":"initialize"}"#);
        let text = reply["result"]["instructions"].as_str().unwrap();
        for expected in [
            "Un CRM (`type: crm`, créé par `create_crm`)",
            "dossiers qui portent le nom de son fichier",
            "ne se lisent ni ne s'écrivent à la main",
            "`read_crm`",
            "filtres facultatifs",
            "sa référence (`ref`)",
            "`create_crm_action`",
            "`change_crm_action`",
            "`move_crm_action`",
            "`delete_crm_action`",
            "`create_crm_person`",
            "`change_crm_person`",
            "`delete_crm_person`",
            "`create_crm_company`",
            "`change_crm_company`",
            "`delete_crm_company`",
            "`create_crm_project`",
            "`change_crm_project`",
            "`delete_crm_project`",
            "`change_crm_stages`",
            "une `operation` qui nomme le geste de l'interface",
            "`add_tags` et `remove_tags`",
            "utilisez `move_crm_action` avec le nom exact d'une colonne du CRM",
            "`TODO`, `Done`, `Cancel` et ses étapes",
            "ne supprimez rien sans que l'utilisateur le demande",
            "ajoutez un commentaire (`add_comment`) plutôt que de réécrire sa description",
            "ne renommez jamais le fichier d'une fiche",
        ] {
            assert!(text.contains(expected), "{expected}");
        }
    }

    #[test]
    fn the_introduction_no_longer_sends_a_crm_to_the_file_tools() {
        let reply = replied(r#"{"jsonrpc":"2.0","id":0,"method":"initialize"}"#);
        let text = reply["result"]["instructions"].as_str().unwrap();
        for gone in [
            "`rang`",
            "`statut`",
            "`#### Commentaires`",
            "outils de fichiers",
            "`etapes`",
        ] {
            assert!(!text.contains(gone), "{gone}");
        }
    }

    #[test]
    fn a_notification_gets_no_answer() {
        assert_eq!(
            answer(
                r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
                None,
                |_, _| unreachable!()
            ),
            None
        );
    }

    #[test]
    fn ping_is_answered() {
        let reply = replied(r#"{"jsonrpc":"2.0","id":"p","method":"ping"}"#);
        assert_eq!(reply["id"], "p");
        assert_eq!(reply["result"], json!({}));
    }

    #[test]
    fn every_app_tool_is_listed_with_its_description() {
        let reply = replied(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#);
        let tools = reply["result"]["tools"].as_array().unwrap();
        assert_eq!(tools.len(), AppTool::ALL.len());
        for (listed, tool) in tools.iter().zip(AppTool::ALL) {
            assert_eq!(*listed, tool_description(tool));
        }
    }

    #[test]
    fn a_tool_call_gives_the_text_of_the_tool() {
        let reply = replied_by(
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_versions","arguments":{"path":"a.md"}}}"#,
            |tool, arguments| {
                assert_eq!(tool, AppTool::ListVersions);
                assert_eq!(arguments["path"], "a.md");
                Ok("[]".to_owned())
            },
        );
        assert_eq!(
            reply["result"],
            json!({ "content": [{ "type": "text", "text": "[]" }], "isError": false })
        );
    }

    #[test]
    fn a_tool_call_without_arguments_gives_null_arguments() {
        let reply = replied_by(
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_tags"}}"#,
            |_, arguments| {
                assert_eq!(*arguments, Value::Null);
                Ok("ok".to_owned())
            },
        );
        assert_eq!(reply["result"]["isError"], false);
    }

    #[test]
    fn a_failed_tool_call_says_why_as_an_error_of_the_tool() {
        let reply = replied_by(
            r#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_tags","arguments":{}}}"#,
            |_, _| Err("aucun espace de travail n'est ouvert".to_owned()),
        );
        assert_eq!(
            reply["result"],
            json!({
                "content": [{ "type": "text", "text": "aucun espace de travail n'est ouvert" }],
                "isError": true
            })
        );
    }

    #[test]
    fn an_unknown_tool_is_refused_without_calling_anything() {
        let reply = replied_by(
            r#"{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"rm","arguments":{}}}"#,
            |_, _| unreachable!(),
        );
        assert_eq!(reply["result"]["isError"], true);
        assert_eq!(
            reply["result"]["content"][0]["text"],
            "outil inconnu de MALOREAN Notes"
        );
    }

    #[test]
    fn unknown_methods_and_illegible_lines_are_errors() {
        let reply = replied(
            r#"{"jsonrpc":"2.0","id":"server-discover-probe-1","method":"server/discover"}"#,
        );
        assert_eq!(reply["id"], "server-discover-probe-1");
        assert_eq!(reply["error"]["code"], -32601);
        assert_eq!(reply["error"]["message"], "méthode inconnue");
        let reply = replied(r#"{"jsonrpc":"2.0","id":6}"#);
        assert_eq!(reply["error"]["code"], -32600);
        let reply = replied("pas du JSON");
        assert_eq!(reply["id"], Value::Null);
        assert_eq!(reply["error"]["code"], -32700);
    }

    #[test]
    fn a_request_without_the_key_of_the_turn_is_refused() {
        let reply: Value = serde_json::from_str(
            &answer(
                r#"{"jsonrpc":"2.0","id":7,"method":"tools/list"}"#,
                Some("pas de clé"),
                |_, _| unreachable!(),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(reply["id"], 7);
        assert_eq!(reply["error"]["code"], -32001);
        assert_eq!(reply["error"]["message"], "pas de clé");
        assert!(reply.get("result").is_none());
    }
}
