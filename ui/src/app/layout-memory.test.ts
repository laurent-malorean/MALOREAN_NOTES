import { describe, expect, it } from "vitest";
import { activeNote, columnsStarted, noteOpened } from "../state/columns";
import { createLayoutMemory } from "./layout-memory";

function setup() {
  const items = new Map<string, string>();
  const calls: string[] = [];
  const memory = createLayoutMemory({
    backend: {
      listAllNotes: async () => (
        calls.push("toutes les notes"),
        [
          { path: "a.md", title: "A", folder: "" },
          { path: "b.md", title: "B", folder: "" },
        ]
      ),
    },
    storage: {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => void items.set(key, value),
      removeItem: (key) => void items.delete(key),
    },
  });
  return { memory, items, calls };
}

describe("mémoire de la disposition", () => {
  it("ne garde rien tant qu'aucune bibliothèque n'est ouverte", () => {
    const t = setup();
    t.memory.save(noteOpened(columnsStarted, "a.md"));
    expect(t.items.size).toBe(0);
  });

  it("garde les colonnes de la bibliothèque ouverte, et les retrouve à sa réouverture", async () => {
    const t = setup();
    expect(await t.memory.restore("/notes")).toBeNull();
    expect(t.calls).toEqual(["toutes les notes"]);
    t.memory.save(noteOpened(noteOpened(columnsStarted, "a.md"), "b.md"));
    expect(await t.memory.restore("/autres")).toBeNull();
    t.memory.save(noteOpened(columnsStarted, "a.md"));
    const notes = await t.memory.restore("/notes");
    expect(notes?.list[0]?.tabs.map((tab) => tab.title)).toEqual(["A", "B"]);
    expect(activeNote(notes ?? columnsStarted)).toBe("b.md");
    expect(activeNote((await t.memory.restore("/autres")) ?? columnsStarted)).toBe("a.md");
  });

  it("pendant qu'on lit la bibliothèque qui s'ouvre, les colonnes restent gardées pour la précédente", async () => {
    const t = setup();
    await t.memory.restore("/notes");
    const opening = t.memory.restore("/autres");
    t.memory.save(noteOpened(columnsStarted, "a.md"));
    await opening;
    expect([...t.items.keys()]).toEqual(["malorean.layout:/notes"]);
  });
});
