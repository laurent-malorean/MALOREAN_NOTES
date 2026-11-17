import { describe, expect, it } from "vitest";
import { frenchLongDate } from "./today";

describe("date du jour en toutes lettres", () => {
  it("écrit le jour, le mois en lettres et l'année", () => {
    expect(frenchLongDate(new Date(2026, 10, 16))).toBe("16 novembre 2026");
  });

  it("écrit chaque mois en français", () => {
    const months = Array.from({ length: 12 }, (_, m) => frenchLongDate(new Date(2027, m, 15)));
    expect(months).toEqual([
      "15 janvier 2027",
      "15 février 2027",
      "15 mars 2027",
      "15 avril 2027",
      "15 mai 2027",
      "15 juin 2027",
      "15 juillet 2027",
      "15 août 2027",
      "15 septembre 2027",
      "15 octobre 2027",
      "15 novembre 2027",
      "15 décembre 2027",
    ]);
  });

  it("écrit « 1er » pour le premier du mois", () => {
    expect(frenchLongDate(new Date(2027, 2, 1))).toBe("1er mars 2027");
    expect(frenchLongDate(new Date(2027, 2, 2))).toBe("2 mars 2027");
  });
});
