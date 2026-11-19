// Colonne Claude Code : l'en-tête, la conversation (messages, actions de Claude, notes modifiées,
// bilans), et la zone où l'on écrit son message (Entrée envoie, Maj+Entrée va à la ligne).
import {
  ACTION_STATES,
  type ChatEntry,
  type Conversation,
  shownTarget,
  summaryText,
} from "../state/claude-column";

export interface ClaudeColumnHandlers {
  send(text: string): void;
  stop(): void;
  newConversation(): void;
  close(): void;
  openNote(path: string): void;
  /** Le HTML du Markdown d'un message de Claude. */
  markdown(text: string): Promise<string>;
}

export interface ClaudeColumnView {
  /** Montre la conversation ; les cibles dans l'espace de travail `workspacePath` s'écrivent depuis lui. */
  render(conversation: Conversation, workspacePath: string): void;
  /** Montre pourquoi Claude Code ne peut pas répondre, ou rien ; l'écriture n'est possible que sans raison. */
  showUnavailable(reason: string | null): void;
  /** Met le curseur dans la zone du message. */
  focus(): void;
}

export const CHECKING_CLAUDE = "Vérification de Claude Code…";
export const WORKING = "Claude travaille…";
export const STOPPED = "Réponse arrêtée";
export const EMPTY =
  "Demandez à Claude de lire, créer ou modifier les notes de cet espace de travail.";

const TEMPLATE = `
  <header class="claude-header">
    <span class="claude-title">Claude Code</span>
    <button class="tool" data-new-conversation title="Oublier la conversation et en commencer une neuve">Nouvelle conversation</button>
    <button class="icon" data-close title="Masquer la colonne Claude Code (Ctrl+Cmd+L)" aria-label="Masquer la colonne Claude Code">×</button>
  </header>
  <p class="claude-unavailable" role="alert" hidden></p>
  <div class="claude-conversation" role="log" aria-live="polite"></div>
  <form class="claude-form">
    <textarea class="claude-input" rows="3" placeholder="Votre message à Claude" aria-label="Message à Claude" spellcheck="true"></textarea>
    <div class="claude-form-buttons">
      <button type="button" class="tool" data-stop hidden>Arrêter</button>
      <button type="submit" class="tool claude-send" data-send>Envoyer</button>
    </div>
  </form>`;

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

function entryView(entry: ChatEntry, context: Context) {
  switch (entry.kind) {
    case "user":
      return element("div", "claude-entry claude-user", entry.text);
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
  const rendered: RenderedMessages = new Map();
  const submit = () => {
    const text = input.value.trim();
    if (text === "" || running) return;
    input.value = "";
    handlers.send(text);
  };
  form.addEventListener("submit", (event) => (event.preventDefault(), submit()));
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submit();
  });
  stop.addEventListener("click", () => handlers.stop());
  fresh.addEventListener("click", () => handlers.newConversation());
  find<HTMLButtonElement>("[data-close]").addEventListener("click", () => handlers.close());
  return {
    render: (conversation, workspacePath) => {
      running = conversation.turn !== "idle";
      const context = { workspacePath, handlers, rendered };
      const entries = conversation.entries.map((entry) => entryView(entry, context));
      if (entries.length === 0) entries.push(element("p", "claude-empty", EMPTY));
      if (running) entries.push(element("div", "claude-working", WORKING));
      log.replaceChildren(...entries);
      log.scrollTop = log.scrollHeight;
      stop.hidden = !running;
      stop.disabled = conversation.turn === "stopping";
      send.hidden = running;
      fresh.disabled = running;
    },
    showUnavailable: (reason) => {
      unavailable.hidden = reason === null;
      unavailable.textContent = reason ?? "";
      input.disabled = reason !== null;
      send.disabled = reason !== null;
    },
    focus: () => input.focus(),
  };
}
