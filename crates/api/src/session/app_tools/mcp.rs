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
/// Code d'erreur de l'application : la demande vient sans la clé du tour en cours.
const KEY_REFUSED: i64 = -32001;

/// Ce que l'application dit à Claude de ses outils, à la présentation.
const INSTRUCTIONS: &str = "Outils de MALOREAN Notes, l'application de notes de l'utilisateur, \
    pour l'espace de travail ouvert. Passez par eux pour chercher (avec l'index de l'application), \
    pour connaître les étiquettes, les liens entrants, les modèles de note et l'historique des \
    versions, pour créer, renommer, ranger, étiqueter, épingler ou jeter une note selon ses règles, \
    pour savoir quelle note l'utilisateur regarde et lui en montrer une. Pour changer le texte d'une note, utilisez vos propres outils de fichiers (remplacer \
    un passage par un autre). Les notes sont désignées par leur chemin depuis l'espace de travail \
    (`dossier/nom.md`).";

/// L'issue d'un appel d'outil : le texte rendu à Claude, ou ce qui a empêché l'outil.
pub(super) type ToolOutcome = Result<String, String>;

/// La réponse à la ligne `line`, s'il en faut une (une notification n'en a pas). `allowed` dit
/// si la demande vient avec la clé du tour en cours ; `call` joue un outil sur ses arguments.
pub(super) fn answer(
    line: &str,
    allowed: bool,
    call: impl FnOnce(AppTool, &Value) -> ToolOutcome,
) -> Option<String> {
    let Ok(request) = serde_json::from_str::<Value>(line) else {
        return Some(error(&Value::Null, PARSE_ERROR, "demande illisible"));
    };
    // Une notification n'attend pas de réponse.
    let id = request.get("id")?;
    if !allowed {
        return Some(error(
            id,
            KEY_REFUSED,
            "clé refusée : les outils de MALOREAN Notes ne servent que pendant un tour de la \
             colonne Claude Code",
        ));
    }
    let params = &request["params"];
    let result = match request["method"].as_str() {
        Some("initialize") => initialized(params),
        Some("ping") => json!({}),
        Some("tools/list") => json!({ "tools": AppTool::ALL.map(tool_description) }),
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
        serde_json::from_str(&answer(line, true, call).unwrap()).unwrap()
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
        assert_eq!(result["serverInfo"]["name"], "malorean");
        assert_eq!(result["serverInfo"]["title"], "MALOREAN Notes");
        assert_eq!(result["serverInfo"]["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(result["instructions"], INSTRUCTIONS);
        let reply = replied(r#"{"jsonrpc":"2.0","id":1,"method":"initialize"}"#);
        assert_eq!(reply["result"]["protocolVersion"], PROTOCOL_VERSION);
    }

    #[test]
    fn a_notification_gets_no_answer() {
        assert_eq!(
            answer(
                r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
                true,
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
                false,
                |_, _| unreachable!(),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(reply["id"], 7);
        assert_eq!(reply["error"]["code"], -32001);
        assert!(reply.get("result").is_none());
    }
}
