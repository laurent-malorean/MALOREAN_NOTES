import { describe, expect, it } from "vitest";
import { canMoveInto, folderOf, folderTree, movedPath, nameOf, parentOf } from "./folders";

describe("arbre des dossiers", () => {
  it("donne à chaque dossier son nom et sa profondeur, dans l'ordre reçu", () => {
    expect(folderTree(["Perso", "Travail", "Travail/Réunions", "Travail/Réunions/2026"])).toEqual([
      { path: "Perso", name: "Perso", depth: 1 },
      { path: "Travail", name: "Travail", depth: 1 },
      { path: "Travail/Réunions", name: "Réunions", depth: 2 },
      { path: "Travail/Réunions/2026", name: "2026", depth: 3 },
    ]);
  });
});

describe("chemins", () => {
  it("donne le nom d'un dossier", () => {
    expect(nameOf("Travail/Réunions/2026")).toBe("2026");
    expect(nameOf("Travail")).toBe("Travail");
  });

  it("trouve le dossier d'une note et le parent d'un dossier", () => {
    expect(folderOf("Travail/Réunions/lundi.md")).toBe("Travail/Réunions");
    expect(folderOf("idee.md")).toBe("");
    expect(parentOf("Travail/Réunions")).toBe("Travail");
    expect(parentOf("Travail")).toBe("");
  });

  it("suit un dossier déplacé, avec ce qu'il contient", () => {
    expect(movedPath("Travail", "Travail", "Perso/Travail")).toBe("Perso/Travail");
    expect(movedPath("Travail/a/n.md", "Travail", "Boulot")).toBe("Boulot/a/n.md");
    expect(movedPath("Travaux/n.md", "Travail", "Boulot")).toBe("Travaux/n.md");
    expect(movedPath("n.md", "Travail", "Boulot")).toBe("n.md");
  });
});

describe("déplacer un dossier", () => {
  it("dans un autre dossier ou à la racine", () => {
    expect(canMoveInto("Perso", "Travail")).toBe(true);
    expect(canMoveInto("Travail/Réunions", "")).toBe(true);
  });

  it("jamais dans lui-même ni dans ses sous-dossiers", () => {
    expect(canMoveInto("Travail", "Travail")).toBe(false);
    expect(canMoveInto("Travail", "Travail/Réunions")).toBe(false);
    expect(canMoveInto("Travail", "Travaux")).toBe(true);
  });

  it("ni là où il est déjà", () => {
    expect(canMoveInto("Travail/Réunions", "Travail")).toBe(false);
    expect(canMoveInto("Perso", "")).toBe(false);
  });
});
