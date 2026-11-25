import { describe, expect, it } from "vitest";
import { folderChoices, folderLabel, newFolderName } from "./folder-choice";

describe("étiquette d'un dossier dans l'arborescence du choix", () => {
  it("écrit le nom seul à la racine, puis « ⎿ » et un retrait de deux espaces insécables par niveau de plus", () => {
    expect(folderLabel("Notes")).toBe("Notes");
    expect(folderLabel("Notes/Travail")).toBe("⎿ Travail");
    expect(folderLabel("Notes/Travail/2026")).toBe("  ⎿ 2026");
    expect(folderLabel("Notes/Travail/2026/Mars")).toBe("    ⎿ Mars");
  });
});

describe("dossiers proposés par le choix", () => {
  const folders = ["Journal", "Notes", "Notes/Travail", "Notes/Travail/2026"];

  it("propose chaque dossier dans l'ordre de l'arbre, son chemin pour valeur", () => {
    expect(folderChoices(folders, "Notes")).toEqual([
      { value: "Journal", label: "Journal" },
      { value: "Notes", label: "Notes" },
      { value: "Notes/Travail", label: "⎿ Travail" },
      { value: "Notes/Travail/2026", label: "  ⎿ 2026" },
    ]);
  });

  it("ajoute à la fin le choix en cours quand ce n'est pas un dossier de la liste, sous son chemin entier", () => {
    expect(folderChoices(folders, "Perso/Carnet").at(-1)).toEqual({
      value: "Perso/Carnet",
      label: "Perso/Carnet",
    });
    expect(folderChoices(folders, "Perso/Carnet")).toHaveLength(5);
  });

  it("n'ajoute rien si le choix en cours est dans la liste, absent, ou vide", () => {
    expect(folderChoices(folders, "Notes/Travail")).toHaveLength(4);
    expect(folderChoices(folders, null)).toHaveLength(4);
    expect(folderChoices(folders, "")).toHaveLength(4);
    expect(folderChoices([], "Journal")).toEqual([{ value: "Journal", label: "Journal" }]);
  });
});

describe("nom d'un nouveau dossier", () => {
  it("accepte un nom, les espaces autour retirés", () => {
    expect(newFolderName("Carnet")).toBe("Carnet");
    expect(newFolderName("  Projets perso ")).toBe("Projets perso");
    expect(newFolderName("a.b")).toBe("a.b");
    expect(newFolderName("assets")).toBe("assets");
  });

  it("refuse ce que Rust refuse : vide, caché, avec un séparateur, de pièces jointes ou de dépendances", () => {
    for (const bad of [
      "",
      "   ",
      ".git",
      "a/b",
      "a\\b",
      "x\0",
      "voyage.assets",
      "V.ASSETS",
      "node_modules",
      "Node_Modules",
    ])
      expect(newFolderName(bad), JSON.stringify(bad)).toBeNull();
  });
});
