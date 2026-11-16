import { describe, expect, it } from "vitest";
import { loadFocusUnit, nextFocusUnit, saveFocusUnit } from "./focus-preference";

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

describe("réglage du mode focus", () => {
  it("passe d'arrêté à phrase, puis paragraphe, puis arrêté", () => {
    expect(nextFocusUnit(null)).toBe("sentence");
    expect(nextFocusUnit("sentence")).toBe("paragraph");
    expect(nextFocusUnit("paragraph")).toBeNull();
  });

  it("est retrouvé d'un lancement à l'autre", () => {
    const storage = memoryStorage();
    saveFocusUnit(storage, "paragraph");
    expect(loadFocusUnit(storage)).toBe("paragraph");
    saveFocusUnit(storage, null);
    expect(loadFocusUnit(storage)).toBeNull();
  });

  it("est gardé sous sa propre clé, retirée quand le mode est arrêté", () => {
    const storage = memoryStorage({ "malorean.focus": "sentence" });
    expect(loadFocusUnit(storage)).toBe("sentence");
    saveFocusUnit(storage, null);
    expect([...storage.items.keys()]).toEqual([]);
  });

  it("ne bloque rien si le stockage refuse d'oublier le réglage", () => {
    expect(() => saveFocusUnit(broken, null)).not.toThrow();
  });

  it("est arrêté au premier lancement", () => {
    expect(loadFocusUnit(memoryStorage())).toBeNull();
  });

  it("ignore une valeur inconnue", () => {
    expect(loadFocusUnit(memoryStorage({ "malorean.focus": "mot" }))).toBeNull();
  });

  it("ne bloque rien si le stockage est refusé", () => {
    expect(loadFocusUnit(broken)).toBeNull();
    expect(() => saveFocusUnit(broken, "sentence")).not.toThrow();
  });
});
