import { describe, expect, it } from "vitest";
import type { ClaudeEventItem } from "../bridge";
import {
  ACTION_LABELS,
  ACTION_STATES,
  ALLOW_CHANGES_MESSAGE,
  changesHeldBack,
  type Conversation,
  eventReceived,
  messageSent,
  NEW_CONVERSATION,
  shownTarget,
  stopAsked,
  summaryText,
  turnEnded,
} from "./claude-column";

const play = (conversation: Conversation, ...events: ClaudeEventItem[]) =>
  events.reduce(eventReceived, conversation);

const started = (id: string, action: "write" | "read" | "other", agent: string | null = null) =>
  ({
    kind: "actionStarted",
    agent,
    id,
    action,
    tool: action === "other" ? "NotebookEdit" : null,
    target: `/Notes/${id}.md`,
  }) as const;

const summary = (tokens: number, failure: string | null = null) =>
  ({ kind: "summary", failure, durationMs: 1500, tokens }) as const;

const asked = messageSent(NEW_CONVERSATION, "Range mes notes");

const LOAD_EVENTS: ClaudeEventItem[] = [
  { kind: "modelUsed", model: "claude-opus-5-5" },
  { kind: "usageLimits", reached: false, windows: [] },
  { kind: "contextFilled", used: 1, size: 2 },
];

