import { describe, expect, it } from "vitest";
import { forgetPanelWidth, loadPanelWidth, savePanelWidth } from "./panel-width";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items,
  };
}

const broken = {
  getItem: (): string | null => {
    throw new Error("stockage interdit");
  },
  setItem: () => {
    throw new Error("stockage interdit");
  },
  removeItem: () => {
    throw new Error("stockage interdit");
  },
};

describe("largeur d'un panneau", () => {
  it("sans largeur gardée, rien : le panneau garde sa largeur par défaut", () => {
    expect(loadPanelWidth(memoryStorage(), "folders")).toBeNull();
  });

  it("garde la largeur de chaque panneau, en pixels entiers, et la retrouve", () => {
    const storage = memoryStorage();
    savePanelWidth(storage, "folders", 312.6);
    savePanelWidth(storage, "notes", 250);
    expect(storage.items).toEqual(
      new Map([
        ["malorean.panel-width.folders", "313"],
        ["malorean.panel-width.notes", "250"],
      ]),
    );
    expect(loadPanelWidth(storage, "folders")).toBe(313);
    expect(loadPanelWidth(storage, "notes")).toBe(250);
  });

  it("oublie la largeur gardée d'un seul panneau", () => {
    const storage = memoryStorage({
      "malorean.panel-width.folders": "300",
      "malorean.panel-width.notes": "260",
    });
    forgetPanelWidth(storage, "folders");
    expect(loadPanelWidth(storage, "folders")).toBeNull();
    expect(loadPanelWidth(storage, "notes")).toBe(260);
  });

  it("une largeur illisible, nulle ou négative est ignorée", () => {
    for (const value of ["large", "", "0", "-40", "Infinity"]) {
      const storage = memoryStorage({ "malorean.panel-width.notes": value });
      expect(loadPanelWidth(storage, "notes")).toBeNull();
    }
  });

  it("un stockage refusé n'empêche rien", () => {
    expect(loadPanelWidth(broken, "folders")).toBeNull();
    expect(() => savePanelWidth(broken, "folders", 300)).not.toThrow();
    expect(() => forgetPanelWidth(broken, "folders")).not.toThrow();
  });
});
