import { beforeEach, describe, expect, it } from "vitest";
import { type ChatEntry, type Conversation, NEW_CONVERSATION } from "../state/claude-column";
import {
  type ClaudeColumnView,
  createClaudeColumnView,
  EMPTY,
  STOPPED,
  WORKING,
} from "./claude-column-view";

const log: string[] = [];
let container: HTMLElement;
let view: ClaudeColumnView;
let markdowns: string[] = [];

const find = <T extends HTMLElement>(selector: string) => container.querySelector(selector) as T;
const input = () => find<HTMLTextAreaElement>(".claude-input");
const button = (name: string) => find<HTMLButtonElement>(`[data-${name}]`);
const shown = () => [...find(".claude-conversation").children].map((e) => e.textContent);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const idle = (...entries: ChatEntry[]): Conversation => ({ entries, turn: "idle" });

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  input().dispatchEvent(event);
  return event;
}

beforeEach(() => {
  log.length = 0;
  markdowns = [];
  container = document.createElement("section");
  document.body.replaceChildren(container);
  view = createClaudeColumnView(container, {
    send: (text) => log.push(`envoyer ${text}`),
    stop: () => log.push("arrêter"),
    newConversation: () => log.push("nouvelle conversation"),
    close: () => log.push("masquer"),
    openNote: (path) => log.push(`ouvrir ${path}`),
    markdown: async (text) => (markdowns.push(text), `<p><strong>${text}</strong></p>`),
  });
});

describe("colonne Claude Code : la conversation", () => {
  it("vide, elle dit ce qu'on peut demander", () => {
    view.render(NEW_CONVERSATION, "/Notes");
    expect(shown()).toEqual([EMPTY]);
    expect(EMPTY).toBe(
      "Demandez à Claude de lire, créer ou modifier les notes de cet espace de travail.",
    );
  });

  it("montre les messages, Claude en Markdown, ceux des sous-agents marqués", async () => {
    view.render(
      idle(
        { kind: "user", text: "Bonjour" },
        { kind: "claude", text: "Salut", subAgent: false },
        { kind: "claude", text: "Trouvé", subAgent: true },
      ),
      "/Notes",
    );
    await settle();
    expect(shown()).toEqual(["Bonjour", "Salut", "Trouvé"]);
    expect(find(".claude-user").textContent).toBe("Bonjour");
    expect(find(".claude-reply strong").textContent).toBe("Salut");
    expect(container.querySelectorAll(".claude-reply.claude-sub-agent")).toHaveLength(1);
  });

  it("ne remet pas en forme un message déjà montré", async () => {
    const conversation = idle({ kind: "claude", text: "Salut", subAgent: false });
    view.render(conversation, "/Notes");
    await settle();
    view.render(conversation, "/Notes");
    expect(find(".claude-reply strong").textContent).toBe("Salut");
    expect(markdowns).toEqual(["Salut"]);
  });

  it("un lien d'un message de Claude ne fait pas quitter l'application", () => {
    view.render(idle({ kind: "claude", text: "Salut", subAgent: false }), "/Notes");
    const reply = find(".claude-reply");
    reply.innerHTML = '<a href="https://example.com">lien</a> texte';
    const onLink = new MouseEvent("click", { bubbles: true, cancelable: true });
    reply.querySelector("a")?.dispatchEvent(onLink);
    expect(onLink.defaultPrevented).toBe(true);
    const onText = new MouseEvent("click", { bubbles: true, cancelable: true });
    reply.dispatchEvent(onText);
    expect(onText.defaultPrevented).toBe(false);
  });

  it("montre chaque action en bref : ce qu'elle fait, sa cible, un refus ou une erreur", () => {
    const action = (id: string, state: "running" | "succeeded" | "failed" | "refused") =>
      ({ kind: "action", id, label: "Modification", subAgent: id === "s", state }) as const;
    view.render(
      idle(
        { ...action("a", "succeeded"), target: "/Notes/a/plan.md" },
        { ...action("b", "refused"), target: "/etc/hosts" },
        { ...action("c", "failed"), target: null },
        { ...action("s", "running"), target: null },
      ),
      "/Notes",
    );
    const actions = [...container.querySelectorAll(".claude-action")].map((a) =>
      [...a.children].map((part) => `${part.className}=${part.textContent}`),
    );
    expect(actions).toEqual([
      ["claude-action-kind=Modification", "claude-action-target=a/plan.md"],
      [
        "claude-action-kind=Modification",
        "claude-action-target=/etc/hosts",
        "claude-action-state=refusée",
      ],
      ["claude-action-kind=Modification", "claude-action-state=en erreur"],
      ["claude-action-kind=Modification"],
    ]);
    expect(find(".claude-action-refused")).not.toBeNull();
    expect(find(".claude-action-failed")).not.toBeNull();
    expect(find(".claude-action-running.claude-sub-agent")).not.toBeNull();
  });

  it("une note modifiée s'ouvre d'un clic", () => {
    view.render(idle({ kind: "changedNote", path: "a/plan.md" }), "/Notes");
    expect(shown()).toEqual(["Note modifiée : a/plan.md"]);
    expect(find(".claude-changed-note .claude-note-link").title).toBe("Ouvrir la note");
    find<HTMLButtonElement>(".claude-note-link").click();
    expect(log).toEqual(["ouvrir a/plan.md"]);
  });

  it("le bilan en petit, l'échec, l'erreur et l'arrêt en clair", () => {
    view.render(
      idle(
        { kind: "summary", failure: null, durationMs: 2000, tokens: 12 },
        { kind: "summary", failure: "conversation inconnue", durationMs: 1, tokens: 0 },
        { kind: "error", message: "claude répond déjà" },
        { kind: "stopped" },
      ),
      "/Notes",
    );
    expect(shown()).toEqual([
      "2 s · 12 jetons",
      "Claude n'a pas pu répondre : conversation inconnue",
      "Claude répond déjà",
      STOPPED,
    ]);
    expect(container.querySelectorAll(".claude-error")).toHaveLength(2);
    expect(container.querySelectorAll(".claude-summary")).toHaveLength(2);
  });
});

