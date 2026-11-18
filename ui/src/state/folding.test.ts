import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  foldedMoved,
  foldToggled,
  hasSubfolders,
  loadFolded,
  parentsUnfolded,
  saveFolded,
  visibleFolders,
} from "./folding";
import type { PreferenceStorage } from "./focus-preference";

const FOLDERS = ["Perso", "Travail", "Travail/Réunions", "Travail/Réunions/2026", "Travaux"];

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

describe("dossiers pliés", () => {
  it("un dossier a des sous-dossiers s'il en contient au moins un, pas un dossier au nom voisin", () => {
    expect(hasSubfolders(FOLDERS, "Travail")).toBe(true);
    expect(hasSubfolders(FOLDERS, "Travail/Réunions")).toBe(true);
    expect(hasSubfolders(FOLDERS, "Travail/Réunions/2026")).toBe(false);
    expect(hasSubfolders(FOLDERS, "Perso")).toBe(false);
    expect(hasSubfolders(["Trav", "Travail"], "Trav")).toBe(false);
  });

  it("plier un dossier le plie, le plier de nouveau le déplie", () => {
    expect(foldToggled([], "Travail")).toEqual(["Travail"]);
    expect(foldToggled(["Perso", "Travail"], "Travail")).toEqual(["Perso"]);
  });

  it("un dossier plié cache tous ses sous-dossiers, à toute profondeur, et rien d'autre", () => {
    expect(visibleFolders(FOLDERS, [])).toEqual(FOLDERS);
    expect(visibleFolders(FOLDERS, ["Travail"])).toEqual(["Perso", "Travail", "Travaux"]);
    expect(visibleFolders(FOLDERS, ["Travail/Réunions"])).toEqual([
      "Perso",
      "Travail",
      "Travail/Réunions",
      "Travaux",
    ]);
  });

  it("montrer un dossier déplie ceux qui le contiennent, pas lui-même", () => {
    const folded = ["Perso", "Travail", "Travail/Réunions", "Travail/Réunions/2026"];
    expect(parentsUnfolded(folded, "Travail/Réunions/2026")).toEqual([
      "Perso",
      "Travail/Réunions/2026",
    ]);
    expect(parentsUnfolded(["Trav"], "Travail/Réunions")).toEqual(["Trav"]);
    expect(parentsUnfolded(["Travail"], "")).toEqual(["Travail"]);
  });

  it("un dossier montré est toujours visible", () => {
    fc.assert(
      fc.property(fc.subarray(FOLDERS), fc.constantFrom(...FOLDERS), (folded, shown) =>
        visibleFolders(FOLDERS, parentsUnfolded(folded, shown)).includes(shown),
      ),
    );
  });

  it("les dossiers pliés suivent un dossier renommé ou déplacé", () => {
    expect(
      foldedMoved(["Perso", "Travail", "Travail/Réunions"], "Travail", "Archives/Travail"),
    ).toEqual(["Perso", "Archives/Travail", "Archives/Travail/Réunions"]);
  });
});

describe("dossiers pliés gardés", () => {
  it("chaque bibliothèque garde les siens", () => {
    const { storage, items } = memoryStorage();
    expect(loadFolded(storage, "/notes")).toEqual([]);
    saveFolded(storage, "/notes", ["Travail", "Perso"]);
    saveFolded(storage, "/autres", ["Archives"]);
    expect(loadFolded(storage, "/notes")).toEqual(["Travail", "Perso"]);
    expect(loadFolded(storage, "/autres")).toEqual(["Archives"]);
    expect(items.get("malorean.folded:/notes")).toBe('["Travail","Perso"]');
  });

  it("aucun dossier plié efface ce qui était gardé", () => {
    const { storage, items } = memoryStorage();
    saveFolded(storage, "/notes", ["Travail"]);
    saveFolded(storage, "/notes", []);
    expect(items.size).toBe(0);
  });

  it("une valeur illisible vaut aucun dossier plié", () => {
    const { storage, items } = memoryStorage();
    for (const stored of ["{", '"Travail"', "{}", "[1]", '["a", null]', "null"]) {
      items.set("malorean.folded:/notes", stored);
      expect(loadFolded(storage, "/notes")).toEqual([]);
    }
  });

  it("un stockage refusé ne garde rien et ne bloque rien", () => {
    const { storage } = memoryStorage(true);
    expect(() => saveFolded(storage, "/notes", ["Travail"])).not.toThrow();
    expect(() => saveFolded(storage, "/notes", [])).not.toThrow();
    expect(loadFolded(storage, "/notes")).toEqual([]);
  });
});
