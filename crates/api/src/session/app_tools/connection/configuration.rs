//! Les blocs de configuration à coller dans une IA extérieure (fiche 0056) : la commande de
//! branchement (le programme de l'application et son option) et la clé, dans la forme que chaque
//! IA lit.

use std::path::Path;

use domain::app_tools::APP_TOOLS_SERVER;
use domain::connection_key::ConnectionKey;
use serde_json::json;

/// Le programme lancé avec son option et la clé, comme l'IA le lance : le seul argument avant la
/// clé est l'option de la commande de branchement.
const CONNECT_OPTION: &str = "--brancher";

/// Un texte entre guillemets, tel que le JSON et le TOML l'écrivent l'un et l'autre.
fn quoted(text: &str) -> String {
    json!(text).to_string()
}

/// Le bloc pour Claude : le JSON des serveurs MCP (`mcpServers`).
pub(super) fn claude_config(program: &Path, key: &ConnectionKey) -> String {
    let config = json!({
        "mcpServers": {
            APP_TOOLS_SERVER: {
                "command": program,
                "args": [CONNECT_OPTION, key.secret()],
            }
        }
    });
    serde_json::to_string_pretty(&config).unwrap_or_else(|_| unreachable!("du JSON se réécrit"))
}

/// Le bloc pour Codex : le TOML des serveurs MCP (`mcp_servers`).
pub(super) fn codex_config(program: &Path, key: &ConnectionKey) -> String {
    format!(
        "[mcp_servers.{APP_TOOLS_SERVER}]\ncommand = {}\nargs = [{}, {}]",
        quoted(&program.to_string_lossy()),
        quoted(CONNECT_OPTION),
        quoted(key.secret()),
    )
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use domain::Moment;
    use serde_json::Value;

    use super::*;

    fn key() -> ConnectionKey {
        ConnectionKey::new("abc123", Moment::new(2026, 11, 25, 14, 30).unwrap()).unwrap()
    }

    fn program() -> PathBuf {
        PathBuf::from("/Applications/MALOREAN Notes.app/Contents/MacOS/malorean-notes")
    }

    #[test]
    fn the_claude_block_is_the_json_of_one_mcp_server_launched_with_the_key() {
        let block: Value = serde_json::from_str(&claude_config(&program(), &key())).unwrap();

        assert_eq!(
            block,
            json!({ "mcpServers": { "malorean": {
                "command": "/Applications/MALOREAN Notes.app/Contents/MacOS/malorean-notes",
                "args": ["--brancher", "abc123"],
            } } })
        );
    }

    #[test]
    fn the_claude_block_is_written_over_several_lines_to_be_read_and_pasted() {
        assert!(claude_config(&program(), &key()).starts_with("{\n  \"mcpServers\": {\n"));
    }

    #[test]
    fn the_codex_block_is_the_toml_of_one_mcp_server_launched_with_the_key() {
        assert_eq!(
            codex_config(&program(), &key()),
            "[mcp_servers.malorean]\n\
             command = \"/Applications/MALOREAN Notes.app/Contents/MacOS/malorean-notes\"\n\
             args = [\"--brancher\", \"abc123\"]"
        );
    }

    #[test]
    fn a_quote_or_a_backslash_in_the_program_path_is_escaped_in_both_blocks() {
        let odd = PathBuf::from("/Users/a\"b\\c/app");

        assert_eq!(
            codex_config(&odd, &key()),
            "[mcp_servers.malorean]\ncommand = \"/Users/a\\\"b\\\\c/app\"\n\
             args = [\"--brancher\", \"abc123\"]"
        );
        let block: Value = serde_json::from_str(&claude_config(&odd, &key())).unwrap();
        assert_eq!(
            block["mcpServers"]["malorean"]["command"],
            "/Users/a\"b\\c/app"
        );
    }
}
