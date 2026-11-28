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

/** La phrase, dite une seule fois pour tous les connecteurs claude.ai « À connecter ». */
export const CONNECTOR_HINT =
  "Connectez-les dans les réglages des connecteurs de claude.ai, puis cliquez sur « Actualiser ».";

/** La phrase, dite une seule fois pour tous les serveurs « À connecter » ajoutés dans le Terminal, en morceaux : le texte et les commandes à taper. */
export const TERMINAL_HINT: readonly { readonly text: string; readonly code?: true }[] = [
  { text: "Connectez-les dans le Terminal : tapez " },
  { text: "claude", code: true },
  { text: ", puis " },
  { text: "/mcp", code: true },
  { text: ", puis cliquez sur « Actualiser »." },
];

/** Le titre de chaque groupe d'états. */
export const GROUP_TITLES: Readonly<Record<ServerStateItem, string>> = {
  connected: "Connectés",
  toConnect: "À connecter",
  failed: "En échec",
  notFound: "Introuvables",
};

/** L'ordre des groupes : ce qu'on peut cocher d'abord. */
const GROUP_ORDER: readonly ServerStateItem[] = ["connected", "toConnect", "failed", "notFound"];

/** Au-delà de ce nombre, les serveurs « À connecter » non cochés sont repliés au départ. */
export const FOLD_ABOVE = 5;

export type ConnectHint = typeof CONNECTOR_HINT | typeof TERMINAL_HINT;

/** Des serveurs de même état et de même origine, avec la phrase qui les concerne (seulement s'ils sont « À connecter »). */
export interface ServerBlock {
  readonly hint: ConnectHint | null;
  readonly servers: readonly McpServerItem[];
}

/** Un groupe d'états : son titre, son nombre de serveurs, ses blocs ; seul « À connecter » se replie. */
export interface ServerGroup {
  readonly state: ServerStateItem;
  readonly title: string;
  readonly count: number;
  readonly foldable: boolean;
  readonly blocks: readonly ServerBlock[];
}

function blocksOf(state: ServerStateItem, servers: readonly McpServerItem[]): ServerBlock[] {
  if (state !== "toConnect") return [{ hint: null, servers }];
  const connectors = servers.filter((server) => server.connector);
  const others = servers.filter((server) => !server.connector);
  const blocks: ServerBlock[] = [
    { hint: CONNECTOR_HINT, servers: connectors },
    { hint: TERMINAL_HINT, servers: others },
  ];
  return blocks.filter((block) => block.servers.length > 0);
}

/** Les groupes non vides, dans l'ordre : le tri par nom du moteur est gardé à l'intérieur de chacun. */
export function groupServers(servers: readonly McpServerItem[]): ServerGroup[] {
  return GROUP_ORDER.map((state) => ({ state, servers: servers.filter((s) => s.state === state) }))
    .filter(({ servers: listed }) => listed.length > 0)
    .map(({ state, servers: listed }) => ({
      state,
      title: GROUP_TITLES[state],
      count: listed.length,
      foldable: state === "toConnect" && listed.length > FOLD_ABOVE,
      blocks: blocksOf(state, listed),
    }));
}

/** Les serveurs d'un bloc qu'on montre : tous, ou seulement les cochés quand le groupe est replié. */
export function shown(block: ServerBlock, folded: boolean): readonly McpServerItem[] {
  return folded ? block.servers.filter((server) => server.allowed) : block.servers;
}

/** Le nombre de serveurs dans l'en-tête de la liste. */
export function countText(servers: readonly McpServerItem[]): string {
  return `${servers.length} ${servers.length === 1 ? "serveur" : "serveurs"}`;
}

/** Le bouton qui déplie ou replie les serveurs « À connecter » non cochés (leur nombre est dit en dépliant). */
export const unfoldText = (hidden: number): string =>
  hidden === 1 ? "Afficher le serveur non coché" : `Afficher les ${hidden} serveurs non cochés`;
export const FOLD_TEXT = "Masquer les serveurs non cochés";

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
