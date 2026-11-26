import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  firstOfMonth,
  formatDate,
  longDate,
  monthGrid,
  monthLabel,
  movedBy,
  parseDate,
} from "./date-picker";

describe("sélecteur de date : lire et écrire une date", () => {
  it("lit les dates écrites à la française, avec ou sans zéro, et celles de Rust", () => {
    expect(parseDate("25/11/2026")).toBe("2026-11-25");
    expect(parseDate(" 5/1/2027 ")).toBe("2027-01-05");
    expect(parseDate("05.01.2027")).toBe("2027-01-05");
    expect(parseDate("05-01-2027")).toBe("2027-01-05");
    expect(parseDate("2026-11-25")).toBe("2026-11-25");
  });

  it("refuse ce qui n'est pas une date du calendrier", () => {
    for (const text of [
      "",
      "demain",
      "31/02/2026",
      "29/02/2027",
      "00/10/2026",
      "10/13/2026",
      "2026-02-30",
      "1/1/26",
    ])
      expect(parseDate(text), text).toBeNull();
    expect(parseDate("29/02/2028")).toBe("2028-02-29");
  });

  it("écrit « JJ/MM/AAAA », et rien sans date", () => {
    expect(formatDate("2026-11-05")).toBe("05/11/2026");
    expect(formatDate("")).toBe("");
  });

  it("dit un jour en toutes lettres, le premier du mois en « 1er »", () => {
    expect(longDate("2026-11-25")).toBe("mercredi 25 novembre 2026");
    expect(longDate("2026-11-01")).toBe("dimanche 1er novembre 2026");
    expect(longDate("2026-11-23")).toBe("lundi 23 novembre 2026");
  });

  it("dit le mois en lettres", () => {
    expect(monthLabel("2026-11-25")).toBe("novembre 2026");
    expect(monthLabel("2027-01-01")).toBe("janvier 2027");
    expect(monthLabel("2027-12-31")).toBe("décembre 2027");
  });
});

describe("sélecteur de date : se déplacer", () => {
  it("ajoute des jours à travers les mois et les années", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2026-11-25", 7)).toBe("2026-12-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("ajoute des mois et ramène le jour au dernier du mois", () => {
    expect(addMonths("2026-11-25", 1)).toBe("2026-12-25");
    expect(addMonths("2026-12-25", 1)).toBe("2027-01-25");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("garde le premier jour du mois", () => {
    expect(firstOfMonth("2026-11-25")).toBe("2026-11-01");
  });

  it("traduit les flèches et les pages en déplacements, et ignore les autres touches", () => {
    expect(movedBy("2026-11-25", "ArrowLeft")).toBe("2026-11-24");
    expect(movedBy("2026-11-25", "ArrowRight")).toBe("2026-11-26");
    expect(movedBy("2026-11-25", "ArrowUp")).toBe("2026-11-18");
    expect(movedBy("2026-11-25", "ArrowDown")).toBe("2026-12-02");
    expect(movedBy("2026-11-25", "PageUp")).toBe("2026-10-25");
    expect(movedBy("2026-11-25", "PageDown")).toBe("2026-12-25");
    expect(movedBy("2026-11-25", "a")).toBeNull();
  });
});

describe("sélecteur de date : la grille d'un mois", () => {
  it("compte 42 jours, commence un lundi et finit un dimanche", () => {
    const grid = monthGrid("2026-11-25");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ iso: "2026-10-26", day: 26, inMonth: false });
    expect(grid[6]).toEqual({ iso: "2026-11-01", day: 1, inMonth: true });
    expect(grid[35]).toEqual({ iso: "2026-11-30", day: 30, inMonth: true });
    expect(grid[41]).toEqual({ iso: "2026-12-06", day: 6, inMonth: false });
  });

  it("commence au 1er quand il tombe un lundi", () => {
    const grid = monthGrid("2026-06-10");
    expect(grid[0]).toEqual({ iso: "2026-06-01", day: 1, inMonth: true });
    expect(grid.filter((d) => d.inMonth)).toHaveLength(30);
  });

  it("repère les jours du mois montré", () => {
    expect(monthGrid("2027-02-10").filter((d) => d.inMonth)).toHaveLength(28);
  });
});
