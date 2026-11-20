import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeEventItem } from "../bridge";
import { createLayout, type Layout } from "../screens/layout";
import { type ClaudeColumn, createClaudeColumn } from "./claude-column";

const MINUTE = 60_000;
const NOW = 1_795_138_261_000;

let layout: Layout;
let announce: (event: ClaudeEventItem) => void;
let workspacePath: string;
let column: ClaudeColumn;

const find = (selector: string) => layout.claudeColumn.querySelector(selector) as HTMLElement;
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout"] });
  vi.setSystemTime(NOW);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  layout = createLayout(root);
  workspacePath = "/Users/moi/Notes";
  column = createClaudeColumn({
    backend: {
      claudeStatus: async () => ({ kind: "ready", email: null, organization: null }),
      sendToClaude: async () => null,
      stopClaude: async () => null,
      newConversation: async () => null,
      onClaudeEvent: async (handler) => ((announce = handler), () => {}),
      errorMessage: String,
      listAllNotes: async () => [],
      logOutOfClaude: async () => null,
      logInToClaude: async () => null,
      onClaudeSignIn: async () => () => {},
      copyPlainText: async () => null,
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
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    openNote: () => {},
    error: () => {},
  });
});

afterEach(() => vi.useRealTimers());

function answered() {
  announce({ kind: "modelUsed", model: "claude-opus-5-5" });
  announce({
    kind: "usageLimits",
    reached: false,
    windows: [{ period: "session", percent: 16, resetsAt: (NOW + 3 * MINUTE) / 1000 }],
  });
  announce({ kind: "contextFilled", used: 420, size: 1000 });
}

describe("colonne Claude Code : la charge annoncée", () => {
  it("se montre dans la barre de saisie à mesure que Claude Code l'annonce", () => {
    expect(find(".claude-limit").hidden).toBe(true);
    answered();
    expect(find(".claude-settings-chip").textContent).toBe("Opus 5.5");
    expect(find(".claude-limit").textContent).toBe("Session 16 % · 3 min");
    expect(find(".claude-context").textContent).toBe("Contexte 42 %");
  });

  it("le temps avant la remise à zéro se recalcule chaque minute", () => {
    answered();
    vi.advanceTimersByTime(MINUTE);
    expect(find(".claude-limit").textContent).toBe("Session 16 % · 2 min");
  });

  it("une conversation neuve oublie le modèle et le contexte, garde la limite", async () => {
    answered();
    find("[data-new-conversation]").click();
    await settle();
    expect(find(".claude-context").hidden).toBe(true);
    expect(find(".claude-settings-chip").textContent).toBe("Modèle par défaut");
    expect(find(".claude-limit").textContent).toBe("Session 16 % · 3 min");
  });

  it("un autre espace de travail fait de même", () => {
    answered();
    column.follow();
    expect(find(".claude-context").hidden).toBe(false);
    workspacePath = "/Users/moi/Autres";
    column.follow();
    expect(find(".claude-context").hidden).toBe(true);
    expect(find(".claude-limit").hidden).toBe(false);
  });
});