describe("colonne Claude Code : écrire et piloter le tour", () => {
  it("Entrée envoie le message, sans les blancs autour, et vide la zone", () => {
    view.render(NEW_CONVERSATION, "/Notes");
    input().value = "  Range mes notes \n";
    expect(press("Enter").defaultPrevented).toBe(true);
    expect(log).toEqual(["envoyer Range mes notes"]);
    expect(input().value).toBe("");
  });

  it("Maj+Entrée va à la ligne ; un message vide ne part pas", () => {
    view.render(NEW_CONVERSATION, "/Notes");
    input().value = "Une ligne";
    expect(press("Enter", { shiftKey: true }).defaultPrevented).toBe(false);
    expect(press("a").defaultPrevented).toBe(false);
    // Entrée qui valide un accent ou un caractère composé ne fait pas partir le message.
    expect(press("Enter", { isComposing: true }).defaultPrevented).toBe(false);
    input().value = "   ";
    press("Enter");
    expect(log).toEqual([]);
  });

  it("un message part même avant que la conversation soit dessinée", () => {
    input().value = "Bonjour";
    press("Enter");
    expect(log).toEqual(["envoyer Bonjour"]);
  });

  it("le bouton Envoyer envoie aussi", () => {
    view.render(NEW_CONVERSATION, "/Notes");
    input().value = "Bonjour";
    button("send").click();
    expect(log).toEqual(["envoyer Bonjour"]);
  });

  it("pendant un tour : Arrêter à la place d'Envoyer, rien ne part, pas de nouvelle conversation", () => {
    view.render({ entries: [{ kind: "user", text: "Un" }], turn: "running" }, "/Notes");
    expect(shown()).toEqual(["Un", WORKING]);
    expect(find(".claude-working").textContent).toBe(WORKING);
    expect(button("send").hidden).toBe(true);
    expect(button("stop").hidden).toBe(false);
    expect(button("stop").disabled).toBe(false);
    expect(button("new-conversation").disabled).toBe(true);
    input().value = "Deux";
    press("Enter");
    expect(log).toEqual([]);
    expect(input().value).toBe("Deux");
    button("stop").click();
    expect(log).toEqual(["arrêter"]);
    view.render({ entries: [], turn: "stopping" }, "/Notes");
    expect(button("stop").disabled).toBe(true);
  });

  it("hors d'un tour : Envoyer, et Nouvelle conversation possible", () => {
    view.render(NEW_CONVERSATION, "/Notes");
    expect(button("send").hidden).toBe(false);
    expect(button("stop").hidden).toBe(true);
    button("new-conversation").click();
    button("close").click();
    expect(log).toEqual(["nouvelle conversation", "masquer"]);
  });

  it("Claude Code indisponible : la raison est montrée et l'écriture empêchée", () => {
    view.render(NEW_CONVERSATION, "/Notes");
    view.showUnavailable("Claude Code n'est pas installé");
    expect(find(".claude-unavailable").hidden).toBe(false);
    expect(find(".claude-unavailable").textContent).toBe("Claude Code n'est pas installé");
    expect(input().disabled).toBe(true);
    expect(button("send").disabled).toBe(true);
    input().value = "Bonjour";
    button("send").click();
    expect(log).toEqual([]);
    view.showUnavailable(null);
    expect(find(".claude-unavailable").hidden).toBe(true);
    expect(find(".claude-unavailable").textContent).toBe("");
    expect(input().disabled).toBe(false);
    expect(button("send").disabled).toBe(false);
  });

  it("met le curseur dans la zone du message", () => {
    view.focus();
    expect(document.activeElement).toBe(input());
  });
});
