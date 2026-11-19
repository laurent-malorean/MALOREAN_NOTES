import { beforeEach, describe, expect, it } from "vitest";
import type { ClaudeEventItem, ClaudeStatusItem } from "../bridge";
import { createLayout, type Layout } from "../screens/layout";
import { CHECKING_CLAUDE, EMPTY } from "../screens/claude-column-view";
import { type ClaudeColumn, createClaudeColumn } from "./claude-column";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let layout: Layout;
let column: ClaudeColumn;
let log: string[];
let status: Promise<ClaudeStatusItem>;
let turn: { resolve: () => void; reject: (error: unknown) => void };
let announce: (event: ClaudeEventItem) => void;
let workspacePath: string;

const find = <T extends HTMLElement>(selector: string) =>
  layout.claudeColumn.querySelector(selector) as T;
const shown = () => [...find(".claude-conversation").children].map((e) => e.textContent);
const unavailable = () => find(".claude-unavailable");

function send(text: string) {
  find<HTMLTextAreaElement>(".claude-input").value = text;
  find<HTMLButtonElement>("[data-send]").click();
}

beforeEach(() => {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  layout = createLayout(root);
  layout.mainArea.hidden = false;
  log = [];
  status = Promise.resolve({ kind: "ready" });
  workspacePath = "/Users/moi/Notes";
  column = createClaudeColumn({
    backend: {
      claudeStatus: () => (log.push("vérifier"), status),
      sendToClaude: (message) =>
        new Promise((resolve, reject) => {
          log.push(`envoyer ${message}`);
          turn = { resolve: () => resolve(null), reject };
        }),
      stopClaude: async () => (log.push("arrêter"), null),
      newConversation: async () => (log.push("oublier"), null),
      onClaudeEvent: async (handler) => ((announce = handler), () => {}),
      errorMessage: (error) => String((error as { message: string }).message),
    },
    layout,
    workspace: { path: () => workspacePath },
    openNote: (path) => log.push(`ouvrir ${path}`),
    error: (error) => log.push(`erreur ${String(error)}`),
  });
});

describe("colonne Claude Code : affichée ou masquée", () => {
  it("cachée au départ ; sa commande et son bouton l'affichent puis la masquent", async () => {
    expect(layout.claudeColumn.hidden).toBe(true);
    column.toggle();
    expect(layout.claudeColumn.hidden).toBe(false);
    expect(layout.claudeButton.getAttribute("aria-pressed")).toBe("true");
    layout.claudeButton.click();
    expect(layout.claudeColumn.hidden).toBe(true);
    expect(layout.claudeButton.getAttribute("aria-pressed")).toBe("false");
    column.toggle();
    find<HTMLButtonElement>("[data-close]").click();
    expect(layout.claudeColumn.hidden).toBe(true);
    await settle();
    expect(log).toEqual(["vérifier", "vérifier"]);
  });

  it("à chaque ouverture, vérifie la connexion puis met le curseur dans la zone du message", async () => {
    let answer: (status: ClaudeStatusItem) => void = () => {};
    status = new Promise((resolve) => (answer = resolve));
    column.toggle();
    expect(unavailable().textContent).toBe(CHECKING_CLAUDE);
    expect(CHECKING_CLAUDE).toBe("Vérification de Claude Code…");
    answer({ kind: "ready" });
    await settle();
    expect(unavailable().hidden).toBe(true);
    expect(document.activeElement).toBe(find(".claude-input"));
  });

  it("Claude Code indisponible : la colonne dit pourquoi et quoi faire", async () => {
    status = Promise.resolve({ kind: "unavailable", reason: "tapez « claude auth login »" });
    column.toggle();
    await settle();
    expect(unavailable().hidden).toBe(false);
    expect(unavailable().textContent).toBe("tapez « claude auth login »");
    expect(find<HTMLTextAreaElement>(".claude-input").disabled).toBe(true);
  });

  it("une vérification en échec est montrée comme une raison", async () => {
    status = Promise.reject({ message: "commande inconnue" });
    column.toggle();
    await settle();
    expect(unavailable().textContent).toBe("commande inconnue");
  });
});

