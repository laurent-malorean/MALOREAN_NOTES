import { describe, expect, it } from "vitest";
import { indexBarView, indexStatusLines } from "./index-status";

describe("état de l'index de mots", () => {
  it("dit le nombre de notes indexées et la dernière reconstruction", () => {
    expect(
      indexStatusLines({ notes: 1234, total: 2000, rebuilt: "23 novembre 2026 à 14:30" }),
    ).toEqual(["1\u202f234 notes indexées", "Dernière reconstruction : 23 novembre 2026 à 14:30"]);
  });

  it("met au singulier, et dit qu'aucune reconstruction n'a eu lieu depuis le lancement", () => {
    expect(indexStatusLines({ notes: 1, total: 1, rebuilt: null })).toEqual([
      "1 note indexée",
      "Dernière reconstruction : aucune depuis le lancement",
    ]);
    expect(indexStatusLines({ notes: 0, total: 0, rebuilt: null })[0]).toBe("0 note indexée");
  });
});

describe("barre de l'index des notes", () => {
  const at = (notes: number, total: number) => indexBarView({ notes, total, rebuilt: null });

  it("dit où en est l'index : les notes faites sur le total, et le pourcentage", () => {
    expect(at(631, 645)).toEqual({ percent: 97, written: "631 sur 645, 97 %" });
    expect(at(1, 4)).toEqual({ percent: 25, written: "1 sur 4, 25 %" });
  });

  it("sépare les milliers à la française", () => {
    expect(at(1234, 2000)).toEqual({ percent: 61, written: "1\u202f234 sur 2\u202f000, 61 %" });
  });

  it("est vide à 0 et pleine à 100, jamais pleine avant la dernière note", () => {
    expect(at(0, 645)).toEqual({ percent: 0, written: "0 sur 645, 0 %" });
    expect(at(645, 645)).toEqual({ percent: 100, written: "645 sur 645, 100 %" });
    expect(at(644, 645)?.percent).toBe(99);
  });

  it("ne dépasse pas 100 si l'index garde une note de plus que le total", () => {
    expect(at(650, 645)).toEqual({ percent: 100, written: "650 sur 645, 100 %" });
  });

  it("n'est pas montrée quand le total est inconnu ou nul : pas de faux chiffre", () => {
    expect(at(0, 0)).toBeNull();
    expect(at(12, 0)).toBeNull();
  });
});
