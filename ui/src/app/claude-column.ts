// Colonne Claude Code : affichée ou masquée par sa commande ; à l'ouverture, demande si Claude Code
// peut répondre. Envoie les messages, suit les événements du tour en cours, l'arrête, commence une
// nouvelle conversation ; une note modifiée par Claude s'ouvre d'un clic. La carte des agents suit
// les mêmes événements (fiche 0032).
import type * as Bridge from "../bridge";
import { noteHtml } from "../rendering/note-html";
import {
  CHECKING_CLAUDE,
  type ClaudeColumnView,
  createClaudeColumnView,
} from "../screens/claude-column-view";
import type { Layout } from "../screens/layout";
import { type AgentMap, agentEventReceived, agentTurnEnded, NO_AGENTS } from "../state/agent-map";
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
  >;
  readonly layout: Pick<Layout, "claudeColumn" | "claudeButton">;
  /** Le dossier de l'espace de travail ouvert. */
  readonly workspace: { path(): string };
  /** Ouvre une note modifiée par Claude dans la colonne active. */
  openNote(path: string): void;
  error(error: unknown): void;
}

export interface ClaudeColumn {
  /** Affiche la colonne, ou la masque. */
  toggle(): void;
  /** Suit l'espace de travail ouvert : un autre commence une conversation neuve. */
  follow(): void;
}

/** Les images d'un message de Claude ne sont pas chargées : il n'en montre que le texte. */
const markdown = (text: string) => noteHtml(text, { resolveImage: () => "" });

/** Demande si Claude Code peut répondre, le dit, puis met le curseur dans la zone du message. */
async function checkStatus(view: ClaudeColumnView, backend: ClaudeColumnDeps["backend"]) {
  view.showUnavailable(CHECKING_CLAUDE);
  const status = await backend.claudeStatus().catch((error: unknown): Bridge.ClaudeStatusItem => ({
    kind: "unavailable",
    reason: backend.errorMessage(error),
  }));
  view.showUnavailable(status.kind === "unavailable" ? status.reason : null);
  view.focus();
}

export function createClaudeColumn(deps: ClaudeColumnDeps): ClaudeColumn {
  const { backend, layout } = deps;
  let conversation: Conversation = NEW_CONVERSATION;
  let agents: AgentMap = NO_AGENTS;
  let workspacePath = deps.workspace.path();
  const update = (next: Conversation, nextAgents: AgentMap = agents) => {
    conversation = next;
    agents = nextAgents;
    view.render(conversation, workspacePath);
    view.showAgents(agents);
  };
  const ended = (error: string | null) =>
    update(turnEnded(conversation, error), agentTurnEnded(agents, error !== null));
  const send = (text: string) => {
    update(messageSent(conversation, text));
    backend.sendToClaude(text).then(
      () => ended(null),
      (error: unknown) => ended(backend.errorMessage(error)),
    );
  };
  const view: ClaudeColumnView = createClaudeColumnView(layout.claudeColumn, {
    send,
    stop: () => {
      update(stopAsked(conversation));
      backend.stopClaude().catch(deps.error);
    },
    newConversation: () =>
      void backend.newConversation().then(() => update(NEW_CONVERSATION, NO_AGENTS), deps.error),
    close: () => toggle(),
    openNote: deps.openNote,
    markdown,
  });
  const toggle = () => {
    const shown = layout.claudeColumn.hidden;
    layout.claudeColumn.hidden = !shown;
    layout.claudeButton.setAttribute("aria-pressed", String(shown));
    if (shown) void checkStatus(view, backend);
  };
  layout.claudeButton.addEventListener("click", toggle);
  void backend.onClaudeEvent((event) =>
    update(eventReceived(conversation, event), agentEventReceived(agents, event)),
  );
  update(conversation);
  return {
    toggle,
    follow: () => {
      if (deps.workspace.path() === workspacePath) return;
      workspacePath = deps.workspace.path();
      update({ ...NEW_CONVERSATION, turn: conversation.turn }, NO_AGENTS);
    },
  };
}
