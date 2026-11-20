// Claude Code simulé pour les parcours : connecté par défaut ; `claude=missing`, `claude=loggedOut`
// ou `claude=failed` dans l'adresse donne la vérification de la connexion correspondante, avec le
// message de Rust. Chaque message envoyé rejoue un tour enregistré (`CLAUDE_TURN`) : Claude lit une
// note, se voit refuser un fichier hors de l'espace de travail, écrit `plan.md`, puis répond.
// `claudeTurn=hanging` : le tour attend d'être arrêté ; `claudeTurn=busy` : Claude répond déjà.
// `claudeAgents=1` : le tour rejoué lance des sous-agents (`AGENTS_TURN`, sur le modèle du flux
// enregistré `sub_agent.jsonl`) ; avec `claudeTurn=hanging`, il attend une fois les sous-agents lancés.
// `claudeWeb=1` : Claude cherche sur le web et sa modification est retenue par le garde-fou du web
// (`WEB_HELD_BACK`, sur le modèle du flux enregistré `web_held_back.jsonl`) ; un tour où
// l'utilisateur autorise les modifications écrit `plan.md`.
// `claudeTools=1` : Claude se sert des outils de l'application (`TOOLS_TURN`) : il demande ce que
// l'utilisateur regarde (la réponse de l'interface est gardée dans `claudeViews`), cherche avec
// l'index, puis montre la note `CLAUDE_SHOWN_NOTE`.
// Chaque tour commence par annoncer sa conversation : celle reçue, sinon une neuve (`conversation-1`,
// `conversation-2`…). Le tour rejoué annonce aussi la charge : le modèle `CLAUDE_MODEL`, la session utilisée à 16 %
// (`claudeLimit=85` : à 85 %, `claudeLimit=100` : limite atteinte), remise à zéro dans 59 min, et
// le contexte rempli à 42 %.
// Connecté au compte `CLAUDE_ACCOUNT` ; se déconnecter le laisse déconnecté ; se connecter donne
// l'adresse `CLAUDE_SIGN_IN_ADDRESS`, puis le connecte à `CLAUDE_OTHER_ACCOUNT`. `claudeLogin=hanging` :
// la connexion attend le navigateur jusqu'à être annulée ; `claudeLogin=failed` : elle n'aboutit pas.
import { emit } from "@tauri-apps/api/event";
import type { ClaudeEventItem, ClaudeStatusItem, TurnSettingsItem } from "../src/bridge";
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
  /** La conversation à continuer reçue avec chaque message, dans l'ordre (`null` : une neuve). */
  claudeConversations: (string | null)[];
  /** Les réglages reçus avec chaque message, dans l'ordre. */
  claudeSettings: TurnSettingsItem[];
  /** Vrai si le tour rejoué lit le web avant de modifier une note. */
  claudeWeb: boolean;
  /** Pour chaque message, dans l'ordre : vrai si les modifications après le web étaient autorisées. */
  claudeChangesAllowed: boolean[];
  /** Comment se passe chaque connexion : elle aboutit, attend le navigateur, ou échoue. */
  claudeLogin: "done" | "hanging" | "failed";
  /** Les connexions et déconnexions demandées, dans l'ordre. */
  claudeAccountCalls: string[];
  /** La part utilisée de la session annoncée par le tour rejoué, en pourcentage. */
  claudeLimit: number;
  /** Vrai si le tour rejoué se sert des outils de l'application. */
  claudeTools: boolean;
  /** Ce que l'interface a répondu à chaque demande de ce que l'utilisateur regarde. */
  claudeViews: { request: number; note: string | null; selection: string }[];
}

/** Le compte (inventé) auquel le faux Claude Code est connecté, puis celui de la connexion. */
export const CLAUDE_ACCOUNT = { email: "moi@example.com", organization: "Moi" };
export const CLAUDE_OTHER_ACCOUNT = { email: "autre@example.com", organization: "Autre" };
export const CLAUDE_SIGN_IN_ADDRESS = "https://claude.ai/oauth/authorize?faux=1";
export const CLAUDE_LOGIN_FAILED =
  "la connexion n'a pas abouti : réessayez, ou tapez « claude auth login » dans le Terminal";

