// Colonne Claude Code : la conversation telle que la colonne la montre (messages, actions de
// Claude, notes modifiées, bilans), construite à partir des événements de Claude (fiche 0032).
import type { ActionKindItem, ClaudeEventItem } from "../bridge";

/** Où en est une action de Claude. */
export type ActionState = "running" | "succeeded" | "failed" | "refused";

/** Une ligne de la conversation, dans l'ordre où elle arrive. */
export type ChatEntry =
  | { readonly kind: "user"; readonly text: string }
  | { readonly kind: "claude"; readonly text: string; readonly subAgent: boolean }
  | {
      readonly kind: "action";
      readonly id: string;
      readonly label: string;
      readonly target: string | null;
      readonly subAgent: boolean;
      readonly state: ActionState;
    }
  | { readonly kind: "changedNote"; readonly path: string }
  | {
      readonly kind: "summary";
      readonly failure: string | null;
      readonly durationMs: number;
      readonly tokens: number;
    }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "stopped" };

/** Pas de tour, un tour en cours, ou un tour dont l'arrêt est demandé. */
export type TurnState = "idle" | "running" | "stopping";

export interface Conversation {
  readonly entries: readonly ChatEntry[];
  readonly turn: TurnState;
}

export const NEW_CONVERSATION: Conversation = { entries: [], turn: "idle" };

/** Ce que fait chaque sorte d'action, comme la colonne l'écrit. */
export const ACTION_LABELS: Readonly<Record<ActionKindItem, string>> = {
  read: "Lecture",
  search: "Recherche",
  write: "Écriture",
  edit: "Modification",
  subAgent: "Sous-agent",
  other: "Outil",
};

/** Le mot qui suit une action selon son état ; rien tant qu'elle tourne ou si elle a réussi. */
export const ACTION_STATES: Readonly<Record<ActionState, string | null>> = {
  running: null,
  succeeded: null,
  failed: "en erreur",
  refused: "refusée",
};

/** Où commence le tour en cours : après le dernier message de l'utilisateur. */
const turnStart = (entries: readonly ChatEntry[]) =>
  entries.map((entry) => entry.kind).lastIndexOf("user") + 1;

/** Le message de l'utilisateur part : un tour commence. */
export function messageSent(conversation: Conversation, text: string): Conversation {
  return { entries: [...conversation.entries, { kind: "user", text }], turn: "running" };
}

/** L'arrêt du tour est demandé. */
export function stopAsked(conversation: Conversation): Conversation {
  return conversation.turn === "running" ? { ...conversation, turn: "stopping" } : conversation;
}

const withActionState = (entries: readonly ChatEntry[], id: string, state: ActionState) =>
  entries.map((entry) =>
    // Un refus reste un refus : l'issue en erreur qui le suit ne dit rien de plus.
    // Stryker disable next-line ConditionalExpression: seule une action a un identifiant, la condition suivante écarte aussi les autres lignes ; TypeScript exige la première.
    entry.kind === "action" && entry.id === id && entry.state !== "refused"
      ? { ...entry, state }
      : entry,
  );

/** Une note modifiée n'est montrée qu'une fois par tour. */
function withChangedNote(entries: readonly ChatEntry[], path: string): readonly ChatEntry[] {
  const same = (entry: ChatEntry) =>
    // Stryker disable next-line ConditionalExpression: seule une note modifiée a un chemin, la condition suivante écarte aussi les autres lignes ; TypeScript exige la première.
    entry.kind === "changedNote" && entry.path === path;
  const known = entries.slice(turnStart(entries)).some(same);
  return known ? entries : [...entries, { kind: "changedNote", path }];
}

/** Le dernier bilan du tour fait foi : il remplace le précédent. */
function withSummary(
  entries: readonly ChatEntry[],
  { kind, failure, durationMs, tokens }: Extract<ClaudeEventItem, { kind: "summary" }>,
): readonly ChatEntry[] {
  const start = turnStart(entries);
  return [
    ...entries.filter((entry, at) => at < start || entry.kind !== "summary"),
    { kind, failure, durationMs, tokens },
  ];
}

function withEvent(entries: readonly ChatEntry[], event: ClaudeEventItem): readonly ChatEntry[] {
  switch (event.kind) {
    case "message":
      return [...entries, { kind: "claude", text: event.text, subAgent: event.agent !== null }];
    case "actionStarted":
      return [
        ...entries,
        {
          kind: "action",
          id: event.id,
          label: event.tool ?? ACTION_LABELS[event.action],
          target: event.target,
          subAgent: event.agent !== null,
          state: "running",
        },
      ];
    case "actionFinished":
      return withActionState(entries, event.id, event.succeeded ? "succeeded" : "failed");
    case "actionRefused":
      return withActionState(entries, event.id, "refused");
    case "changedNote":
      return withChangedNote(entries, event.path);
    case "summary":
      return withSummary(entries, event);
    case "subAgentFinished":
      return entries;
  }
}

/** Un événement de Claude est arrivé. */
export function eventReceived(conversation: Conversation, event: ClaudeEventItem): Conversation {
  return { ...conversation, entries: withEvent(conversation.entries, event) };
}

/** Le tour est fini, normalement (`error` nul) ou en erreur ; une erreur après l'arrêt demandé est l'arrêt. */
export function turnEnded(conversation: Conversation, error: string | null): Conversation {
  const ending: ChatEntry[] =
    error === null
      ? []
      : conversation.turn === "stopping"
        ? [{ kind: "stopped" }]
        : [{ kind: "error", message: error }];
  return { entries: [...conversation.entries, ...ending], turn: "idle" };
}

/** La cible d'une action telle que la colonne l'écrit : un fichier de l'espace de travail, depuis lui. */
export function shownTarget(target: string, workspacePath: string): string {
  const root = workspacePath.endsWith("/") ? workspacePath : `${workspacePath}/`;
  return target.startsWith(root) ? target.slice(root.length) : target;
}

/** Les secondes sont déjà arrondies au dixième : le format n'y ajoute que la virgule. */
const SECONDS = new Intl.NumberFormat("fr-FR");
const COUNT = new Intl.NumberFormat("fr-FR");

/** Une durée en français : « 12,3 s », « 2 min 05 s ». */
export function durationText(durationMs: number): string {
  const seconds = Math.round(durationMs / 100) / 10;
  const whole = Math.round(seconds);
  return seconds < 60
    ? `${SECONDS.format(seconds)} s`
    : `${Math.floor(whole / 60)} min ${String(whole % 60).padStart(2, "0")} s`;
}

/** Un nombre de jetons en français : « 1 234 jetons », « 1 jeton ». */
export const tokensText = (tokens: number) =>
  `${COUNT.format(tokens)} ${tokens > 1 ? "jetons" : "jeton"}`;

/** La durée et les jetons d'un bilan, en petit sous la réponse : « 12,3 s · 1 234 jetons ». */
export const summaryText = (durationMs: number, tokens: number) =>
  `${durationText(durationMs)} · ${tokensText(tokens)}`;
