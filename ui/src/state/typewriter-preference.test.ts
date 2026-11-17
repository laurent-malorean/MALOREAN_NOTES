import { describe, expect, it } from "vitest";
import { loadTypewriter, nextTypewriter, saveTypewriter } from "./typewriter-preference";

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

describe("réglage du mode machine à écrire", () => {
  it("passe de l'arrêt à la marche, et inversement", () => {
    expect(nextTypewriter("off")).toBe("on");
    expect(nextTypewriter("on")).toBe("off");
  });

  it("est retrouvé d'un lancement à l'autre, sous sa propre clé", () => {
    const storage = memoryStorage();
    saveTypewriter(storage, "on");
    expect([...storage.items]).toEqual([["malorean.typewriter", "on"]]);
    expect(loadTypewriter(storage)).toBe("on");
    saveTypewriter(storage, "off");
    expect([...storage.items]).toEqual([]);
    expect(loadTypewriter(storage)).toBe("off");
  });

  it("est arrêté au premier lancement ou si la valeur gardée est inconnue", () => {
    expect(loadTypewriter(memoryStorage())).toBe("off");
    expect(loadTypewriter(memoryStorage({ "malorean.typewriter": "oui" }))).toBe("off");
  });

  it("ne bloque rien si le stockage est refusé", () => {
    expect(loadTypewriter(broken)).toBe("off");
    expect(() => saveTypewriter(broken, "on")).not.toThrow();
    expect(() => saveTypewriter(broken, "off")).not.toThrow();
  });
});