/** Les messages de Rust, par vérification de la connexion qui empêche Claude Code de répondre. */
export const CLAUDE_UNAVAILABLE: Record<string, string> = {
  missing:
    "Claude Code n'est pas installé sur ce Mac : installez-le, tapez « claude auth login » dans le Terminal, puis rouvrez la colonne Claude Code",
  loggedOut:
    "Claude Code n'est pas connecté à votre abonnement Claude : cliquez sur « Se connecter », ou tapez « claude auth login » dans le Terminal puis rouvrez la colonne Claude Code",
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

/** Un tour qui lit le web, puis dont la modification de note est retenue par le garde-fou du web. */
const WEB_HELD_BACK: ClaudeEventItem[] = [
  {
    kind: "actionStarted",
    agent: null,
    id: "s",
    action: "webSearch",
    tool: null,
    target: "capitale de la Mongolie",
  },
  { kind: "actionFinished", id: "s", succeeded: true },
  { kind: "actionStarted", agent: null, id: "e", action: "edit", tool: null, target: at("a.md") },
  { kind: "changeHeldBack", id: "e" },
  { kind: "actionFinished", id: "e", succeeded: false },
  { kind: "message", agent: null, text: "Ma modification de a.md a été retenue." },
  { kind: "summary", failure: null, durationMs: 3000, tokens: 900 },
];

/** Le tour où l'utilisateur autorise les modifications : la note est écrite. */
const WEB_ALLOWED_BEFORE: ClaudeEventItem[] = [
  {
    kind: "actionStarted",
    agent: null,
    id: "w2",
    action: "write",
    tool: null,
    target: at(CLAUDE_NOTE.path),
  },
];
const WEB_ALLOWED_AFTER: ClaudeEventItem[] = [
  { kind: "actionFinished", id: "w2", succeeded: true },
  { kind: "changedNote", path: CLAUDE_NOTE.path },
  { kind: "summary", failure: null, durationMs: 2000, tokens: 500 },
];

/** La note que Claude montre à l'utilisateur dans le tour des outils de l'application. */
export const CLAUDE_SHOWN_NOTE = "b.md";

/** Un tour qui se sert des outils de l'application, jusqu'à la demande de ce que l'utilisateur regarde. */
const TOOLS_ASKING: ClaudeEventItem[] = [
  {
    kind: "actionStarted",
    agent: null,
    id: "v",
    action: "appTool",
    tool: "viewed_note",
    target: null,
  },
];
/** La suite : chercher avec l'index, puis montrer une note. */
const TOOLS_SHOWING: ClaudeEventItem[] = [
  { kind: "actionFinished", id: "v", succeeded: true },
  {
    kind: "actionStarted",
    agent: null,
    id: "s",
    action: "appTool",
    tool: "search_notes",
    target: "pain",
  },
  { kind: "actionFinished", id: "s", succeeded: true },
  {
    kind: "actionStarted",
    agent: null,
    id: "m",
    action: "appTool",
    tool: "show_note",
    target: CLAUDE_SHOWN_NOTE,
  },
];
const TOOLS_ENDED: ClaudeEventItem[] = [
  { kind: "actionFinished", id: "m", succeeded: true },
  { kind: "message", agent: null, text: "Voici la note." },
  { kind: "summary", failure: null, durationMs: 1000, tokens: 300 },
];

/** Le modèle qui répond au tour rejoué. */
export const CLAUDE_MODEL = "claude-opus-5-5";

/**
 * La charge annoncée à la fin du tour rejoué : la session utilisée à `percent`, remise à zéro dans
 * un peu moins de 59 minutes, la semaine à 12 %, le contexte à 42 %.
 */
function loadAnnounced(percent: number): ClaudeEventItem[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      kind: "usageLimits",
      reached: percent >= 100,
      windows: [
        { period: "session", percent, resetsAt: now + 59 * 60 - 30 },
        { period: "week", percent: 12, resetsAt: now + 3 * 24 * 3600 },
      ],
    },
    { kind: "contextFilled", used: 420_000, size: 1_000_000 },
  ];
}

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
  const login = params.get("claudeLogin");
  return {
    claude:
      reason === undefined ? { kind: "ready", ...CLAUDE_ACCOUNT } : { kind: "unavailable", reason },
    claudeLogin: login === "hanging" || login === "failed" ? login : "done",
    claudeAccountCalls: [],
    claudeTurn: turn === "hanging" || turn === "busy" ? turn : "replayed",
    claudeAgents: params.get("claudeAgents") === "1",
    claudeMessages: [],
    claudeConversations: [],
    claudeSettings: [],
    claudeWeb: params.get("claudeWeb") === "1",
    claudeChangesAllowed: [],
    claudeLimit: Number(params.get("claudeLimit") ?? 16),
    claudeTools: params.get("claudeTools") === "1",
    claudeViews: [],
  };
}

/**
 * Le début de chaque tour : le message, sa conversation et l'autorisation sont gardés ; Claude
 * refuse s'il répond déjà, sinon annonce la conversation, celle reçue ou une neuve, numérotée.
 */
