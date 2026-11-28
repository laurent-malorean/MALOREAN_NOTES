import { describe, expect, it } from "vitest";
import { eventItem, plainEvent } from "../../test-support/agenda-12-fixture";
import {
  agenda12Folder,
  closedDay,
  COLUMN_CHOICES,
  countryText,
  eventSummary,
  isAgenda12Content,
  isAgenda12EventContent,
  matchingCountries,
  monthName,
  touchesAgenda12,
  wholeNumber,
} from "./agenda-12";

const COUNTRIES = [
  { code: "DE", name: "Allemagne", flag: "🇩🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮" },
];

describe("agenda 12 : les types de notes", () => {
  it("reconnaît un agenda 12 et un événement à leur en-tête", () => {
    expect(isAgenda12Content("---\ntype: agenda-12\n---\n# Salons")).toBe(true);
    expect(isAgenda12Content("---\ntype: agenda-12-evenement\n---\n# X")).toBe(false);
    expect(isAgenda12Content("# Salons")).toBe(false);
    expect(isAgenda12EventContent("---\ntype: 'agenda-12-evenement'\n---\n# X")).toBe(true);
    expect(isAgenda12EventContent("---\ntype: agenda-12\n---\n# X")).toBe(false);
  });

  it("les colonnes possibles sont 3, 4 et 6", () => {
    expect(COLUMN_CHOICES).toEqual([3, 4, 6]);
  });
});

describe("agenda 12 : le dossier des événements", () => {
  it("porte le nom du fichier sans .md", () => {
    expect(agenda12Folder("pro/salons.md")).toBe("pro/salons/");
    expect(agenda12Folder("salons.MD")).toBe("salons/");
  });

  it("un fichier annoncé touche l'agenda s'il est lui-même, ou dans son dossier", () => {
    expect(touchesAgenda12("pro/salons.md", ["pro/salons.md"])).toBe(true);
    expect(touchesAgenda12("pro/salons.md", ["pro/salons/a.md"])).toBe(true);
    expect(touchesAgenda12("pro/salons.md", ["pro/salons/archives/a.md"])).toBe(true);
    expect(touchesAgenda12("pro/salons.md", ["pro/salons-2/a.md", "autre.md"])).toBe(false);
    expect(touchesAgenda12("pro/salons.md", [])).toBe(false);
  });
});

describe("agenda 12 : les textes", () => {
  it("écrit le mois avec sa majuscule", () => {
    expect(monthName(1)).toBe("Janvier");
    expect(monthName(2)).toBe("Février");
    expect(monthName(12)).toBe("Décembre");
  });

  it("lit un champ de nombre : vide, chiffres, ou autre chose", () => {
    expect(wholeNumber("")).toBeNull();
    expect(wholeNumber("  ")).toBeNull();
    expect(wholeNumber("12")).toBe(12);
    expect(wholeNumber(" 2027 ")).toBe(2027);
    expect(wholeNumber("12a")).toBeUndefined();
    expect(wholeNumber("-3")).toBeUndefined();
    expect(wholeNumber("1.5")).toBeUndefined();
  });

  it("montre le pays par son drapeau et son nom", () => {
    expect(countryText(COUNTRIES[0] as (typeof COUNTRIES)[number])).toBe("🇩🇪 Allemagne");
  });

  it("écrit le jour de clôture en jour, mois, année", () => {
    expect(closedDay("2026-11-27")).toBe("27/11/2026");
  });
});

describe("agenda 12 : chercher un pays en tapant", () => {
  it("rend tous les pays sans saisie", () => {
    expect(matchingCountries(COUNTRIES, "")).toEqual(COUNTRIES);
    expect(matchingCountries(COUNTRIES, "  ")).toEqual(COUNTRIES);
  });

  it("cherche dans le nom, sans compter les accents ni les majuscules", () => {
    expect(matchingCountries(COUNTRIES, "ALLE")).toEqual([COUNTRIES[0]]);
    expect(matchingCountries(COUNTRIES, "cote")).toEqual([COUNTRIES[2]]);
    expect(matchingCountries(COUNTRIES, "r")).toEqual([COUNTRIES[1], COUNTRIES[2]]);
  });

  it("trouve un pays par son code exact, pas par un bout", () => {
    expect(matchingCountries(COUNTRIES, "fr")).toEqual([COUNTRIES[1]]);
    expect(matchingCountries(COUNTRIES, "ci")).toEqual([COUNTRIES[2]]);
    expect(matchingCountries(COUNTRIES, "zz")).toEqual([]);
  });
});

describe("agenda 12 : le résumé d'un événement", () => {
  const dated = (overrides: Parameters<typeof eventItem>[0]) =>
    eventItem({ country: null, city: null, ...overrides });

  it("dit l'intervalle, l'année, la ville et le pays", () => {
    const event = eventItem({
      ...{ month: 10, day: 5, year: 2026, end: { day: 11, month: 10 }, city: "Lisbonne" },
      country: { code: "PT", name: "Portugal", flag: "🇵🇹" },
    });
    expect(eventSummary(event)).toBe("5 – 11 octobre 2026 · Lisbonne, Portugal");
  });

  it("un jour seul, sans fin : « 5 octobre 2026 » ; le premier du mois est « 1er »", () => {
    expect(eventSummary(dated({ month: 10, day: 5, year: 2026, end: null }))).toBe(
      "5 octobre 2026",
    );
    expect(eventSummary(dated({ month: 3, day: 1, year: 2026, end: null }))).toBe("1er mars 2026");
  });

  it("une fin sur un autre mois nomme les deux mois, l'année une seule fois", () => {
    expect(eventSummary(dated({ month: 1, day: 30, year: 2027, end: { day: 2, month: 2 } }))).toBe(
      "30 janvier – 2 février 2027",
    );
    expect(eventSummary(dated({ month: 1, day: 30, year: 2027, end: { day: 1, month: 2 } }))).toBe(
      "30 janvier – 1er février 2027",
    );
  });

  it("sans année, pas d'année ; sans jour, le mois (et l'année) seuls", () => {
    expect(eventSummary(dated({ month: 2, day: 10, year: null, end: { day: 13, month: 2 } }))).toBe(
      "10 – 13 février",
    );
    expect(eventSummary(dated({ month: 2, day: null, year: 2029, end: null }))).toBe(
      "février 2029",
    );
    expect(eventSummary(dated({ month: 8, day: null, year: null, end: null }))).toBe("août");
  });

  it("la ville seule, le pays seul, ou rien : chaque partie absente disparaît avec son séparateur", () => {
    const base = { month: 5, day: null, year: null, end: null } as const;
    expect(eventSummary(eventItem({ ...base, city: "Lyon", country: null }))).toBe("mai · Lyon");
    expect(eventSummary(eventItem({ ...base, city: null }))).toBe("mai · Allemagne");
    expect(eventSummary(plainEvent("a.md", "A", 5))).toBe("mai");
  });
});
