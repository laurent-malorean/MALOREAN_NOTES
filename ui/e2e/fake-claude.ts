// Claude Code simulé pour les parcours : connecté par défaut ; `claude=missing`, `claude=loggedOut`
// ou `claude=failed` dans l'adresse donne la vérification de la connexion correspondante, avec le
// message de Rust. Chaque message envoyé rejoue un tour enregistré (`CLAUDE_TURN`) : Claude lit une
// note, se voit refuser un fichier hors de l'espace de travail, écrit `plan.md`, puis répond.
// `claudeTurn=hanging` : le tour attend d'être arrêté ; `claudeTurn=busy` : Claude répond déjà.
// `claudeAgents=1` : le tour rejoué lance des sous-agents (`AGENTS_TURN`, sur le modèle du flux
// enregistré `sub_agent.jsonl`) ; avec `claudeTurn=hanging`, il attend une fois les sous-agents lancés.
import { emit } from "@tauri-apps/api/event";
import type { ClaudeEventItem, ClaudeStatusItem } from "../src/bridge";
import { FIRST } from "./fake-workspaces";

type Handler = (args: Record<string, unknown>) => unknown;

/** La partie de la doublure qui tient Claude Code. */
export interface FakeClaude {
  /** Ce que la vérification de la connexion répond. */
  claude: ClaudeStatusItem;
  /** Comment se passe chaque tour : rejoué jusqu'au bout, arrêté à la demande, ou refusé. */
  claudeTurn: "replayed" | "hanging" | "busy";
  /** Vrai si le tour rejoué lance des sous-agents. */
  claudeAgents: boolean;
  /** Les messages reçus, dans l'ordre. */
  claudeMessages: string[];
}

/** Les messages de Rust, par vérification de la connexion qui empêche Claude Code de répondre. */
export const CLAUDE_UNAVAILABLE: Record<string, string> = {
  missing:
    "Claude Code n'est pas installé sur ce Mac : installez-le, tapez « claude auth login » dans le Terminal, puis rouvrez la colonne Claude Code",
  loggedOut:
    "Claude Code n'est pas connecté à votre abonnement Claude : tapez « claude auth login » dans le Terminal, puis rouvrez la colonne Claude Code",
  failed:
    "Claude Code n'a pas pu dire s'il est connecté : tapez « claude auth status » dans le Terminal pour voir ce qui ne va pas",
};

/** Les messages de Rust quand un tour ne va pas au bout. */
export const CLAUDE_BUSY = "Claude répond déjà : attendez la fin de sa réponse ou arrêtez-la";
export const CLAUDE_STOPPED = "la réponse de Claude a été arrêtée";

/** La note que Claude écrit pendant le tour rejoué, et son texte. */
export const CLAUDE_NOTE = { path: "plan.md", content: "# Plan\n\nÉcrit par Claude.\n" };

const at = (path: string) => `${FIRST.path}/${path}`;

/** Le tour enregistré, jusqu'à l'écriture de la note. */
const BEFORE_WRITING: ClaudeEventItem[] = [
  { kind: "message", agent: null, text: "Je regarde vos notes." },
  { kind: "actionStarted", agent: null, id: "r", action: "read", tool: null, target: at("a.md") },
  { kind: "actionFinished", id: "r", succeeded: true },
  { kind: "actionStarted", agent: null, id: "x", action: "read", tool: null, target: "/etc/hosts" },
  { kind: "actionRefused", id: "x" },
  { kind: "actionFinished", id: "x", succeeded: false },
  {
    kind: "actionStarted",
    agent: null,
    id: "w",
    action: "write",
    tool: null,
    target: at(CLAUDE_NOTE.path),
  },
];

/** La suite du tour enregistré, une fois la note écrite. */
const AFTER_WRITING: ClaudeEventItem[] = [
  { kind: "actionFinished", id: "w", succeeded: true },
  { kind: "changedNote", path: CLAUDE_NOTE.path },
  { kind: "message", agent: null, text: "J'ai écrit **le plan**." },
  { kind: "summary", failure: null, durationMs: 4200, tokens: 1234 },
];

