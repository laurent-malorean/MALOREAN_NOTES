// Le pont vers les serveurs MCP extérieurs de la colonne Claude Code (fiche 0105, `doc/specs/serveurs-mcp.md`
// § 8) : la liste que Claude Code connaît, cocher et décocher un serveur ; arguments au nom de ceux de Rust.
import { invoke } from "@tauri-apps/api/core";
import type { McpServerItem } from "./generated/McpServerItem";
import type { McpServersItem } from "./generated/McpServersItem";
import type { ServerStateItem } from "./generated/ServerStateItem";

export type { McpServerItem, McpServersItem, ServerStateItem };

/** Les serveurs MCP extérieurs que Claude Code connaît, avec leur état et ceux qui sont cochés. La lecture peut durer plus de dix secondes. */
export const listMcpServers = () => invoke<McpServersItem>("list_mcp_servers");
/** Coche le serveur `name` (son nom tel que la liste le donne) : Claude s'en sert dès le message suivant. */
export const allowMcpServer = (name: string) => invoke<null>("allow_mcp_server", { name });
/** Décoche le serveur `name` : Claude ne le voit plus dès le message suivant. */
export const disallowMcpServer = (name: string) => invoke<null>("disallow_mcp_server", { name });
