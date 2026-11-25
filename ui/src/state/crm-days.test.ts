import { describe, expect, it } from "vitest";
import { addDays, dayOfMonth, shortDay, weekAround, weekdayName, weekTitle } from "./crm-days";

describe("jours du CRM", () => {
  it("nomme les sept jours de la semaine, lundi d'abord", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(weekdayName)).toEqual([
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
      "Dimanche",
    ]);
    expect(weekdayName(7)).toBe("");
  });

  it("lit le jour du mois", () => {
    expect(dayOfMonth("2026-11-24")).toBe(24);
    expect(dayOfMonth("2026-12-01")).toBe(1);
  });

  it("écrit un jour court, avec l'année seulement si ce n'est pas celle d'aujourd'hui", () => {
    expect(shortDay("2026-11-24", "2026-11-25")).toBe("24 nov.");
    expect(shortDay("2025-12-31", "2026-11-25")).toBe("31 déc. 2025");
    expect(shortDay("2026-01-05", "2026-11-25")).toBe("5 janv.");
  });

  it("abrège chaque mois comme le français", () => {
    const months = Array.from({ length: 12 }, (_, month) =>
      shortDay(`2026-${String(month + 1).padStart(2, "0")}-15`, "2026-06-01").slice(3),
    );
    expect(months).toEqual([
      ...["janv.", "févr.", "mars", "avr.", "mai", "juin"],
      ...["juil.", "août", "sept.", "oct.", "nov.", "déc."],
    ]);
  });

  it("ajoute des jours en passant les mois, les années et février", () => {
    expect(addDays("2026-11-23", 7)).toBe("2026-11-30");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-03-30", 0)).toBe("2026-03-30");
  });

  it("titre la semaine par ses deux bouts", () => {
    expect(weekTitle("2026-11-23", "2026-11-29", "2026-11-25")).toBe(
      "Semaine du 23 nov. au 29 nov.",
    );
    expect(weekTitle("2026-12-28", "2027-01-03", "2026-11-25")).toBe(
      "Semaine du 28 déc. au 3 janv. 2027",
    );
  });

  it("passe à la semaine précédente ou suivante", () => {
    expect(weekAround("2026-11-23", -1)).toBe("2026-11-16");
    expect(weekAround("2026-11-23", 1)).toBe("2026-11-30");
  });
});
