import { describe, expect, it } from "vitest";
import {
  agenda12Folder,
  closedDay,
  COLUMN_CHOICES,
  countryText,
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
