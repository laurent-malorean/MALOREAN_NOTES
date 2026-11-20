import { describe, expect, it } from "vitest";
import { NO_AGENTS, type SubAgent } from "./agent-map";
import {
  attachedNotes,
  attachmentsSent,
  EFFORTS,
  elapsedText,
  loadTurnSettings,
  MODELS,
  messageWithNotes,
  modelVersion,
  NO_ATTACHMENTS,
  NO_SETTINGS,
  noteAttached,
  noteDetached,
  openNoteFollowed,
  runningAgentsText,
  saveTurnSettings,
  settingsText,
  titleFromPath,
} from "./claude-input-bar";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const refusing = {
  getItem: () => {
    throw new Error("refusé");
  },
  setItem: () => {
    throw new Error("refusé");
  },
  removeItem: () => {
    throw new Error("refusé");
  },
};

describe("réglages du tour", () => {
  it("les modèles vont du plus léger au plus capable, les efforts du plus bas au plus haut", () => {
    expect(MODELS.map((choice) => choice.label)).toEqual(["Haiku", "Sonnet", "Opus", "Fable"]);
    expect(EFFORTS.map((choice) => choice.value)).toEqual([
      "low",
      "medium",
      "high",
      "extraHigh",
      "max",
    ]);
    expect(EFFORTS.map((choice) => choice.label)).toEqual([
      "Low",
      "Medium",
      "High",
      "Extra high",
      "Max",
    ]);
  });

  it("la pastille dit le modèle et l'effort choisis, ou le défaut de Claude Code", () => {
    expect(settingsText({ model: "opus", effort: "medium" })).toBe("Opus · Medium");
    expect(settingsText({ model: "sonnet", effort: null })).toBe("Sonnet");
    expect(settingsText({ model: null, effort: "extraHigh" })).toBe(
      "Modèle par défaut · Extra high",
    );
    expect(settingsText(NO_SETTINGS)).toBe("Modèle par défaut");
  });

  it("après une réponse, la pastille dit la version du modèle qui a répondu", () => {
    const opus = "claude-opus-5-5";
    expect(settingsText({ model: "opus", effort: "medium" }, opus)).toBe("Opus 5.5 · Medium");
    expect(settingsText(NO_SETTINGS, opus)).toBe("Opus 5.5");
    expect(settingsText({ model: null, effort: "high" }, "claude-haiku-5-5")).toBe(
      "Haiku 5.5 · High",
    );
    // Une autre famille choisie depuis : son nom, la version n'est pas encore connue.
    expect(settingsText({ model: "sonnet", effort: null }, opus)).toBe("Sonnet");
    expect(settingsText({ model: "opus", effort: null }, "modèle-inconnu")).toBe("Opus");
    expect(settingsText(NO_SETTINGS, "modèle-inconnu")).toBe("Modèle par défaut");
  });

  it("la version se lit dans le nom complet du modèle", () => {
    expect(modelVersion("claude-opus-5-5")).toEqual({ family: "opus", label: "Opus 5.5" });
    expect(modelVersion("claude-sonnet-4-5-20250929")).toEqual({
      family: "sonnet",
      label: "Sonnet 4.5",
    });
    expect(modelVersion("claude-fable-5[1m]")).toEqual({ family: "fable", label: "Fable 5" });
    expect(modelVersion("claude-3-5-haiku-20241022")).toEqual({
      family: "haiku",
      label: "Haiku 3.5",
    });
    expect(modelVersion("claude-opus-10-1")).toEqual({ family: "opus", label: "Opus 10.1" });
    expect(modelVersion("claude-haiku-5-5[2]")).toEqual({ family: "haiku", label: "Haiku 5.5" });
    expect(modelVersion("claude-opus")).toEqual({ family: "opus", label: "Opus" });
    expect(modelVersion("claude-3-5")).toBeNull();
    expect(modelVersion("")).toBeNull();
  });

  it("les réglages sont gardés d'un lancement à l'autre", () => {
    const storage = memoryStorage();
    saveTurnSettings(storage, { model: "fable", effort: "max" });
    expect(loadTurnSettings(storage)).toEqual({ model: "fable", effort: "max" });
    expect([...storage.items.keys()]).toEqual(["malorean.claudeSettings"]);
    saveTurnSettings(storage, { model: "haiku", effort: null });
    expect(loadTurnSettings(storage)).toEqual({ model: "haiku", effort: null });
    saveTurnSettings(storage, { model: null, effort: "low" });
    expect(loadTurnSettings(storage)).toEqual({ model: null, effort: "low" });
  });

  it("revenir au défaut de Claude Code n'en garde rien", () => {
    const storage = memoryStorage();
    saveTurnSettings(storage, { model: "opus", effort: "low" });
    saveTurnSettings(storage, NO_SETTINGS);
    expect(storage.items.size).toBe(0);
    expect(loadTurnSettings(storage)).toEqual(NO_SETTINGS);
  });

  it("des réglages inconnus, illisibles ou refusés laissent le défaut de Claude Code", () => {
    const key = "malorean.claudeSettings";
    expect(loadTurnSettings(memoryStorage({ [key]: '{"model":"gpt","effort":"--help"}' }))).toEqual(
      NO_SETTINGS,
    );
    expect(loadTurnSettings(memoryStorage({ [key]: '{"model":"opus"' }))).toEqual(NO_SETTINGS);
    expect(loadTurnSettings(memoryStorage({ [key]: "5" }))).toEqual(NO_SETTINGS);
    expect(loadTurnSettings(refusing)).toEqual(NO_SETTINGS);
    expect(() => saveTurnSettings(refusing, { model: "opus", effort: null })).not.toThrow();
  });
});

