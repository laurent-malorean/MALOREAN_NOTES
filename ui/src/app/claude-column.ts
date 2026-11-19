// Colonne Claude Code : affichée ou masquée par sa commande ; à l'ouverture, demande si Claude Code
// peut répondre. Envoie les messages, avec les réglages du tour et les notes jointes, suit les
// événements du tour en cours et sa durée, l'arrête, commence une nouvelle conversation ; une note
// modifiée par Claude s'ouvre d'un clic. La carte des agents suit les mêmes événements ; le compte
// Claude se montre et se change en haut de la colonne (fiche 0032).
import type * as Bridge from "../bridge";
import { noteHtml } from "../rendering/note-html";
import {
  CHECKING_CLAUDE,
  type ClaudeColumnView,
  createClaudeColumnView,
} from "../screens/claude-column-view";
import type { Layout } from "../screens/layout";
import { type Account, createAccount } from "./claude-account";
import { createInputBar } from "./claude-input-bar";
import { type AgentMap, agentEventReceived, agentTurnEnded, NO_AGENTS } from "../state/agent-map";
import { messageWithNotes } from "../state/claude-input-bar";
import type { Columns } from "../state/columns";
import type { PreferenceStorage } from "../state/focus-preference";
import {
  type Conversation,
  eventReceived,
  messageSent,
  NEW_CONVERSATION,
  stopAsked,
  turnEnded,
} from "../state/claude-column";

export interface ClaudeColumnDeps {
  readonly backend: Pick<
    typeof Bridge,
    | "claudeStatus"
    | "sendToClaude"
    | "stopClaude"
    | "newConversation"
    | "onClaudeEvent"
    | "errorMessage"
    | "listAllNotes"
    | "logOutOfClaude"
    | "logInToClaude"
    | "onClaudeSignIn"
    | "copyPlainText"
  >;
  readonly layout: Pick<Layout, "claudeColumn" | "claudeButton" | "picker">;
  /** Les colonnes d'édition : la note de la colonne active est jointe au message. */
  readonly columns: { current(): Columns };
  /** Là où les réglages du tour sont gardés d'un lancement à l'autre. */
  readonly storage: PreferenceStorage;
  /** Le dossier de l'espace de travail ouvert. */
  readonly workspace: { path(): string };
  /** Ouvre une note modifiée par Claude dans la colonne active. */
  openNote(path: string): void;
  error(error: unknown): void;
}

export interface ClaudeColumn {
  /** Affiche la colonne, ou la masque. */
  toggle(): void;
  /**
   * Suit l'espace de travail ouvert (un autre commence une conversation neuve) et la note de la
   * colonne active, jointe au message.
   */
  follow(): void;
}

/** Les images d'un message de Claude ne sont pas chargées : il n'en montre que le texte. */
const markdown = (text: string) => noteHtml(text, { resolveImage: () => "" });

/**
 * Demande si Claude Code peut répondre, et avec quel compte ; le dit, puis met le curseur dans la
 * zone du message.
 */
async function checkStatus(
  view: ClaudeColumnView,
  backend: ClaudeColumnDeps["backend"],
  account: Account,
) {
  view.showUnavailable(CHECKING_CLAUDE);
  account.showStatus(null);
  const status = await backend.claudeStatus().catch((error: unknown): Bridge.ClaudeStatusItem => ({
    kind: "unavailable",
    reason: backend.errorMessage(error),
  }));
  view.showUnavailable(status.kind === "unavailable" ? status.reason : null);
  account.showStatus(status);
  view.focus();
}

/** Affiche la colonne, ou la masque ; `shown` est appelé quand elle s'affiche. */
function toggler(layout: ClaudeColumnDeps["layout"], shown: () => void) {
  return () => {
    const hidden = !layout.claudeColumn.hidden;
    layout.claudeColumn.hidden = hidden;
    layout.claudeButton.setAttribute("aria-pressed", String(!hidden));
    if (!hidden) shown();
  };
}

/** Le compte Claude en haut de la colonne ; `changed` oublie la conversation. */
function accountOf(deps: ClaudeColumnDeps, view: ClaudeColumnView, changed: () => void): Account {
  const container = deps.layout.claudeColumn.querySelector(".claude-account");
  const account: Account = createAccount(container as HTMLDetailsElement, {
    ...{ backend: deps.backend, error: deps.error, changed },
    refresh: () => void checkStatus(view, deps.backend, account),
    busy: (reason) => view.showUnavailable(reason),
  });
  return account;
}

export function createClaudeColumn(deps: ClaudeColumnDeps): ClaudeColumn {
  const { backend, layout } = deps;
  let conversation: Conversation = NEW_CONVERSATION;
  let agents: AgentMap = NO_AGENTS;
  let workspacePath = deps.workspace.path();
  const bar = createInputBar({ ...deps, picker: layout.picker }, () => view);
  const update = (next: Conversation, nextAgents: AgentMap = agents) => {
    conversation = next;
    agents = nextAgents;
    view.render(conversation, workspacePath);
    view.showAgents(agents);
    account.turnRunning(conversation.turn !== "idle");
  };
  const ended = (error: string | null) => {
    bar.timeReply(false);
    update(turnEnded(conversation, error), agentTurnEnded(agents, error !== null));
  };
  const send = (text: string) => {
    const notes = bar.sent();
    update(
      messageSent(
        conversation,
        text,
        notes.map((note) => note.title),
      ),
    );
    bar.timeReply(true);
    backend.sendToClaude(messageWithNotes(text, notes), bar.settings()).then(
      () => ended(null),
      (error: unknown) => ended(backend.errorMessage(error)),
    );
  };
  const view: ClaudeColumnView = createClaudeColumnView(layout.claudeColumn, {
    ...{ send, openNote: deps.openNote, markdown, close: () => toggle() },
    ...{ chooseSettings: bar.chooseSettings, attach: bar.attach, detach: bar.detach },
    stop: () => {
      update(stopAsked(conversation));
      backend.stopClaude().catch(deps.error);
    },
    newConversation: () =>
      void backend.newConversation().then(() => update(NEW_CONVERSATION, NO_AGENTS), deps.error),
  });
  const account = accountOf(deps, view, () => update(NEW_CONVERSATION, NO_AGENTS));
  const toggle = toggler(layout, () => void checkStatus(view, backend, account));
  layout.claudeButton.addEventListener("click", toggle);
  void backend.onClaudeEvent((event) =>
    update(eventReceived(conversation, event), agentEventReceived(agents, event)),
  );
  update(conversation);
  view.showSettings(bar.settings());
  const follow = () => {
    const changed = deps.workspace.path() !== workspacePath;
    bar.follow(changed);
    if (!changed) return;
    workspacePath = deps.workspace.path();
    update({ ...NEW_CONVERSATION, turn: conversation.turn }, NO_AGENTS);
  };
  follow();
  return { toggle, follow };
}