function turnStarter(state: FakeClaude) {
  let started = 0;
  return async (message: string, conversation: string | null, changesAllowed: boolean) => {
    state.claudeMessages.push(message);
    state.claudeConversations.push(conversation);
    state.claudeChangesAllowed.push(changesAllowed);
    if (state.claudeTurn === "busy") throw { message: CLAUDE_BUSY };
    started += conversation === null ? 1 : 0;
    await announce([
      { kind: "conversationStarted", conversation: conversation ?? `conversation-${started}` },
    ]);
  };
}

/**
 * Le tour des outils de l'application : il demande ce que l'utilisateur regarde, attend la réponse
 * de l'interface (gardée), cherche avec l'index, puis montre une note.
 */
function toolsPlayer(state: FakeClaude) {
  let viewAnswered: (() => void) | null = null;
  return {
    play: async () => {
      await announce(TOOLS_ASKING);
      const answered = new Promise<void>((resolve) => (viewAnswered = resolve));
      await emit("claude-asks-view", 1);
      await answered;
      await announce(TOOLS_SHOWING);
      await emit("claude-shows-note", CLAUDE_SHOWN_NOTE);
      await announce(TOOLS_ENDED);
    },
    answerView: ({ request, note, selection }: Record<string, unknown>) => {
      state.claudeViews.push({
        request: Number(request),
        note: (note as string | null) ?? null,
        selection: String(selection),
      });
      viewAnswered?.();
      return null;
    },
  };
}

/**
 * Les commandes de Claude Code ; `write` écrit une note comme Claude, hors de l'application (le vrai
 * Rust l'apprend par la surveillance de l'espace de travail).
 */
/**
 * Un tour qui attend d'être arrêté. « Arrêter » cliqué avant que le tour n'en soit là n'est pas
 * perdu : il s'arrête dès qu'il y arrive.
 */
function stopper() {
  let stop: (() => void) | null = null;
  let asked = false;
  return {
    reset: () => void (asked = false),
    hang: () =>
      new Promise((_, reject) => {
        stop = () => reject({ message: CLAUDE_STOPPED });
        if (asked) stop();
      }),
    stop: () => {
      if (stop) stop();
      else asked = true;
      stop = null;
    },
  };
}

export function fakeClaude(
  state: FakeClaude,
  write: (path: string, content: string) => Promise<void>,
): Record<string, Handler> {
  const stopping = stopper();
  const start = turnStarter(state);
  const tools = toolsPlayer(state);
  const play = async (message: string, conversation: string | null, changesAllowed: boolean) => {
    stopping.reset();
    await start(message, conversation, changesAllowed);
    if (state.claudeTools) return tools.play().then(() => null);
    if (state.claudeWeb && !changesAllowed) return announce(WEB_HELD_BACK).then(() => null);
    if (state.claudeWeb) {
      await announce(WEB_ALLOWED_BEFORE);
      await write(CLAUDE_NOTE.path, CLAUDE_NOTE.content);
      await announce(WEB_ALLOWED_AFTER);
      return null;
    }
    const { hang } = stopping;
    if (state.claudeAgents) {
      await announce(AGENTS_LAUNCHED);
      if (state.claudeTurn === "hanging") await hang();
      await announce(AGENTS_ENDED);
      return null;
    }
    await announce([{ kind: "modelUsed", model: CLAUDE_MODEL }]);
    if (state.claudeTurn === "hanging") {
      await announce(BEFORE_WRITING.slice(0, 1));
      await hang();
    }
    await announce(BEFORE_WRITING);
    await write(CLAUDE_NOTE.path, CLAUDE_NOTE.content);
    await announce([...loadAnnounced(state.claudeLimit), ...AFTER_WRITING]);
    return null;
  };
  return {
    answer_view: tools.answerView,
    claude_status: () => state.claude,
    send_to_claude: ({ message, conversation, settings, changesAllowed }) => (
      state.claudeSettings.push(settings as TurnSettingsItem),
      play(String(message), (conversation as string | null) ?? null, changesAllowed === true)
    ),
    stop_claude: () => (stopping.stop(), null),
    log_out_of_claude: () => {
      state.claudeAccountCalls.push("logout");
      state.claude = { kind: "unavailable", reason: CLAUDE_UNAVAILABLE.loggedOut ?? "" };
      return null;
    },
    log_in_to_claude: async () => {
      state.claudeAccountCalls.push("login");
      stopping.reset();
      await emit("claude-sign-in", CLAUDE_SIGN_IN_ADDRESS);
      if (state.claudeLogin === "hanging") await stopping.hang();
      if (state.claudeLogin === "failed") throw { message: CLAUDE_LOGIN_FAILED };
      state.claude = { kind: "ready", ...CLAUDE_OTHER_ACCOUNT };
      return null;
    },
  };
}
