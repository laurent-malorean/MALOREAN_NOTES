import { describe, expect, it } from "vitest";
import type { ClaudeEventItem } from "../bridge";
import {
  activeConversationTab,
  conversationTitle,
  NEW_CONVERSATION_TITLE,
  NO_CONVERSATION_TABS,
  runningConversationTab,
  tabClosed,
  tabEventReceived,
  tabMessageSent,
  tabOpened,
  tabShown,
  tabStopAsked,
  tabTitle,
  tabTurnEnded,
  tabUpdated,
  type ConversationTab,
  type ConversationTabs,
} from "./claude-tabs";

const ids = (tabs: ConversationTabs) => tabs.tabs.map(({ id }) => id);
const three = tabOpened(tabOpened(NO_CONVERSATION_TABS));
const first = NO_CONVERSATION_TABS.tabs[0] as ConversationTab;
const play = (tab: ConversationTab, ...events: ClaudeEventItem[]) =>
  events.reduce(tabEventReceived, tab);

describe("onglets de conversation", () => {
  it("commencent par un seul onglet vide, montré, intitulé « Nouvelle conversation »", () => {
    expect(ids(NO_CONVERSATION_TABS)).toEqual([1]);
    expect(activeConversationTab(NO_CONVERSATION_TABS)).toBe(first);
    expect(first.conversationId).toBeNull();
    expect(first.conversation).toEqual({ entries: [], turn: "idle" });
    expect(first.agents).toEqual({ agents: [] });
    expect(first.load).toEqual({ model: null, context: null, limits: null });
    expect(tabTitle(first)).toBe("Nouvelle conversation");
    expect(NEW_CONVERSATION_TITLE).toBe("Nouvelle conversation");
  });

  it("« Nouvelle conversation » ouvre un onglet vide à la fin, et le montre", () => {
    const shown = tabShown(three, 1);
    const opened = tabOpened(shown);
    expect(ids(opened)).toEqual([1, 2, 3, 4]);
    expect(opened.active).toBe(4);
    expect(activeConversationTab(opened).conversation.entries).toEqual([]);
  });

  it("un clic sur un onglet le montre ; un onglet inconnu ne change rien", () => {
    expect(tabShown(three, 2).active).toBe(2);
    expect(tabShown(three, 9)).toBe(three);
  });

  it("fermer l'onglet montré montre son voisin de droite, sinon celui de gauche", () => {
    expect(tabClosed(tabShown(three, 2), 2)).toMatchObject({
      tabs: [{ id: 1 }, { id: 3 }],
      active: 3,
    });
    expect(tabClosed(three, 3)).toMatchObject({ tabs: [{ id: 1 }, { id: 2 }], active: 2 });
  });

  it("fermer un autre onglet garde celui qui est montré ; un onglet inconnu ne change rien", () => {
    expect(tabClosed(three, 1)).toMatchObject({ tabs: [{ id: 2 }, { id: 3 }], active: 3 });
    expect(tabClosed(three, 9)).toBe(three);
  });

  it("fermer le dernier onglet laisse un onglet vide, neuf", () => {
    const asked = tabUpdated(NO_CONVERSATION_TABS, 1, (tab) => tabMessageSent(tab, "Un", []));
    const closed = tabClosed(asked, 1);
    expect(ids(closed)).toEqual([2]);
    expect(closed.active).toBe(2);
    expect(activeConversationTab(closed).conversation.entries).toEqual([]);
    expect(tabOpened(closed).active).toBe(3);
  });

  it("un changement ne touche que son onglet ; un onglet fermé n'en reçoit plus", () => {
    const changed = tabUpdated(three, 2, (tab) => tabMessageSent(tab, "Deux", []));
    expect(changed.tabs.map((tab) => tab.conversation.entries.length)).toEqual([0, 1, 0]);
    expect(changed.active).toBe(3);
    expect(tabUpdated(three, 9, (tab) => tabMessageSent(tab, "Neuf", []))).toEqual(three);
  });
});