describe("colonne Claude Code : un tour", () => {
  it("vide au départ, elle dit ce qu'on peut demander", () => {
    expect(shown()).toEqual([EMPTY]);
  });

  it("met en forme le Markdown de Claude, sans charger ses images", async () => {
    send("Bonjour");
    announce({ kind: "message", agent: null, text: "**Fait** ![vue](vue.png)" });
    await expect.poll(() => find(".claude-reply strong")?.textContent).toBe("Fait");
    expect(find(".claude-reply img").getAttribute("src")).toBe("");
  });

  it("envoie le message, montre la réponse au fil de l'eau, puis le bilan", async () => {
    column.toggle();
    await settle();
    send("Range mes notes");
    expect(log).toContain("envoyer Range mes notes");
    expect(shown()).toEqual(["Range mes notes", "Claude travaille…"]);
    announce({
      kind: "actionStarted",
      agent: null,
      id: "w",
      action: "write",
      tool: null,
      target: "/Users/moi/Notes/plan.md",
    });
    announce({ kind: "actionFinished", id: "w", succeeded: true });
    announce({ kind: "changedNote", path: "plan.md" });
    announce({ kind: "summary", failure: null, durationMs: 3000, tokens: 40 });
    turn.resolve();
    await settle();
    expect(shown()).toEqual([
      "Range mes notes",
      "Écritureplan.md",
      "Note modifiée : plan.md",
      "3 s · 40 jetons",
    ]);
    find<HTMLButtonElement>(".claude-note-link").click();
    expect(log.at(-1)).toBe("ouvrir plan.md");
  });

  it("une erreur du tour est montrée en clair", async () => {
    send("Bonjour");
    turn.reject({ message: "Claude Code est introuvable" });
    await settle();
    expect(shown()).toEqual(["Bonjour", "Claude Code est introuvable"]);
    expect(find(".claude-error")).not.toBeNull();
  });

  it("Arrêter interrompt le tour : la réponse est dite arrêtée", async () => {
    send("Bonjour");
    find<HTMLButtonElement>("[data-stop]").click();
    expect(find<HTMLButtonElement>("[data-stop]").disabled).toBe(true);
    turn.reject({ message: "la réponse de Claude a été arrêtée" });
    await settle();
    expect(log).toEqual(["envoyer Bonjour", "arrêter"]);
    expect(shown()).toEqual(["Bonjour", "Réponse arrêtée"]);
  });

  it("un arrêt en échec est signalé", async () => {
    column = createClaudeColumn({
      backend: {
        claudeStatus: async () => ({ kind: "ready" }),
        sendToClaude: () => new Promise(() => {}),
        stopClaude: () => Promise.reject(new Error("fil arrêté")),
        newConversation: () => Promise.reject(new Error("fil perdu")),
        onClaudeEvent: async () => () => {},
        errorMessage: String,
      },
      layout,
      workspace: { path: () => workspacePath },
      openNote: () => {},
      error: (error) => log.push(`erreur ${String(error)}`),
    });
    find<HTMLButtonElement>("[data-new-conversation]").click();
    send("Bonjour");
    find<HTMLButtonElement>("[data-stop]").click();
    await settle();
    expect(log).toEqual(["erreur Error: fil perdu", "erreur Error: fil arrêté"]);
  });

  it("Nouvelle conversation oublie la conversation et vide la colonne", async () => {
    send("Bonjour");
    turn.resolve();
    await settle();
    find<HTMLButtonElement>("[data-new-conversation]").click();
    await settle();
    expect(log).toEqual(["envoyer Bonjour", "oublier"]);
    expect(find(".claude-empty")).not.toBeNull();
  });

  it("un autre espace de travail vide la colonne ; le même la garde", async () => {
    send("Bonjour");
    turn.resolve();
    await settle();
    column.follow();
    expect(shown()).toEqual(["Bonjour"]);
    workspacePath = "/Users/moi/Travail";
    column.follow();
    expect(find(".claude-empty")).not.toBeNull();
    announce({
      kind: "actionStarted",
      agent: null,
      id: "r",
      action: "read",
      tool: null,
      target: "/Users/moi/Travail/a.md",
    });
    expect(shown()).toEqual(["Lecturea.md"]);
  });

  it("un tour en cours le reste quand l'espace de travail change", () => {
    send("Bonjour");
    workspacePath = "/Users/moi/Travail";
    column.follow();
    expect(shown()).toEqual([EMPTY, "Claude travaille…"]);
  });
});
