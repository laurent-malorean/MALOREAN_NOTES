import { describe, expect, it } from "vitest";
import { indexStatusLines } from "./index-status";

describe("état de l'index de mots", () => {
  it("dit le nombre de notes indexées et la dernière reconstruction", () => {
    expect(indexStatusLines({ notes: 1234, rebuilt: "23 novembre 2026 à 14:30" })).toEqual([
      "1\u202f234 notes indexées",
      "Dernière reconstruction : 23 novembre 2026 à 14:30",
    ]);
  });

  it("met au singulier, et dit qu'aucune reconstruction n'a eu lieu depuis le lancement", () => {
    expect(indexStatusLines({ notes: 1, rebuilt: null })).toEqual([
      "1 note indexée",
      "Dernière reconstruction : aucune depuis le lancement",
    ]);
    expect(indexStatusLines({ notes: 0, rebuilt: null })[0]).toBe("0 note indexée");
  });
});
