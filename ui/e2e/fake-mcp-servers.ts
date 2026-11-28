// Serveurs MCP extérieurs simulés pour les parcours (fiche 0105) : Rust répond comme le contrat de la spécification
// « serveurs-mcp » § 8, sans Claude Code. Le moteur garde les serveurs cochés (jamais dans l'espace de travail) ; un serveur
// coché que la liste ne contient plus revient « introuvable ». Paramètres d'adresse : `mcp` = `absent` (Claude Code
// n'est pas là : une phrase, aucune liste), `empty` (aucun serveur connu), `failing` (la lecture échoue), `many` (huit connecteurs « À connecter » de plus) ; `mcpDelay` :
// durée de la lecture, en millisecondes.
import type { McpServerItem, McpServersItem } from "../src/bridge";

type Handler = (args: Record<string, unknown>) => unknown;

export interface FakeMcpServersState {
  /** Les serveurs que Claude Code connaît (nom tel que Claude Code le donne), hors plugins. */
  known: McpServerItem[];
  /** Les noms cochés, dans l'ordre du cochage. */
  allowed: string[];
  /** Mode : `absent`, `empty`, `failing`, `many` ou rien. */
  mode: string | null;
  /** Durée d'une lecture, en millisecondes. */
  delay: number;
  /** Combien de lectures ont été demandées. */
  reads: number;
}

export interface FakeMcpServers {
  mcpServers: FakeMcpServersState;
}

const ABSENT =
  "Claude Code n'est pas installé sur ce Mac : voyez la colonne Claude Code, puis cliquez sur « Actualiser ».";

const server = (name: string, state: McpServerItem["state"], connector = true): McpServerItem => ({
  name: connector ? `claude.ai ${name}` : name,
  displayName: name,
  connector,
  state,
  allowed: false,
});

const MANY = Array.from({ length: 8 }, (_, i) => server(`Service ${i + 1}`, "toConnect"));

export function fakeMcpServersState(params: URLSearchParams): FakeMcpServers {
  return {
    mcpServers: {
      known: [
        server("Slack", "connected"),
        server("Figma", "toConnect"),
        server("Noota", "connected"),
        server("Notion", "connected"),
        server("Atlassian", "connected"),
        server("mon-serveur", "toConnect", false),
        server("serveur-en-panne", "failed", false),
        ...(params.get("mcp") === "many" ? MANY : []),
      ],
      allowed: JSON.parse(params.get("mcpAllowed") ?? "[]") as string[],
      mode: params.get("mcp"),
      delay: Number(params.get("mcpDelay") ?? 0),
      reads: 0,
    },
  };
}

/** Le tri du moteur : par nom montré, casse ignorée ; les cochés disparus restent, « introuvables ». */
function listing({ known, allowed }: FakeMcpServersState): McpServersItem {
  const lines = known.map((line) => ({ ...line, allowed: allowed.includes(line.name) }));
  for (const name of allowed) {
    if (known.some((line) => line.name === name)) continue;
    const connector = name.startsWith("claude.ai ");
    const display = connector ? name.slice("claude.ai ".length) : name;
    lines.push({ name, displayName: display, connector, state: "notFound", allowed: true });
  }
  lines.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));
  return { kind: "listed", servers: lines };
}

export function fakeMcpServers(state: FakeMcpServers): Record<string, Handler> {
  const { mcpServers } = state;
  return {
    list_mcp_servers: async () => {
      mcpServers.reads += 1;
      await new Promise((resolve) => setTimeout(resolve, mcpServers.delay));
      if (mcpServers.mode === "absent") return { kind: "unavailable", message: ABSENT };
      if (mcpServers.mode === "failing") throw { message: "stockage indisponible : préférences" };
      if (mcpServers.mode === "empty") return { kind: "listed", servers: [] };
      return listing(mcpServers);
    },
    allow_mcp_server: ({ name }) => {
      if (!mcpServers.allowed.includes(name as string)) mcpServers.allowed.push(name as string);
      return null;
    },
    disallow_mcp_server: ({ name }) => {
      mcpServers.allowed = mcpServers.allowed.filter((each) => each !== name);
      return null;
    },
  };
}
