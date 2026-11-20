// Colonne Claude Code : affichée ou masquée par sa commande ; à l'ouverture, demande si Claude Code
// peut répondre. Tient les onglets de conversation de chaque espace de travail (« Nouvelle
// conversation » en ouvre un) ; envoie les messages de l'onglet montré, avec les réglages du tour
// et les notes jointes, dans sa conversation ; suit les événements du tour en cours (un seul à la
// fois, tous onglets confondus) dans l'onglet qui l'a lancé, et sa durée ; l'arrête ; autorise les
// modifications retenues par le garde-fou du web ; une note modifiée par Claude s'ouvre d'un clic.
// La carte des agents et la charge (version du modèle, limite d'utilisation, contexte) suivent les
// mêmes événements ; le compte Claude se montre et se change en haut de la colonne (fiche 0032).
import type * as Bridge from "../bridge";
import { noteHtml } from "../rendering/note-html";
import {
  CHECKING_CLAUDE,
  type ClaudeColumnView,
  createClaudeColumnView,
} from "../screens/claude-column-view";
import type { Layout } from "../screens/layout";
import { type Account, createAccount } from "./claude-account";
import { createInputBar, type InputBar } from "./claude-input-bar";
import { ALLOW_CHANGES_MESSAGE } from "../state/claude-column";
import { messageWithNotes } from "../state/claude-input-bar";
import { type ConversationTabsKeeper, createConversationTabsKeeper } from "./claude-tabs";
import {
  activeConversationTab,
  type ConversationTabs,
  tabClosed,
  tabEventReceived,
  tabMessageSent,
  tabOpened,
  tabShown,
  tabStopAsked,
  tabTitle,
  tabTurnEnded,
  tabUpdated,
} from "../state/claude-tabs";
import type { Columns } from "../state/columns";
import type { PreferenceStorage } from "../state/focus-preference";
import { loadTemplatesFolder } from "../state/templates-folder";

export interface ClaudeColumnDeps {
  readonly backend: Pick<
    typeof Bridge,
    | "claudeStatus"
    | "sendToClaude"
    | "stopClaude"
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
   * Suit l'espace de travail ouvert (un autre montre ses onglets de conversation) et la note de la
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

/** Le compte Claude en haut de la colonne ; `changed` oublie les conversations. */
function accountOf(deps: ClaudeColumnDeps, view: ClaudeColumnView, changed: () => void): Account {
  const container = deps.layout.claudeColumn.querySelector(".claude-account");
  const account: Account = createAccount(container as HTMLDetailsElement, {
    ...{ backend: deps.backend, error: deps.error, changed },
    refresh: () => void checkStatus(view, deps.backend, account),
    busy: (reason) => view.showUnavailable(reason),
  });
  return account;
}

/**
 * Suit l'espace de travail ouvert (un autre montre ses onglets de conversation, par `show`) et la
 * note de la colonne active, jointe au message.
 */
function workspaceFollower(
  workspace: ClaudeColumnDeps["workspace"],
  bar: InputBar,
  show: () => void,
) {
  let current = workspace.path();
  return () => {
    const changed = workspace.path() !== current;
    bar.follow(changed);
    if (!changed) return;
    current = workspace.path();
    show();
  };
}

/** Ce que la barre des onglets montre de chaque onglet de conversation. */
const shownTabs = ({ tabs, active }: ConversationTabs) =>
  tabs.map((tab) => ({
    id: tab.id,
    title: tabTitle(tab),
    running: tab.conversation.turn !== "idle",
    active: tab.id === active,
  }));

/**
 * Commence un tour dans l'onglet montré : `text` dans sa conversation, `message` envoyé à Claude
 * dans la conversation de l'onglet ; ses événements et sa fin vont à cet onglet.
 */
function player(
  { backend, storage }: Pick<ClaudeColumnDeps, "backend" | "storage">,
  tabs: ConversationTabsKeeper,
  bar: InputBar,
  here: () => string,
) {
  return (text: string, notes: readonly string[], message: string, allowed: boolean) => {
    const tab = activeConversationTab(tabs.shown());
    const at = { workspace: here(), tab: tab.id };
    const ended = (error: string | null) => {
      tabs.started(null);
      tabs.changeTab(at, (shown) => tabTurnEnded(shown, error));
    };
    tabs.started({ ...at, since: Date.now() });
    tabs.changeTab(at, (shown) => tabMessageSent(shown, text, notes));
    // Le dossier des modèles de l'espace de travail sert aux outils de l'application.
    const templates = loadTemplatesFolder(storage, here());
    backend.sendToClaude(message, tab.conversationId, bar.settings(), allowed, templates).then(
      () => ended(null),
      (error: unknown) => ended(backend.errorMessage(error)),
    );
  };
}

export function createClaudeColumn(deps: ClaudeColumnDeps): ClaudeColumn {
  const { backend, layout } = deps;
  const here = () => deps.workspace.path();
  const tabs = createConversationTabsKeeper(here, () => show());
  /** L'onglet montré est celui dont le tour court. */
  const replyingSince = () => tabs.runningSince(tabs.shown().active);
  const replying = () => replyingSince() !== null;
  const bar = createInputBar({ ...deps, picker: layout.picker, replyingSince }, () => view);
  const show = () => {
    const tab = activeConversationTab(tabs.shown());
    view.showTabs(shownTabs(tabs.shown()));
    view.render(tab.conversation, here(), tabs.turn() !== null && !replying());
    view.showAgents(tab.agents);
    bar.showConversation(tab.load);
    account.turnRunning(tabs.turn() !== null);
  };
  const play = player(deps, tabs, bar, here);
  const send = (text: string) => {
    const notes = bar.sent();
    play(
      text,
      notes.map((note) => note.title),
      messageWithNotes(text, notes),
      false,
    );
  };
  const view: ClaudeColumnView = createClaudeColumnView(layout.claudeColumn, {
    ...{ send, openNote: deps.openNote, markdown, close: () => toggle() },
    ...{ chooseSettings: bar.chooseSettings, attach: bar.attach, detach: bar.detach },
    // Les modifications retenues par le garde-fou du web, autorisées pour ce seul tour.
    allowChanges: () => play(ALLOW_CHANGES_MESSAGE, [], ALLOW_CHANGES_MESSAGE, true),
    stop: () => {
      tabs.changeShown((shown) => tabUpdated(shown, shown.active, tabStopAsked));
      backend.stopClaude().catch(deps.error);
    },
    newConversation: () => (tabs.changeShown(tabOpened), view.focus()),
    showTab: (id) => tabs.changeShown((shown) => tabShown(shown, id)),
    // Fermer l'onglet dont le tour court arrête d'abord ce tour.
    closeTab: (id) => {
      if (tabs.runningSince(id) !== null) backend.stopClaude().catch(deps.error);
      tabs.changeShown((shown) => tabClosed(shown, id));
    },
  });
  // Un autre compte ne peut pas continuer ces conversations (le compte ne change que hors d'un tour).
  const account = accountOf(deps, view, () => tabs.forget());
  const toggle = toggler(layout, () => void checkStatus(view, backend, account));
  layout.claudeButton.addEventListener("click", toggle);
  void backend.onClaudeEvent((event) => {
    bar.heard(event);
    const turn = tabs.turn();
    if (turn !== null) tabs.changeTab(turn, (tab) => tabEventReceived(tab, event));
  });
  show();
  view.showSettings(bar.settings());
  const follow = workspaceFollower(deps.workspace, bar, show);
  follow();
  return { toggle, follow };
}
