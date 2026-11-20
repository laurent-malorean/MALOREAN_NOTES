import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeEventItem } from "../bridge";
import { EMPTY, OTHER_TAB_RUNNING, WORKING } from "../screens/claude-column-view";
import { createLayout, type Layout } from "../screens/layout";
import { ALLOW_CHANGES_MESSAGE } from "../state/claude-column";
import { type ClaudeColumn, createClaudeColumn } from "./claude-column";

const settle = () => vi.advanceTimersByTimeAsync(0);

let layout: Layout;
let column: ClaudeColumn;
let log: string[];
let turns: { resolve: () => void; reject: (error: unknown) => void }[];
let announce: (event: ClaudeEventItem) => void;
let workspacePath: string;
let sentTemplates: (string | null)[];
let showNote: (path: string) => void;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout"] });
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  layout = createLayout(root);
  log = [];
  turns = [];
  sentTemplates = [];
  workspacePath = "/Users/moi/Notes";
  column = createClaudeColumn({
    backend: {
      claudeStatus: async () => ({ kind: "ready", email: null, organization: null }),
      sendToClaude: (message, conversation, _settings, allowed, templates) =>
        new Promise((resolve, reject) => {
          sentTemplates.push(templates);
          log.push(
            `envoyer ${message} dans ${conversation ?? "une neuve"}${allowed ? " (autorisé)" : ""}`,
          );
          turns.push({ resolve: () => resolve(null), reject });
        }),
      stopClaude: async () => (log.push("arrêter"), null),
      onClaudeEvent: async (handler) => ((announce = handler), () => {}),
      errorMessage: (error) => String((error as { message: string }).message),
      listAllNotes: async () => [],
      logOutOfClaude: async () => null,
      logInToClaude: async () => null,
      onClaudeSignIn: async () => () => {},
      copyPlainText: async () => null,
      onClaudeShowsNote: async (handler) => ((showNote = handler), () => {}),
      onClaudeAsksView: async () => () => {},
      answerView: async () => null,
    },
    layout,
    workspace: { path: () => workspacePath },
    columns: {
      current: () => ({
        list: [{ id: 0, tabs: [], activeTab: null, width: 1 }],
        active: 0,
        nextId: 1,
      }),
    },
    // Seul l'espace de travail « Autre » a un dossier des modèles.
    storage: {
      getItem: (key) => (key === "malorean.templates:/Users/moi/Autre" ? "Modèles" : null),
      setItem: () => {},
      removeItem: () => {},
    },
    openNote: (path) => log.push(`ouvrir ${path}`),
    error: (error) => log.push(`erreur ${String(error)}`),
  });
});

afterEach(() => vi.useRealTimers());

const find = <T extends HTMLElement>(selector: string) =>
  layout.claudeColumn.querySelector(selector) as T;
const shown = () => [...find(".claude-conversation").children].map((e) => e.textContent);
const titles = () =>
  [...layout.claudeColumn.querySelectorAll(".claude-tab")].map(
    (tab) =>
      `${tab.querySelector(".claude-tab-running") ? "● " : ""}${tab.textContent?.slice(0, -1)}`,
  );
const tab = (id: number) => find(`[data-tab="${id}"]`);
const newConversation = () => find("[data-new-conversation]").click();

function send(text: string) {
  find<HTMLTextAreaElement>(".claude-input").value = text;
  find("[data-send]").click();
}

/** Un tour complet dans l'onglet montré, qui annonce la conversation `id`. */
async function answeredIn(id: string, text: string) {
  send(text);
  announce({ kind: "conversationStarted", conversation: id });
  turns.at(-1)?.resolve();
  await settle();
}

