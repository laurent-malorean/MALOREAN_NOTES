import { describe, expect, it } from "vitest";
import type { PreferenceStorage } from "./focus-preference";
import { loadTemplatesFolder, saveTemplatesFolder, templatesIn } from "./templates-folder";

function memoryStorage(refused = false) {
  const items = new Map<string, string>();
  const check = () => {
    if (refused) throw new Error("stockage refusé");
  };
  const storage: PreferenceStorage = {
    getItem: (key) => (check(), items.get(key) ?? null),
    setItem: (key, value) => (check(), void items.set(key, value)),
    removeItem: (key) => (check(), void items.delete(key)),
  };
  return { storage, items };
}

describe("dossier des modèles", () => {
  it("chaque espace de travail garde le sien", () => {
    const { storage, items } = memoryStorage();
    expect(loadTemplatesFolder(storage, "/notes")).toBeNull();
    saveTemplatesFolder(storage, "/notes", "Modèles");
    saveTemplatesFolder(storage, "/autres", "Gabarits");
    expect(loadTemplatesFolder(storage, "/notes")).toBe("Modèles");
    expect(loadTemplatesFolder(storage, "/autres")).toBe("Gabarits");
    expect(items.get("malorean.templates:/notes")).toBe("Modèles");
  });

  it("aucun dossier choisi efface le choix gardé", () => {
    const { storage, items } = memoryStorage();
    saveTemplatesFolder(storage, "/notes", "Modèles");
    saveTemplatesFolder(storage, "/notes", null);
    expect(loadTemplatesFolder(storage, "/notes")).toBeNull();
    expect(items.size).toBe(0);
  });

  it("un choix vide vaut aucun dossier", () => {
    const { storage, items } = memoryStorage();
    items.set("malorean.templates:/notes", "");
    expect(loadTemplatesFolder(storage, "/notes")).toBeNull();
  });

  it("un stockage refusé ne garde rien et ne bloque rien", () => {
    const { storage } = memoryStorage(true);
    expect(() => saveTemplatesFolder(storage, "/notes", "Modèles")).not.toThrow();
    expect(() => saveTemplatesFolder(storage, "/notes", null)).not.toThrow();
    expect(loadTemplatesFolder(storage, "/notes")).toBeNull();
  });

  it("les modèles sont les notes du dossier, pas celles de ses sous-dossiers", () => {
    const notes = [
      { path: "Modèles/a.md", title: "A", folder: "Modèles" },
      { path: "Modèles/Vieux/b.md", title: "B", folder: "Modèles/Vieux" },
      { path: "c.md", title: "C", folder: "" },
      { path: "Modèles-bis/d.md", title: "D", folder: "Modèles-bis" },
    ];
    expect(templatesIn(notes, "Modèles").map((note) => note.path)).toEqual(["Modèles/a.md"]);
  });
});