const agent = (id: string, state: SubAgent["state"]): SubAgent => ({
  id,
  parent: null,
  description: id,
  state,
  durationMs: null,
  tokens: null,
  actions: 0,
});

describe("pastilles de la réponse en cours", () => {
  it("la pastille des sous-agents compte ceux qui travaillent, zéro compris", () => {
    expect(runningAgentsText(NO_AGENTS)).toBe("● 0 agent");
    expect(runningAgentsText({ agents: [agent("A", "done")] })).toBe("● 0 agent");
    expect(runningAgentsText({ agents: [agent("A", "running"), agent("B", "done")] })).toBe(
      "● 1 agent",
    );
    expect(runningAgentsText({ agents: [agent("A", "running"), agent("B", "running")] })).toBe(
      "● 2 agents",
    );
  });

  it("la durée de la réponse se lit à la seconde", () => {
    expect(elapsedText(0)).toBe("0 s");
    expect(elapsedText(7999)).toBe("7 s");
    expect(elapsedText(59_999)).toBe("59 s");
    expect(elapsedText(60_000)).toBe("1 min 00 s");
    expect(elapsedText(65_000)).toBe("1 min 05 s");
    expect(elapsedText(754_000)).toBe("12 min 34 s");
  });
});

const alpha = { path: "a.md", title: "Alpha" };
const plan = { path: "Projets/plan.md", title: "Plan" };
const courses = { path: "courses.md", title: "Courses" };

describe("notes jointes", () => {
  it("la note ouverte dans la colonne active est jointe d'office", () => {
    const joined = openNoteFollowed(NO_ATTACHMENTS, alpha);
    expect(attachedNotes(joined)).toEqual([alpha]);
    expect(attachedNotes(openNoteFollowed(joined, null))).toEqual([]);
  });

  it("retirée, la note ouverte revient quand une autre s'ouvre, pas quand son titre change", () => {
    const removed = noteDetached(openNoteFollowed(NO_ATTACHMENTS, alpha), "a.md");
    expect(attachedNotes(removed)).toEqual([]);
    const renamed = openNoteFollowed(removed, { path: "a.md", title: "Alpha bis" });
    expect(attachedNotes(renamed)).toEqual([]);
    expect(attachedNotes(noteDetached(renamed, "autre.md"))).toEqual([]);
    expect(attachedNotes(openNoteFollowed(renamed, plan))).toEqual([plan]);
    // Revenue à la note retirée après une autre : elle est jointe de nouveau.
    const back = openNoteFollowed(openNoteFollowed(renamed, plan), alpha);
    expect(attachedNotes(back)).toEqual([alpha]);
  });

  it("le titre de la note ouverte suit celui de son onglet", () => {
    const joined = openNoteFollowed(openNoteFollowed(NO_ATTACHMENTS, alpha), {
      path: "a.md",
      title: "Alpha bis",
    });
    expect(attachedNotes(joined)).toEqual([{ path: "a.md", title: "Alpha bis" }]);
  });

  it("« + » joint d'autres notes, chacune une fois, après la note ouverte", () => {
    let joined = openNoteFollowed(NO_ATTACHMENTS, alpha);
    joined = noteAttached(joined, plan);
    joined = noteAttached(joined, plan);
    joined = noteAttached(joined, alpha);
    joined = noteAttached(joined, courses);
    expect(attachedNotes(joined)).toEqual([alpha, plan, courses]);
    expect(attachedNotes(noteDetached(joined, "Projets/plan.md"))).toEqual([alpha, courses]);
  });

  it("sans note ouverte, la croix retire une note jointe par « + »", () => {
    expect(attachedNotes(noteDetached(noteAttached(NO_ATTACHMENTS, plan), plan.path))).toEqual([]);
  });

  it("la note ouverte retirée le reste quand on retire une autre note", () => {
    let joined = noteAttached(openNoteFollowed(NO_ATTACHMENTS, alpha), plan);
    joined = noteDetached(noteDetached(joined, "a.md"), plan.path);
    expect(attachedNotes(joined)).toEqual([]);
  });

  it("la note ouverte retirée peut être rejointe par « + »", () => {
    const removed = noteDetached(openNoteFollowed(NO_ATTACHMENTS, alpha), "a.md");
    expect(attachedNotes(noteAttached(removed, alpha))).toEqual([alpha]);
  });

  it("une note jointe par « + » qui devient la note ouverte n'est montrée qu'une fois", () => {
    const joined = openNoteFollowed(noteAttached(NO_ATTACHMENTS, plan), plan);
    expect(attachedNotes(joined)).toEqual([plan]);
  });

  it("le message parti, les notes jointes par « + » sont retirées, la note ouverte reste", () => {
    const joined = noteAttached(openNoteFollowed(NO_ATTACHMENTS, alpha), plan);
    expect(attachedNotes(attachmentsSent(joined))).toEqual([alpha]);
  });

  it("le message envoyé se termine par les chemins des notes jointes", () => {
    expect(messageWithNotes("Résume", [])).toBe("Résume");
    expect(messageWithNotes("Résume", [alpha, plan])).toBe(
      "Résume\n\nNotes jointes (chemins depuis l'espace de travail) :\n- a.md\n- Projets/plan.md",
    );
  });

  it("sans titre connu, une note prend le nom de son fichier", () => {
    expect(titleFromPath("Projets/Plan du mois.md")).toBe("Plan du mois");
    expect(titleFromPath("a.MD")).toBe("a");
    expect(titleFromPath("notes.md.txt")).toBe("notes.md.txt");
  });
});
