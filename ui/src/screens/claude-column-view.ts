// Colonne Claude Code : l'en-tête, les onglets de conversation, la conversation de l'onglet montré
// (messages, actions de Claude, notes modifiées, bilans), et la zone où l'on écrit son message
// (Entrée envoie, Maj+Entrée va à la ligne).
import {
  ACTION_STATES,
  changesHeldBack,
  type ChatEntry,
  type Conversation,
  shownTarget,
  summaryText,
} from "../state/claude-column";
import type { AgentMap } from "../state/agent-map";
import { createAgentMapView } from "./agent-map-view";
import { CLAUDE_RAY_COUNT, claudeRay } from "./claude-icon";
import {
  type ConversationTabsHandlers,
  createConversationTabsView,
  type ShownConversationTab,
} from "./claude-tabs-view";
import {
  createInputBarView,
  type InputBarHandlers,
  type InputBarView,
} from "./claude-input-bar-view";

export interface ClaudeColumnHandlers
  extends Omit<InputBarHandlers, "showAgentMap">, ConversationTabsHandlers {
  send(text: string): void;
  stop(): void;
  newConversation(): void;
  /** Autorise les modifications retenues par le garde-fou du web, pour le tour qu'il commence. */
  allowChanges(): void;
  close(): void;
  openNote(path: string): void;
  /** Le HTML du Markdown d'un message de Claude. */
  markdown(text: string): Promise<string>;
}

export interface ClaudeColumnView extends Omit<InputBarView, "showAgents"> {
  /**
   * Montre la conversation ; les cibles dans l'espace de travail `workspacePath` s'écrivent depuis
   * lui. `otherTabRunning` : un autre onglet de conversation répond, on ne peut pas envoyer ici.
   */
  render(conversation: Conversation, workspacePath: string, otherTabRunning?: boolean): void;
  /** Montre les onglets de conversation. */
  showTabs(tabs: readonly ShownConversationTab[]): void;
  /** Montre pourquoi Claude Code ne peut pas répondre, ou rien ; l'écriture n'est possible que sans raison. */
  showUnavailable(reason: string | null): void;
  /** Met le curseur dans la zone du message. */
  focus(): void;
  /**
   * Montre la carte des agents, cachée tant qu'aucun sous-agent n'a été lancé (sauf dépliée par la
   * pastille), et le nombre de sous-agents en cours dans la barre de saisie.
   */
  showAgents(map: AgentMap): void;
}

export const CHECKING_CLAUDE = "Vérification de Claude Code…";
export const WORKING = "Claude travaille…";
export const STOPPED = "Réponse arrêtée";
/** Pourquoi on ne peut pas envoyer : un seul tour à la fois (fiche 0032). */
export const OTHER_TAB_RUNNING =
  "Claude répond dans un autre onglet de conversation : attendez la fin de sa réponse, ou arrêtez-la depuis cet onglet, pour envoyer un message ici.";
export const EMPTY =
  "Demandez à Claude de lire, créer ou modifier les notes de cet espace de travail.";

/** Ce que dit la colonne quand le garde-fou du web a retenu des modifications (fiche 0032). */
export const WEB_HELD_BACK =
  "Claude a lu le web pendant cette réponse : ses modifications de notes ont été retenues, au cas où une page web lui aurait glissé des instructions. Autoriser ses modifications ?";

/** Un rayon de l'icône de Claude. */
function rayLine(index: number) {
  const {
    from: [x1, y1],
    to: [x2, y2],
  } = claudeRay(index);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
}

/** L'icône de Claude : douze rayons autour d'un centre vide, en `currentColor`. */
const CLAUDE_ICON = `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">${Array.from({ length: CLAUDE_RAY_COUNT }, (_, ray) => rayLine(ray)).join("")}</svg>`;