describe("conversation de la colonne Claude Code", () => {
  it("la charge annoncée ne s'écrit pas dans la conversation", () => {
    for (const event of LOAD_EVENTS) expect(play(asked, event)).toEqual(asked);
  });

  it("le message de l'utilisateur commence un tour", () => {
    expect(asked).toEqual({
      entries: [{ kind: "user", text: "Range mes notes", notes: [] }],
      turn: "running",
    });
  });

  it("le message garde les titres des notes jointes", () => {
    expect(messageSent(NEW_CONVERSATION, "Résume", ["Alpha", "Plan"]).entries).toEqual([
      { kind: "user", text: "Résume", notes: ["Alpha", "Plan"] },
    ]);
  });

  it("les messages de Claude arrivent dans l'ordre, ceux des sous-agents marqués", () => {
    const now = play(
      asked,
      { kind: "message", agent: null, text: "Je regarde." },
      { kind: "message", agent: "a1", text: "Trouvé." },
    );
    expect(now.entries.slice(1)).toEqual([
      { kind: "claude", text: "Je regarde.", subAgent: false },
      { kind: "claude", text: "Trouvé.", subAgent: true },
    ]);
  });

  it("chaque sorte d'action a son nom ; une action lancée tourne", () => {
    expect(ACTION_LABELS).toEqual({
      read: "Lecture",
      search: "Recherche",
      write: "Écriture",
      edit: "Modification",
      subAgent: "Sous-agent",
      webSearch: "Recherche sur le web",
      webPage: "Page web",
      appTool: "Outil de l’application",
      other: "Outil",
    });
    expect(play(asked, started("w", "write")).entries.at(-1)).toMatchObject({ state: "running" });
  });

  it("une action est nommée, puis suit son issue ; un refus le reste", () => {
    const now = play(
      asked,
      started("w", "write"),
      started("r", "read", "a1"),
      started("o", "other"),
      { kind: "actionFinished", id: "w", succeeded: true },
      { kind: "actionFinished", id: "r", succeeded: false },
      { kind: "actionRefused", id: "o" },
      { kind: "actionFinished", id: "o", succeeded: false },
    );
    expect(now.entries.slice(1)).toEqual([
      {
        kind: "action",
        id: "w",
        label: "Écriture",
        target: "/Notes/w.md",
        subAgent: false,
        state: "succeeded",
      },
      {
        kind: "action",
        id: "r",
        label: "Lecture",
        target: "/Notes/r.md",
        subAgent: true,
        state: "failed",
      },
      {
        kind: "action",
        id: "o",
        label: "NotebookEdit",
        target: "/Notes/o.md",
        subAgent: false,
        state: "refused",
      },
    ]);
  });

  it("un outil de l'application est nommé en français, un outil de l'application inconnu par sa sorte", () => {
    const tool = (id: string, name: string | null) =>
      ({
        kind: "actionStarted",
        agent: null,
        id,
        action: "appTool",
        tool: name,
        target: "pain",
      }) as const;
    const now = play(
      asked,
      tool("s", "search_notes"),
      tool("t", "list_tags"),
      tool("l", "linking_notes"),
      tool("m", "list_templates"),
      tool("h", "list_versions"),
      tool("v", "read_version"),
      ...[
        "create_note",
        "create_note_from_template",
        "trash_note",
        "rename_note",
        "move_note",
        "restore_version",
        "add_tags",
        "remove_tags",
        "pin_note",
        "unpin_note",
        "add_attachment",
        "add_entry",
        "viewed_note",
        "show_note",
      ].map((name) => tool(name, name)),
      tool("x", "futur"),
      tool("n", null),
    );
    expect(now.entries.slice(1).map((entry) => entry.kind === "action" && entry.label)).toEqual([
      "Recherche dans l’index",
      "Étiquettes",
      "Liens entrants",
      "Modèles",
      "Historique",
      "Lecture d’une version",
      "Nouvelle note",
      "Note depuis un modèle",
      "Mise à la corbeille",
      "Renommage",
      "Déplacement",
      "Restauration d’une version",
      "Ajout d’étiquettes",
      "Retrait d’étiquettes",
      "Épinglage",
      "Désépinglage",
      "Pièce jointe",
      "Ajout au cahier",
      "Note regardée",
      "Note montrée",
      "Outil de l’application",
      "Outil de l’application",
    ]);
    expect(now.entries.at(1)).toMatchObject({ target: "pain", state: "running" });
  });

  it("une modification retenue par le garde-fou du web le reste", () => {
    const now = play(
      asked,
      started("w", "write"),
      { kind: "changeHeldBack", id: "w" },
      { kind: "actionFinished", id: "w", succeeded: false },
    );
    expect(now.entries.at(-1)).toMatchObject({ id: "w", state: "heldBack" });
    expect(ACTION_STATES.heldBack).toBe("retenue");
  });

  it("des modifications retenues se proposent à l'autorisation une fois le tour fini", () => {
    const held = play(asked, started("w", "write"), { kind: "changeHeldBack", id: "w" });
    expect(changesHeldBack(held)).toBe(false);
    const ended = turnEnded(held, null);
    expect(changesHeldBack(ended)).toBe(true);
    expect(changesHeldBack(turnEnded(stopAsked(held), "arrêtée"))).toBe(true);
    const refused = play(asked, started("o", "other"), { kind: "actionRefused", id: "o" });
    expect(changesHeldBack(turnEnded(refused, null))).toBe(false);
    // Le tour suivant ne propose plus celles d'avant.
    expect(changesHeldBack(turnEnded(messageSent(ended, "Encore"), null))).toBe(false);
    expect(changesHeldBack(NEW_CONVERSATION)).toBe(false);
    expect(ALLOW_CHANGES_MESSAGE).toBe(
      "J’autorise les modifications retenues après la lecture du web, pour cette réponse seulement : fais-les maintenant.",
    );
  });

  it("une note modifiée n'est montrée qu'une fois par tour", () => {
    const changed = { kind: "changedNote", path: "plan.md" } as const;
    const first = play(asked, changed, changed, { kind: "changedNote", path: "b.md" });
    expect(first.entries.slice(1)).toEqual([
      { kind: "changedNote", path: "plan.md" },
      { kind: "changedNote", path: "b.md" },
    ]);
    const next = play(messageSent(turnEnded(first, null), "Encore"), changed);
    expect(next.entries.at(-1)).toEqual(changed);
    expect(next.entries).toHaveLength(5);
  });

  it("le dernier bilan du tour remplace le précédent, pas celui d'un autre tour", () => {
    const first = turnEnded(play(asked, summary(10)), null);
    const second = play(messageSent(first, "Encore"), summary(20), started("w", "write"));
    const now = play(second, summary(30, "conversation inconnue"));
    expect(now.entries.map((entry) => entry.kind)).toEqual([
      "user",
      "summary",
      "user",
      "action",
      "summary",
    ]);
    expect(now.entries[1]).toEqual(summary(10));
    expect(now.entries[4]).toEqual(summary(30, "conversation inconnue"));
  });

  it("la fin d'un sous-agent ne change pas la conversation", () => {
    const end = {
      kind: "subAgentFinished",
      id: "a1",
      state: "done",
      durationMs: 1,
      tokens: 1,
      actions: 1,
    } as const;
    expect(eventReceived(asked, end)).toEqual(asked);
  });

  it("un tour se termine normalement, en erreur, ou arrêté à la demande", () => {
    expect(turnEnded(asked, null)).toEqual({ entries: asked.entries, turn: "idle" });
    expect(turnEnded(asked, "Claude répond déjà").entries.at(-1)).toEqual({
      kind: "error",
      message: "Claude répond déjà",
    });
    const stopping = stopAsked(asked);
    expect(stopping.turn).toBe("stopping");
    expect(turnEnded(stopping, "la réponse de Claude a été arrêtée")).toEqual({
      entries: [...asked.entries, { kind: "stopped" }],
      turn: "idle",
    });
  });

  it("l'arrêt ne se demande que pendant un tour", () => {
    expect(stopAsked(NEW_CONVERSATION)).toBe(NEW_CONVERSATION);
  });
});

describe("textes de la colonne Claude Code", () => {
  it("la cible d'une action dans l'espace de travail s'écrit depuis lui", () => {
    expect(shownTarget("/Users/moi/Notes/a/plan.md", "/Users/moi/Notes")).toBe("a/plan.md");
    expect(shownTarget("/Users/moi/Notes/plan.md", "/Users/moi/Notes/")).toBe("plan.md");
    expect(shownTarget("/Users/moi/Notes2/plan.md", "/Users/moi/Notes")).toBe(
      "/Users/moi/Notes2/plan.md",
    );
    expect(shownTarget("**/*.md", "/Users/moi/Notes")).toBe("**/*.md");
  });

  it("le bilan donne la durée et les jetons, en français", () => {
    expect(summaryText(12_340, 1234)).toBe("12,3 s · 1 234 jetons");
    expect(summaryText(59_940, 1)).toBe("59,9 s · 1 jeton");
    expect(summaryText(59_960, 0)).toBe("1 min 00 s · 0 jeton");
    expect(summaryText(125_400, 2)).toBe("2 min 05 s · 2 jetons");
  });
});