/** Un tour avec sous-agents, jusqu'à ce qu'ils travaillent tous : l'un en lance un autre. */
const AGENTS_LAUNCHED: ClaudeEventItem[] = [
  { kind: "message", agent: null, text: "Je lance un sous-agent." },
  {
    kind: "actionStarted",
    agent: null,
    id: "A",
    action: "subAgent",
    tool: null,
    target: "Compter les articles",
  },
  // Lancé en arrière-plan : l'issue de l'action dit seulement qu'il est lancé.
  { kind: "actionFinished", id: "A", succeeded: true },
  { kind: "actionStarted", agent: "A", id: "g", action: "search", tool: null, target: "**/*.md" },
  { kind: "actionFinished", id: "g", succeeded: true },
  {
    kind: "actionStarted",
    agent: "A",
    id: "B",
    action: "subAgent",
    tool: null,
    target: "Lire a.md",
  },
  { kind: "actionFinished", id: "B", succeeded: true },
  { kind: "actionStarted", agent: "B", id: "r", action: "read", tool: null, target: at("a.md") },
  { kind: "actionFinished", id: "r", succeeded: true },
];

/** La suite du tour avec sous-agents : chacun annonce sa fin, puis Claude répond. */
const AGENTS_ENDED: ClaudeEventItem[] = [
  { kind: "subAgentFinished", id: "B", state: "done", durationMs: 1200, tokens: 3000, actions: 1 },
  { kind: "message", agent: "A", text: "2 articles." },
  { kind: "subAgentFinished", id: "A", state: "done", durationMs: 3339, tokens: 8523, actions: 2 },
  { kind: "message", agent: null, text: "La note contient 2 articles." },
  { kind: "summary", failure: null, durationMs: 5000, tokens: 12000 },
];

/** Le temps entre deux événements : la réponse arrive au fil de l'eau. */
const STEP = 20;
const pause = () => new Promise((resolve) => setTimeout(resolve, STEP));

async function announce(events: readonly ClaudeEventItem[]) {
  for (const event of events) {
    await emit("claude-event", event);
    await pause();
  }
}

export function fakeClaudeState(params: URLSearchParams): FakeClaude {
  const reason = CLAUDE_UNAVAILABLE[params.get("claude") ?? ""];
  const turn = params.get("claudeTurn");
  return {
    claude: reason === undefined ? { kind: "ready" } : { kind: "unavailable", reason },
    claudeTurn: turn === "hanging" || turn === "busy" ? turn : "replayed",
    claudeAgents: params.get("claudeAgents") === "1",
    claudeMessages: [],
  };
}

/**
 * Les commandes de Claude Code ; `write` écrit une note comme Claude, hors de l'application (le vrai
 * Rust l'apprend par la surveillance de l'espace de travail).
 */
export function fakeClaude(
  state: FakeClaude,
  write: (path: string, content: string) => Promise<void>,
): Record<string, Handler> {
  let stop: (() => void) | null = null;
  const play = async (message: string) => {
    state.claudeMessages.push(message);
    if (state.claudeTurn === "busy") throw { message: CLAUDE_BUSY };
    const hang = () =>
      new Promise((_, reject) => (stop = () => reject({ message: CLAUDE_STOPPED })));
    if (state.claudeAgents) {
      await announce(AGENTS_LAUNCHED);
      if (state.claudeTurn === "hanging") await hang();
      await announce(AGENTS_ENDED);
      return null;
    }
    if (state.claudeTurn === "hanging") {
      await announce(BEFORE_WRITING.slice(0, 1));
      await hang();
    }
    await announce(BEFORE_WRITING);
    await write(CLAUDE_NOTE.path, CLAUDE_NOTE.content);
    await announce(AFTER_WRITING);
    return null;
  };
  return {
    claude_status: () => state.claude,
    send_to_claude: ({ message }) => play(String(message)),
    stop_claude: () => (stop?.(), (stop = null), null),
    new_conversation: () => null,
  };
}