describe("titre d'une conversation", () => {
  it("vient du premier message de l'utilisateur, sur une ligne, raccourci", () => {
    expect(conversationTitle("Range mes notes")).toBe("Range mes notes");
    expect(conversationTitle("  Résume\n\n la  note   du jour ")).toBe("Résume la note du jour");
    expect(conversationTitle("a".repeat(30))).toBe("a".repeat(30));
    expect(conversationTitle(`${"a".repeat(28)} bcd`)).toBe(`${"a".repeat(28)} b…`);
  });

  it("est pris au premier message envoyé, puis ne change plus", () => {
    const asked = tabMessageSent(first, "Range mes notes", ["Plan"]);
    expect(tabTitle(asked)).toBe("Range mes notes");
    expect(asked.conversation.entries).toEqual([
      { kind: "user", text: "Range mes notes", notes: ["Plan"] },
    ]);
    expect(asked.conversation.turn).toBe("running");
    const again = tabMessageSent(tabTurnEnded(asked, null), "Autre chose", []);
    expect(tabTitle(again)).toBe("Range mes notes");
  });
});

describe("conversation d'un onglet", () => {
  it("garde l'identifiant de sa conversation, annoncé au début du tour", () => {
    const started = play(first, { kind: "conversationStarted", conversation: "c1" });
    expect(started.conversationId).toBe("c1");
    expect(started.conversation.entries).toEqual([]);
    const other = play(started, { kind: "message", agent: null, text: "Bonjour" });
    expect(other.conversationId).toBe("c1");
  });

  it("suit ses messages, sa carte des agents, son modèle et son contexte", () => {
    const tab = play(
      tabMessageSent(first, "Un", []),
      { kind: "message", agent: null, text: "Bonjour" },
      {
        kind: "actionStarted",
        agent: null,
        id: "a",
        action: "subAgent",
        tool: null,
        target: "Lire",
      },
      { kind: "modelUsed", model: "claude-opus-5-5" },
      { kind: "contextFilled", used: 1, size: 4 },
    );
    expect(tab.conversation.entries.map((entry) => entry.kind)).toEqual([
      "user",
      "claude",
      "action",
    ]);
    expect(tab.agents.agents.map(({ state }) => state)).toEqual(["running"]);
    expect(tab.load).toEqual({
      model: "claude-opus-5-5",
      context: { used: 1, size: 4 },
      limits: null,
    });
  });

  it("ne garde pas la limite d'utilisation, commune à tout l'abonnement", () => {
    const tab = play(first, { kind: "usageLimits", reached: true, windows: [] });
    expect(tab.load.limits).toBeNull();
  });

  it("l'arrêt demandé puis la fin du tour interrompent ses sous-agents en cours", () => {
    const running = play(tabMessageSent(first, "Un", []), {
      kind: "actionStarted",
      agent: null,
      id: "a",
      action: "subAgent",
      tool: null,
      target: "Lire",
    });
    const stopping = tabStopAsked(running);
    expect(stopping.conversation.turn).toBe("stopping");
    const ended = tabTurnEnded(stopping, "arrêtée");
    expect(ended.conversation.turn).toBe("idle");
    expect(ended.conversation.entries.at(-1)).toEqual({ kind: "stopped" });
    expect(ended.agents.agents.map(({ state }) => state)).toEqual(["stopped"]);
    expect(tabTurnEnded(running, null).agents.agents.map(({ state }) => state)).toEqual(["done"]);
  });

  it("l'onglet dont le tour court est trouvé, quel qu'il soit", () => {
    expect(runningConversationTab(three)).toBeUndefined();
    const running = tabUpdated(three, 2, (tab) => tabMessageSent(tab, "Deux", []));
    expect(runningConversationTab(running)?.id).toBe(2);
    const stopping = tabUpdated(running, 2, tabStopAsked);
    expect(runningConversationTab(stopping)?.id).toBe(2);
  });
});
