import { describe, expect, it } from "vitest";
import { folderChoices, folderLabel, newFolderPath } from "./folder-choice";

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

describe("chemin d'un nouveau dossier", () => {
  it("accepte un nom, les espaces autour retirés", () => {
    expect(newFolderPath("Carnet")).toBe("Carnet");
    expect(newFolderPath("  Projets perso ")).toBe("Projets perso");
    expect(newFolderPath("a.b")).toBe("a.b");
    expect(newFolderPath("assets")).toBe("assets");
  });

  it("accepte un chemin imbriqué, dont chaque nom est nettoyé", () => {
    expect(newFolderPath("Perso/Carnet")).toBe("Perso/Carnet");
    expect(newFolderPath("A/B/C")).toBe("A/B/C");
    expect(newFolderPath(" Perso / Carnet ")).toBe("Perso/Carnet");
  });

  it("retire les « / » du début et de la fin, comme l'ancien champ libre", () => {
    expect(newFolderPath("/Carnet/")).toBe("Carnet");
    expect(newFolderPath("//Perso/Carnet//")).toBe("Perso/Carnet");
  });

  it("refuse un chemin dont un seul nom est refusé : vide, caché, de pièces jointes ou de dépendances", () => {
    for (const bad of [
      "",
      "   ",
      "/",
      "//",
      "a//b",
      "a/ /b",
      ".git",
      "a/.cache",
      ".a/b",
      "a/voyage.assets",
      "voyage.assets/a",
      "V.ASSETS",
      "a/node_modules",
      "node_modules/a",
      "Node_Modules",
    ])
      expect(newFolderPath(bad), JSON.stringify(bad)).toBeNull();
  });

  it("refuse l'antislash et le caractère nul, dans un nom comme dans un chemin", () => {
    for (const bad of ["a\\b", "a/b\\c", "x\0", "a/x\0"])
      expect(newFolderPath(bad), JSON.stringify(bad)).toBeNull();
  });
});
