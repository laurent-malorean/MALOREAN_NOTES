import { describe, expect, it } from "vitest";
import { libraryScreen } from "../../test-support/app-fixture";
import type { PreferenceStorage } from "../state/focus-preference";
import { welcome } from "../state/screen";
import { createFoldMemory } from "./fold-memory";

function memoryStorage() {
  const items = new Map<string, string>();
  const storage: PreferenceStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
  return { storage, items };
}

describe("dossiers pliés gardés", () => {
  it("garde les dossiers pliés de la bibliothèque affichée, et les rend pour elle", () => {
    const { storage, items } = memoryStorage();
    const memory = createFoldMemory(storage);
    memory.save(libraryScreen([], (screen) => ({ ...screen, folded: ["Travail"] })));
    expect(items.get("malorean.folded:/lib")).toBe('["Travail"]');
    expect(memory.load("/lib")).toEqual(["Travail"]);
    expect(memory.load("/autre")).toEqual([]);
  });

  it("sur l'accueil, ne garde rien", () => {
    const { storage, items } = memoryStorage();
    createFoldMemory(storage).save(welcome);
    expect(items.size).toBe(0);
  });
});
