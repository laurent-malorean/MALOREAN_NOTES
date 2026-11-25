import { describe, expect, it } from "vitest";
import {
  loadSettingsTab,
  placeInTabs,
  SETTINGS_TABS,
  saveSettingsTab,
  tabMoved,
} from "./settings-tabs";

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

describe("onglets des réglages", () => {
  it("sont Affichage, Écriture, Claude, Index puis Brancher une IA", () => {
    expect(SETTINGS_TABS.map((tab) => tab.name)).toEqual([
      "Affichage",
      "Écriture",
      "Claude",
      "Index",
      "Brancher une IA",
    ]);
  });

  it("regroupent chaque onglet avec ses parties, dans l'ordre", () => {
    expect(SETTINGS_TABS.map((tab) => tab.groups)).toEqual([
      ["Affichage"],
      ["Écriture", "Modèles", "Journal"],
      ["Claude"],
      ["Index", "Recherche par le sens"],
      ["Brancher une IA"],
    ]);
  });

  it("rangent chaque partie dans son onglet, dans l'ordre reçu", () => {
    const groups = [
      "Écriture",
      "Affichage",
      "Claude",
      "Modèles",
      "Journal",
      "Brancher une IA",
      "Index",
      "Recherche par le sens",
    ].map((name) => ({ name }));
    expect(placeInTabs(groups).map((tab) => tab.map((group) => group.name))).toEqual([
      ["Affichage"],
      ["Écriture", "Modèles", "Journal"],
      ["Claude"],
      ["Index", "Recherche par le sens"],
      ["Brancher une IA"],
    ]);
  });

  it("mettent une partie inconnue dans le premier onglet", () => {
    const tabs = placeInTabs([{ name: "Autre" }, { name: "Claude" }]);
    expect(tabs.map((tab) => tab.length)).toEqual([1, 0, 1, 0, 0]);
  });

  it("passent à l'onglet voisin avec les flèches, en faisant le tour", () => {
    expect(tabMoved(0, "ArrowRight", 4)).toBe(1);
    expect(tabMoved(3, "ArrowRight", 4)).toBe(0);
    expect(tabMoved(2, "ArrowLeft", 4)).toBe(1);
    expect(tabMoved(0, "ArrowLeft", 4)).toBe(3);
  });

  it("vont au premier ou au dernier onglet avec Début et Fin, et ignorent les autres touches", () => {
    expect(tabMoved(2, "Home", 4)).toBe(0);
    expect(tabMoved(1, "End", 4)).toBe(3);
    expect(tabMoved(1, "a", 4)).toBeNull();
    expect(tabMoved(1, "Tab", 4)).toBeNull();
  });

  it("rouvrent le dernier onglet ouvert, gardé sous sa propre clé", () => {
    const storage = memoryStorage();
    saveSettingsTab(storage, 3);
    expect(storage.items.get("malorean.settings-tab")).toBe("Index");
    expect(loadSettingsTab(storage)).toBe(3);
  });

  it("retombent sur le premier onglet si rien n'est gardé, si la valeur est illisible ou si le stockage est refusé", () => {
    expect(loadSettingsTab(memoryStorage())).toBe(0);
    expect(loadSettingsTab(memoryStorage({ "malorean.settings-tab": "Inconnu" }))).toBe(0);
    expect(loadSettingsTab(broken)).toBe(0);
    expect(() => saveSettingsTab(broken, 2)).not.toThrow();
  });
});