describe("onglets de conversation de la colonne Claude Code", () => {
  it("un seul onglet au départ ; le premier message lui donne son titre", async () => {
    expect(titles()).toEqual(["Nouvelle conversation"]);
    await answeredIn("c1", "Range mes notes de la semaine dernière");
    expect(titles()).toEqual(["Range mes notes de la semaine…"]);
  });

  it("chaque onglet continue sa propre conversation", async () => {
    await answeredIn("c1", "Un");
    newConversation();
    expect(titles()).toEqual(["Un", "Nouvelle conversation"]);
    expect(shown()).toEqual([EMPTY]);
    await answeredIn("c2", "Deux");
    tab(1).click();
    expect(shown()).toEqual(["Un"]);
    send("Encore un");
    turns.at(-1)?.resolve();
    await settle();
    tab(2).click();
    send("Encore deux");
    expect(log).toEqual([
      "envoyer Un dans une neuve",
      "envoyer Deux dans une neuve",
      "envoyer Encore un dans c1",
      "envoyer Encore deux dans c2",
    ]);
  });

  it("le tour suit l'onglet qui l'a lancé, même quand un autre est montré", async () => {
    send("Un");
    newConversation();
    announce({ kind: "message", agent: null, text: "Réponse" });
    expect(shown()).toEqual([EMPTY, OTHER_TAB_RUNNING]);
    expect(titles()).toEqual(["● Un", "Nouvelle conversation"]);
    tab(1).click();
    expect(shown()).toEqual(["Un", "Réponse", WORKING]);
  });

  it("pendant le tour d'un onglet, les autres refusent d'envoyer ; Arrêter vise celui qui répond", async () => {
    send("Un");
    newConversation();
    expect(find<HTMLButtonElement>("[data-send]").disabled).toBe(true);
    expect(find("[data-stop]").hidden).toBe(true);
    send("Deux");
    expect(log).toEqual(["envoyer Un dans une neuve"]);
    tab(1).click();
    find("[data-stop]").click();
    expect(log).toEqual(["envoyer Un dans une neuve", "arrêter"]);
    turns[0]?.reject({ message: "arrêtée" });
    await settle();
    expect(titles()).toEqual(["Un", "Nouvelle conversation"]);
    tab(2).click();
    expect(find<HTMLButtonElement>("[data-send]").disabled).toBe(false);
    send("Deux");
    expect(log.at(-1)).toBe("envoyer Deux dans une neuve");
  });

  it("la durée de la réponse ne se montre que sur l'onglet qui répond", async () => {
    send("Un");
    await vi.advanceTimersByTimeAsync(2000);
    const elapsed = () => find(".claude-elapsed");
    expect(elapsed().hidden).toBe(false);
    newConversation();
    expect(elapsed().hidden).toBe(true);
    tab(1).click();
    expect(elapsed().hidden).toBe(false);
    expect(elapsed().textContent).toBe("2 s");
  });

  it("fermer l'onglet qui répond arrête d'abord son tour ; les autres attendent sa fin", async () => {
    send("Un");
    newConversation();
    tab(1).click();
    find(`[data-tab="1"] .claude-tab-close`).click();
    expect(log).toEqual(["envoyer Un dans une neuve", "arrêter"]);
    expect(titles()).toEqual(["Nouvelle conversation"]);
    announce({ kind: "message", agent: null, text: "Trop tard" });
    expect(shown()).toEqual([EMPTY, OTHER_TAB_RUNNING]);
    turns[0]?.reject({ message: "arrêtée" });
    await settle();
    expect(shown()).toEqual([EMPTY]);
  });

  it("fermer un autre onglet n'arrête rien ; fermer le dernier laisse un onglet vide", async () => {
    await answeredIn("c1", "Un");
    newConversation();
    find(`[data-tab="1"] .claude-tab-close`).click();
    expect(titles()).toEqual(["Nouvelle conversation"]);
    await answeredIn("c2", "Deux");
    find(`[data-tab="2"] .claude-tab-close`).click();
    expect(titles()).toEqual(["Nouvelle conversation"]);
    expect(shown()).toEqual([EMPTY]);
    send("Trois");
    expect(log).toEqual([
      "envoyer Un dans une neuve",
      "envoyer Deux dans une neuve",
      "envoyer Trois dans une neuve",
    ]);
  });

  it("un événement hors d'un tour ne change rien", async () => {
    await answeredIn("c1", "Un");
    announce({ kind: "message", agent: null, text: "Égaré" });
    expect(shown()).toEqual(["Un"]);
  });

  it("chaque espace de travail a ses onglets", async () => {
    await answeredIn("c1", "Un");
    newConversation();
    workspacePath = "/Users/moi/Travail";
    column.follow();
    expect(titles()).toEqual(["Nouvelle conversation"]);
    workspacePath = "/Users/moi/Notes";
    column.follow();
    expect(titles()).toEqual(["Un", "Nouvelle conversation"]);
    expect(find('[data-tab="1"]').getAttribute("aria-selected")).toBe("false");
    expect(find('[data-tab="2"]').getAttribute("aria-selected")).toBe("true");
  });

  it("une note montrée par Claude, par un outil de l'application, s'ouvre", () => {
    showNote("Travail/a.md");
    expect(log).toEqual(["ouvrir Travail/a.md"]);
  });

  it("chaque tour emporte le dossier des modèles de son espace de travail, pour les outils de l'application", async () => {
    await answeredIn("c1", "Un");
    workspacePath = "/Users/moi/Autre";
    column.follow();
    send("Deux");
    expect(sentTemplates).toEqual([null, "Modèles"]);
  });

  it("les modifications retenues s'autorisent dans la conversation de leur onglet", async () => {
    send("Cherche et note");
    announce({ kind: "conversationStarted", conversation: "c1" });
    announce({
      kind: "actionStarted",
      agent: null,
      id: "w",
      action: "edit",
      tool: null,
      target: "a.md",
    });
    announce({ kind: "changeHeldBack", id: "w" });
    turns[0]?.resolve();
    await settle();
    newConversation();
    tab(1).click();
    find(".claude-allow-changes").click();
    expect(log.at(-1)).toBe(`envoyer ${ALLOW_CHANGES_MESSAGE} dans c1 (autorisé)`);
    expect(titles()).toEqual(["● Cherche et note", "Nouvelle conversation"]);
  });
});
