// Serveurs MCP extérieurs de la colonne Claude Code (fiche 0105, spécification « serveurs-mcp » § 3) : les textes de
// la rubrique et l'état qu'elle montre. Les règles (liste, tri, serveur introuvable, nom montré) sont celles du moteur.
import type { McpServerItem, ServerStateItem } from "../bridge";

/** Ce que la rubrique montre : la lecture en cours, la phrase d'un moteur qui ne répond pas, ou la liste. */
export type McpServersState =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "listed"; readonly servers: readonly McpServerItem[] };

export const TITLE = "Serveurs MCP";
export const INTRO =
  "Les services que Claude peut utiliser dans la colonne Claude Code, en plus des outils de l'application. Seuls les serveurs cochés lui sont ouverts.";
export const LOADING = "Lecture des serveurs de Claude Code…";
export const REFRESH = "Actualiser";
export const EMPTY = "Claude Code ne connaît aucun serveur MCP extérieur.";
/** L'aide de la case : cocher donne tout, y compris ce qui écrit dans le service. */
export const CHECKBOX_HELP =
  "Claude pourra se servir de tous les outils de ce serveur, y compris ceux qui écrivent dans le service (envoyer un message Slack, créer une page Notion…), sans rien demander.";

/** L'état d'un serveur, en toutes lettres. */
export const STATE_LABELS: Readonly<Record<ServerStateItem, string>> = {
  connected: "Connecté",
  toConnect: "À connecter",
  failed: "En échec",
  notFound: "Introuvable",
};

/** Ce qu'il faut faire pour un connecteur claude.ai « À connecter ». */
export const CONNECTOR_HINT =
  "Connectez-le dans les réglages des connecteurs de claude.ai, puis cliquez sur « Actualiser ».";

/** Ce qu'il faut faire pour un serveur ajouté dans le Terminal « À connecter », en morceaux : le texte et les commandes à taper. */
export const TERMINAL_HINT: readonly { readonly text: string; readonly code?: true }[] = [
  { text: "Connectez-le dans le Terminal : tapez " },
  { text: "claude", code: true },
  { text: ", puis " },
  { text: "/mcp", code: true },
  { text: ", puis cliquez sur « Actualiser »." },
];

/** La phrase sous un serveur ; rien sauf s'il est « À connecter ». */
export function connectHint(
  server: McpServerItem,
): typeof CONNECTOR_HINT | typeof TERMINAL_HINT | null {
  if (server.state !== "toConnect") return null;
  return server.connector ? CONNECTOR_HINT : TERMINAL_HINT;
}

/** La liste après un cochage : la ligne `name` est cochée ou décochée ; un serveur introuvable décoché disparaît. */
export function withAllowed(
  servers: readonly McpServerItem[],
  name: string,
  allowed: boolean,
): McpServerItem[] {
  return servers
    .filter((server) => allowed || server.name !== name || server.state !== "notFound")
    .map((server) => (server.name === name ? { ...server, allowed } : server));
}
