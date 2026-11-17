import { describe, expect, it } from "vitest";
import { loadSidePanels, nextSidePanels, saveSidePanels } from "./side-panels-preference";

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

describe("réglage des panneaux latéraux", () => {
  it("passe de montrés à cachés, et inversement", () => {
    expect(nextSidePanels("shown")).toBe("hidden");
    expect(nextSidePanels("hidden")).toBe("shown");
  });

  it("est retrouvé d'un lancement à l'autre, sous sa propre clé", () => {
    const storage = memoryStorage();
    saveSidePanels(storage, "hidden");
    expect([...storage.items]).toEqual([["malorean.side-panels", "hidden"]]);
    expect(loadSidePanels(storage)).toBe("hidden");
    saveSidePanels(storage, "shown");
    expect([...storage.items]).toEqual([]);
    expect(loadSidePanels(storage)).toBe("shown");
  });

  it("sont montrés au premier lancement ou si la valeur gardée est inconnue", () => {
    expect(loadSidePanels(memoryStorage())).toBe("shown");
    expect(loadSidePanels(memoryStorage({ "malorean.side-panels": "oui" }))).toBe("shown");
  });

  it("ne bloque rien si le stockage est refusé", () => {
    expect(loadSidePanels(broken)).toBe("shown");
    expect(() => saveSidePanels(broken, "hidden")).not.toThrow();
    expect(() => saveSidePanels(broken, "shown")).not.toThrow();
  });
});
