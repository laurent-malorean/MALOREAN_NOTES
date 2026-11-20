// Onglets de conversation de la colonne Claude Code, comme dans le module de VS Code : chaque onglet
// garde sa conversation (son identifiant chez Claude Code, ses messages, actions et notes
// modifiées), sa carte des agents, son modèle et son remplissage du contexte, et son tour en cours.
// La limite d'utilisation, celle de tout l'abonnement, n'y est pas (fiche 0032).
import type { ClaudeEventItem } from "../bridge";
import { type AgentMap, agentEventReceived, agentTurnEnded, NO_AGENTS } from "./agent-map";
import {
  type Conversation,
  eventReceived,
  messageSent,
  NEW_CONVERSATION,
  stopAsked,
  turnEnded,
} from "./claude-column";
import { type ClaudeLoad, loadEventReceived, NO_LOAD } from "./claude-load";

export interface ConversationTab {
  readonly id: number;
  /** Le titre tiré du premier message de l'utilisateur ; rien avant. */
  readonly title: string | null;
  /** L'identifiant de sa conversation chez Claude Code, annoncé au début du premier tour. */
  readonly conversationId: string | null;
  readonly conversation: Conversation;
  readonly agents: AgentMap;
  /** Le modèle et le remplissage du contexte de sa conversation ; jamais la limite. */
  readonly load: ClaudeLoad;
}

/** Les onglets de conversation d'un espace de travail, et celui qui est montré. */
export interface ConversationTabs {
  readonly tabs: readonly ConversationTab[];
  readonly active: number;
  /** L'identifiant du prochain onglet ouvert. */
  readonly next: number;
}

/** Le titre d'un onglet tant que l'utilisateur n'a rien envoyé. */
export const NEW_CONVERSATION_TITLE = "Nouvelle conversation";

/** La longueur au-delà de laquelle le titre est raccourci. */
const TITLE_LENGTH = 30;

const emptyTab = (id: number): ConversationTab => ({
  id,
  title: null,
  conversationId: null,
  conversation: NEW_CONVERSATION,
  agents: NO_AGENTS,
  load: NO_LOAD,
});

/** Un seul onglet, vide, montré. */
export const NO_CONVERSATION_TABS: ConversationTabs = { tabs: [emptyTab(1)], active: 1, next: 2 };

/** Le titre d'une conversation : son premier message, sur une ligne, raccourci. */
export function conversationTitle(text: string): string {
  const line = text.trim().replace(/\s+/g, " ");
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH).trimEnd()}…` : line;
}

export const tabTitle = (tab: ConversationTab) => tab.title ?? NEW_CONVERSATION_TITLE;

/** L'onglet montré. */
export const activeConversationTab = (tabs: ConversationTabs) =>
  tabs.tabs.find(({ id }) => id === tabs.active) as ConversationTab;

/** L'onglet dont le tour court, s'il y en a un. */
export const runningConversationTab = (tabs: ConversationTabs) =>
  tabs.tabs.find((tab) => tab.conversation.turn !== "idle");

/** « Nouvelle conversation » : un onglet vide à la fin, montré. */
export const tabOpened = ({ tabs, next }: ConversationTabs): ConversationTabs => ({
  tabs: [...tabs, emptyTab(next)],
  active: next,
  next: next + 1,
});

/** Un clic sur l'onglet `id` le montre. */
export const tabShown = (tabs: ConversationTabs, id: number): ConversationTabs =>
  tabs.tabs.some((tab) => tab.id === id) ? { ...tabs, active: id } : tabs;

/**
 * L'onglet `id` est fermé ; s'il était montré, son voisin de droite l'est, sinon celui de gauche.
 * Fermer le dernier laisse un onglet vide.
 */
export function tabClosed(tabs: ConversationTabs, id: number): ConversationTabs {
  const at = tabs.tabs.findIndex((tab) => tab.id === id);
  if (at < 0) return tabs;
  const left = tabs.tabs.filter((tab) => tab.id !== id);
  if (left.length === 0) return tabOpened({ ...tabs, tabs: [] });
  const neighbour = left[Math.min(at, left.length - 1)] as ConversationTab;
  return { ...tabs, tabs: left, active: tabs.active === id ? neighbour.id : tabs.active };
}

/** L'onglet `id` change par `change` ; un onglet fermé entre-temps n'est plus touché. */
export const tabUpdated = (
  tabs: ConversationTabs,
  id: number,
  change: (tab: ConversationTab) => ConversationTab,
): ConversationTabs => ({
  ...tabs,
  tabs: tabs.tabs.map((tab) => (tab.id === id ? change(tab) : tab)),
});

/** Le message de l'utilisateur part : un tour commence ; le premier donne son titre à l'onglet. */
export const tabMessageSent = (
  tab: ConversationTab,
  text: string,
  notes: readonly string[],
): ConversationTab => ({
  ...tab,
  title: tab.title ?? conversationTitle(text),
  conversation: messageSent(tab.conversation, text, notes),
});

/** Un événement du tour de cet onglet est arrivé. */
export const tabEventReceived = (
  tab: ConversationTab,
  event: ClaudeEventItem,
): ConversationTab => ({
  ...tab,
  conversationId: event.kind === "conversationStarted" ? event.conversation : tab.conversationId,
  conversation: eventReceived(tab.conversation, event),
  agents: agentEventReceived(tab.agents, event),
  load: { ...loadEventReceived(tab.load, event), limits: null },
});

export const tabStopAsked = (tab: ConversationTab): ConversationTab => ({
  ...tab,
  conversation: stopAsked(tab.conversation),
});

/** Le tour de l'onglet est fini, normalement (`error` nul) ou en erreur, arrêt compris. */
export const tabTurnEnded = (tab: ConversationTab, error: string | null): ConversationTab => ({
  ...tab,
  conversation: turnEnded(tab.conversation, error),
  agents: agentTurnEnded(tab.agents, error !== null),
});