const TEMPLATE = `
  <header class="claude-header">
    <span class="claude-title">Claude Code</span>
    <button class="icon claude-new-conversation" data-new-conversation title="Nouvelle conversation : ouvrir un onglet de conversation vide ; les autres conversations restent dans leurs onglets" aria-label="Nouvelle conversation">${CLAUDE_ICON}</button>
    <button class="icon" data-close title="Masquer la colonne Claude Code (Ctrl+Cmd+L)" aria-label="Masquer la colonne Claude Code">×</button>
  </header>
  <div class="claude-tabs-bar"></div>
  <details class="claude-account"></details>
  <p class="claude-unavailable" role="alert" hidden></p>
  <details class="claude-agents" hidden></details>
  <div class="claude-conversation" role="log" aria-live="polite"></div>
  <form class="claude-form">
    <textarea class="claude-input" rows="3" placeholder="Votre message à Claude" aria-label="Message à Claude" spellcheck="true"></textarea>
    <div class="claude-input-bar">
      <div class="claude-chips"></div>
      <button type="button" class="claude-stop" data-stop hidden title="Arrêter la réponse" aria-label="Arrêter"><span class="claude-stop-square"></span></button>
      <button type="submit" class="claude-send" data-send title="Envoyer (Entrée)" aria-label="Envoyer">↑</button>
    </div>
  </form>
  `;

function element(tag: string, className: string, text = ""): HTMLElement {
  const created = document.createElement(tag);
  created.className = className;
  created.textContent = text;
  return created;
}

/** Une capitale au début d'un message d'erreur venu de Rust. */
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Le HTML de chaque message de Claude déjà mis en forme : la colonne est redessinée à chaque événement. */
type RenderedMessages = Map<string, string>;

interface Context {
  readonly workspacePath: string;
  readonly handlers: ClaudeColumnHandlers;
  readonly rendered: RenderedMessages;
}

function reply(entry: { text: string; subAgent: boolean }, { handlers, rendered }: Context) {
  const sub = entry.subAgent ? " claude-sub-agent" : "";
  const shown = element("div", `claude-entry claude-reply${sub}`, entry.text);
  const html = rendered.get(entry.text);
  if (html === undefined) {
    void handlers.markdown(entry.text).then((made) => {
      rendered.set(entry.text, made);
      shown.innerHTML = made;
    });
  } else shown.innerHTML = html;
  // Un lien du message ne fait pas quitter l'application.
  shown.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) event.preventDefault();
  });
  return shown;
}

function action(entry: Extract<ChatEntry, { kind: "action" }>, workspacePath: string) {
  const sub = entry.subAgent ? " claude-sub-agent" : "";
  const shown = element("div", `claude-action claude-action-${entry.state}${sub}`);
  shown.append(element("span", "claude-action-kind", entry.label));
  if (entry.target !== null) {
    shown.append(element("span", "claude-action-target", shownTarget(entry.target, workspacePath)));
  }
  const state = ACTION_STATES[entry.state];
  if (state !== null) shown.append(element("span", "claude-action-state", state));
  return shown;
}

function changedNote(path: string, handlers: ClaudeColumnHandlers) {
  const shown = element("div", "claude-changed-note", "Note modifiée : ");
  const open = element("button", "claude-note-link", path) as HTMLButtonElement;
  open.title = "Ouvrir la note";
  open.addEventListener("click", () => handlers.openNote(path));
  shown.append(open);
  return shown;
}

function userMessage({ text, notes }: { text: string; notes: readonly string[] }) {
  const shown = element("div", "claude-entry claude-user", text);
  if (notes.length > 0) {
    shown.append(element("div", "claude-user-notes", `Notes jointes : ${notes.join(", ")}`));
  }
  return shown;
}

function entryView(entry: ChatEntry, context: Context) {
  switch (entry.kind) {
    case "user":
      return userMessage(entry);
    case "claude":
      return reply(entry, context);
    case "action":
      return action(entry, context.workspacePath);
    case "changedNote":
      return changedNote(entry.path, context.handlers);
    case "summary":
      return entry.failure === null
        ? element("div", "claude-summary", summaryText(entry.durationMs, entry.tokens))
        : element("div", "claude-error", `Claude n'a pas pu répondre : ${entry.failure}`);
    case "error":
      return element("div", "claude-error", capitalized(entry.message));
    case "stopped":
      return element("div", "claude-summary", STOPPED);
  }
}

