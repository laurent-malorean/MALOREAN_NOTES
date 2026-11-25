import { describe, expect, it } from "vitest";
import {
  forgetFoldersTreeHeight,
  loadFoldersTreeHeight,
  saveFoldersTreeHeight,
} from "./folders-tree-height";

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

describe("hauteur de l'arborescence des dossiers", () => {
  it("sans hauteur gardée, rien : la hauteur par défaut", () => {
    expect(loadFoldersTreeHeight(memoryStorage())).toBeNull();
  });

  it("garde la hauteur en pixels entiers et la retrouve", () => {
    const storage = memoryStorage();
    saveFoldersTreeHeight(storage, 312.6);
    expect(storage.items).toEqual(new Map([["malorean.folders-tree-height", "313"]]));
    expect(loadFoldersTreeHeight(storage)).toBe(313);
  });

  it("oublie la hauteur gardée", () => {
    const storage = memoryStorage({ "malorean.folders-tree-height": "300" });
    forgetFoldersTreeHeight(storage);
    expect(storage.items.size).toBe(0);
    expect(loadFoldersTreeHeight(storage)).toBeNull();
  });

  it("une hauteur illisible, nulle ou négative est ignorée", () => {
    for (const value of ["haute", "", "0", "-40", "Infinity"]) {
      const storage = memoryStorage({ "malorean.folders-tree-height": value });
      expect(loadFoldersTreeHeight(storage)).toBeNull();
    }
  });

  it("un stockage refusé n'empêche rien", () => {
    expect(loadFoldersTreeHeight(broken)).toBeNull();
    expect(() => saveFoldersTreeHeight(broken, 300)).not.toThrow();
    expect(() => forgetFoldersTreeHeight(broken)).not.toThrow();
  });
});
