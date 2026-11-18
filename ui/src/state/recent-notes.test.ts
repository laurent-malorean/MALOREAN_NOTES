import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  loadRecent,
  noteVisited,
  RECENT_NOTES_LIMIT,
  recentFirst,
  recentKept,
  recentMoved,
  saveRecent,
} from "./recent-notes";

function memoryStorage(values: Record<string, string> = {}) {
  return {
    values,
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => void (values[key] = value),
    removeItem: (key: string) => void Reflect.deleteProperty(values, key),
  };
}

const refused = {
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

const many = (count: number) => Array.from({ length: count }, (_, i) => `n${i}.md`);

describe("notes récentes", () => {
  it("en gardent dix au plus", () => {
    expect(RECENT_NOTES_LIMIT).toBe(10);
  });

  it("mettent la note ouverte en tête, sans doublon", () => {
    expect(noteVisited([], "a.md")).toEqual(["a.md"]);
    expect(noteVisited(["a.md", "b.md", "c.md"], "c.md")).toEqual(["c.md", "a.md", "b.md"]);
    expect(noteVisited(["a.md"], "a.md")).toEqual(["a.md"]);
  });

  it("oublient la plus ancienne au-delà de la limite", () => {
    const full = many(RECENT_NOTES_LIMIT);
    expect(noteVisited(full, "neuve.md")).toEqual(["neuve.md", ...full.slice(0, -1)]);
  });

  it("restent la même liste quand aucune note n'est montrée", () => {
    const recent = ["a.md"];
    expect(noteVisited(recent, null)).toBe(recent);
  });

  it("suivent une note renommée ou déplacée, sans doublon", () => {
    const rename = (path: string) => (path === "b.md" ? "Travail/b2.md" : path);
    expect(recentMoved(["a.md", "b.md", "c.md"], rename)).toEqual([
      "a.md",
      "Travail/b2.md",
      "c.md",
    ]);
    expect(recentMoved(["Travail/b2.md", "b.md"], rename)).toEqual(["Travail/b2.md"]);
  });

  it("perdent les notes parties", () => {
    expect(recentKept(["a.md", "b.md", "c.md"], (path) => path !== "b.md")).toEqual([
      "a.md",
      "c.md",
    ]);
  });

  it("passent en tête des notes proposées, dans leur ordre, les autres gardant le leur", () => {
    const notes = ["a.md", "b.md", "c.md", "d.md"].map((path) => ({ path }));
    expect(recentFirst(notes, ["c.md", "partie.md", "a.md"]).map((n) => n.path)).toEqual([
      "c.md",
      "a.md",
      "b.md",
      "d.md",
    ]);
  });

  it("sont toujours sans doublon et dix au plus", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...many(15)), { maxLength: 40 }), (opened) => {
        const recent = opened.reduce<readonly string[]>(noteVisited, []);
        expect(new Set(recent).size).toBe(recent.length);
        expect(recent.length).toBeLessThanOrEqual(RECENT_NOTES_LIMIT);
        if (opened.length > 0) expect(recent[0]).toBe(opened.at(-1));
      }),
    );
  });

  it("sont gardées pour chaque espace de travail", () => {
    const storage = memoryStorage();
    saveRecent(storage, "/a", ["b.md", "a.md"]);
    expect(storage.values).toEqual({ "malorean.recent:/a": '["b.md","a.md"]' });
    expect(loadRecent(storage, "/a")).toEqual(["b.md", "a.md"]);
    expect(loadRecent(storage, "/b")).toEqual([]);
    saveRecent(storage, "/a", []);
    expect(storage.values).toEqual({});
  });

  it("sont ignorées si la valeur gardée est illisible, et la limite s'applique", () => {
    for (const value of ["{", '"a.md"', '[1, "a.md"]', "null"]) {
      expect(loadRecent(memoryStorage({ "malorean.recent:/a": value }), "/a")).toEqual([]);
    }
    const stored = JSON.stringify(many(12));
    expect(loadRecent(memoryStorage({ "malorean.recent:/a": stored }), "/a")).toEqual(many(10));
  });

  it("ne gênent pas si le stockage est refusé", () => {
    expect(loadRecent(refused, "/a")).toEqual([]);
    expect(() => saveRecent(refused, "/a", ["a.md"])).not.toThrow();
  });
});
