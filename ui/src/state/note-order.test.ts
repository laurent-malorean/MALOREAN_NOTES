import { describe, expect, it } from "vitest";
import { loadNoteOrder, NOTE_ORDERS, saveNoteOrder } from "./note-order";

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

describe("tri de la liste", () => {
  it("propose la date de modification puis le titre", () => {
    expect(NOTE_ORDERS).toEqual([
      { order: "modified", label: "Date de modification" },
      { order: "title", label: "Titre" },
    ]);
  });

  it("est gardé pour chaque bibliothèque", () => {
    const storage = memoryStorage();
    saveNoteOrder(storage, "/a", "title");
    expect(storage.values).toEqual({ "malorean.order:/a": "title" });
    expect(loadNoteOrder(storage, "/a")).toBe("title");
    expect(loadNoteOrder(storage, "/b")).toBe("modified");
  });

  it("le tri par défaut n'est pas écrit : il efface celui qui était gardé", () => {
    const storage = memoryStorage({ "malorean.order:/a": "title" });
    saveNoteOrder(storage, "/a", "modified");
    expect(storage.values).toEqual({});
  });

  it("revient par date de modification sans rien de gardé, illisible, ou stockage refusé", () => {
    expect(loadNoteOrder(memoryStorage(), "/a")).toBe("modified");
    expect(loadNoteOrder(memoryStorage({ "malorean.order:/a": "taille" }), "/a")).toBe("modified");
    expect(loadNoteOrder(memoryStorage({ "malorean.order:/a": "created" }), "/a")).toBe("modified");
    expect(loadNoteOrder(refused, "/a")).toBe("modified");
    expect(() => saveNoteOrder(refused, "/a", "title")).not.toThrow();
  });
});