/** L'explication des modifications retenues, et le bouton qui les autorise, sauf `blocked`. */
function heldBack(handlers: ClaudeColumnHandlers, blocked: boolean) {
  const shown = element("div", "claude-held-back");
  shown.setAttribute("role", "alert");
  const allow = element(
    "button",
    "tool claude-allow-changes",
    "Autoriser ses modifications",
  ) as HTMLButtonElement;
  allow.title = "Claude refait les modifications retenues, pour cette réponse seulement";
  allow.disabled = blocked;
  allow.addEventListener("click", () => handlers.allowChanges());
  shown.append(element("p", "claude-held-back-text", WEB_HELD_BACK), allow);
  return shown;
}

/** Entrée (sans Maj ni composition) ou Envoyer fait partir le message, sauf `blocked`. */
function connectForm(
  form: HTMLFormElement,
  input: HTMLTextAreaElement,
  send: (text: string) => void,
  blocked: () => boolean,
) {
  const submit = () => {
    const text = input.value.trim();
    if (text === "" || blocked()) return;
    input.value = "";
    send(text);
  };
  form.addEventListener("submit", (event) => (event.preventDefault(), submit()));
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submit();
  });
}

/** La carte des agents et la barre de saisie, dont la pastille des sous-agents déplie la carte. */
function agentsAndBar(find: (selector: string) => HTMLElement, handlers: ClaudeColumnHandlers) {
  const agentMap = find(".claude-agents") as HTMLDetailsElement;
  const showMap = createAgentMapView(agentMap);
  const bar = createInputBarView(find(".claude-chips"), {
    ...handlers,
    showAgentMap: () => {
      agentMap.hidden = false;
      agentMap.open = true;
    },
  });
  return { ...bar, showAgents: (map: AgentMap) => (showMap(map), bar.showAgents(map)) };
}

/** Remplit la colonne `container` et branche ses boutons et sa zone de message. */
export function createClaudeColumnView(
  container: HTMLElement,
  handlers: ClaudeColumnHandlers,
): ClaudeColumnView {
  container.innerHTML = TEMPLATE;
  const find = <T extends HTMLElement>(selector: string) => container.querySelector(selector) as T;
  const unavailable = find<HTMLElement>(".claude-unavailable");
  const log = find<HTMLElement>(".claude-conversation");
  const form = find<HTMLFormElement>(".claude-form");
  const input = find<HTMLTextAreaElement>(".claude-input");
  const send = find<HTMLButtonElement>("[data-send]");
  const stop = find<HTMLButtonElement>("[data-stop]");
  const fresh = find<HTMLButtonElement>("[data-new-conversation]");
  let running = false;
  let otherRunning = false;
  let unavailableShown = false;
  const rendered: RenderedMessages = new Map();
  const showSend = () => {
    send.disabled = unavailableShown || otherRunning;
  };
  connectForm(
    form,
    input,
    (text) => handlers.send(text),
    () => running || otherRunning,
  );
  stop.addEventListener("click", () => handlers.stop());
  fresh.addEventListener("click", () => handlers.newConversation());
  find<HTMLButtonElement>("[data-close]").addEventListener("click", () => handlers.close());
  return {
    ...agentsAndBar(find, handlers),
    showTabs: createConversationTabsView(find(".claude-tabs-bar"), handlers),
    render: (conversation, workspacePath, otherTabRunning = false) => {
      running = conversation.turn !== "idle";
      otherRunning = otherTabRunning;
      const context = { workspacePath, handlers, rendered };
      const entries = conversation.entries.map((entry) => entryView(entry, context));
      if (entries.length === 0) entries.push(element("p", "claude-empty", EMPTY));
      if (running) entries.push(element("div", "claude-working", WORKING));
      if (changesHeldBack(conversation)) entries.push(heldBack(handlers, otherRunning));
      if (otherRunning) entries.push(element("p", "claude-other-tab", OTHER_TAB_RUNNING));
      log.replaceChildren(...entries);
      log.scrollTop = log.scrollHeight;
      stop.hidden = !running;
      stop.disabled = conversation.turn === "stopping";
      send.hidden = running;
      showSend();
    },
    showUnavailable: (reason) => {
      unavailable.hidden = reason === null;
      unavailable.textContent = reason ?? "";
      input.disabled = reason !== null;
      unavailableShown = reason !== null;
      showSend();
    },
    focus: () => input.focus(),
  };
}
