import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  endBeforeStart,
  endDayAvailable,
  endWraps,
  mustBringEndBack,
  startDayAvailable,
  YEAR_SPAN,
  yearChoices,
} from "./agenda-12-when";

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("la liste des années", () => {
  it("propose l'année en cours et les dix suivantes : onze années", () => {
    expect(YEAR_SPAN).toBe(10);
    expect(yearChoices(2026, null)).toEqual(range(2026, 2036));
    expect(yearChoices(2026, null)).toHaveLength(11);
  });

  it("garde une année choisie dans la plage, sans doublon", () => {
    expect(yearChoices(2026, 2030)).toEqual(range(2026, 2036));
    expect(yearChoices(2026, 2026)).toEqual(range(2026, 2036));
    expect(yearChoices(2026, 2036)).toEqual(range(2026, 2036));
  });

  it("ajoute l'année passée avant la plage et l'année lointaine après", () => {
    expect(yearChoices(2026, 2019)).toEqual([2019, ...range(2026, 2036)]);
    expect(yearChoices(2026, 2025)).toEqual([2025, ...range(2026, 2036)]);
    expect(yearChoices(2026, 2037)).toEqual([...range(2026, 2036), 2037]);
    expect(yearChoices(2026, 2080)).toEqual([...range(2026, 2036), 2080]);
  });
});

describe("le nombre de jours d'un mois", () => {
  it("donne 31, 30 et 28 ou 29 selon le mois", () => {
    const lengths = range(1, 12).map((month) => daysInMonth(month, 2027));
    expect(lengths).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });

  it("février a 29 jours sans année et dans une année bissextile seulement", () => {
    expect(daysInMonth(2, null)).toBe(29);
    expect(daysInMonth(2, 2028)).toBe(29);
    expect(daysInMonth(2, 2027)).toBe(28);
    expect(daysInMonth(2, 1900)).toBe(28);
    expect(daysInMonth(2, 2000)).toBe(29);
  });
});

describe("les jours de début possibles", () => {
  it("pas de 31 avril ni de 30 février, 29 février selon l'année", () => {
    expect(startDayAvailable(30, 4, null)).toBe(true);
    expect(startDayAvailable(31, 4, null)).toBe(false);
    expect(startDayAvailable(31, 1, 2027)).toBe(true);
    expect(startDayAvailable(30, 2, null)).toBe(false);
    expect(startDayAvailable(29, 2, null)).toBe(true);
    expect(startDayAvailable(29, 2, 2028)).toBe(true);
    expect(startDayAvailable(29, 2, 2027)).toBe(false);
    expect(startDayAvailable(1, 2, 2027)).toBe(true);
  });
});

describe("les jours de fin possibles", () => {
  const start = (day: number | null, month: number, year: number | null) => ({
    day,
    month,
    year,
  });

  it("le même mois, aucun jour avant le jour de début ; le jour de début reste permis", () => {
    expect(endDayAvailable(9, start(10, 2, 2027), 2)).toBe(false);
    expect(endDayAvailable(10, start(10, 2, 2027), 2)).toBe(true);
    expect(endDayAvailable(11, start(10, 2, 2027), 2)).toBe(true);
    expect(endDayAvailable(1, start(2, 6, null), 6)).toBe(false);
  });

  it("un autre mois, aucun jour n'est grisé par le début", () => {
    expect(endDayAvailable(1, start(30, 1, 2027), 2)).toBe(true);
    expect(endDayAvailable(1, start(30, 12, 2026), 1)).toBe(true);
  });

  it("sans jour de début, rien à comparer", () => {
    expect(endDayAvailable(1, start(null, 2, 2027), 2)).toBe(true);
  });

  it("les jours qui n'existent pas dans le mois de fin sont grisés", () => {
    expect(endDayAvailable(31, start(10, 1, 2027), 2)).toBe(false);
    expect(endDayAvailable(30, start(10, 3, null), 4)).toBe(true);
    expect(endDayAvailable(31, start(10, 3, null), 4)).toBe(false);
  });

  it("la fin d'un début de décembre qui passe en février tombe l'année suivante pour le 29 février", () => {
    expect(endDayAvailable(29, start(30, 12, 2027), 2)).toBe(true);
    expect(endDayAvailable(29, start(30, 12, 2026), 2)).toBe(false);
    expect(endDayAvailable(29, start(30, 12, null), 2)).toBe(true);
    expect(endDayAvailable(29, start(10, 1, 2027), 2)).toBe(false);
    expect(endDayAvailable(29, start(10, 1, 2028), 2)).toBe(true);
  });
});

describe("une fin qui passe avant le début", () => {
  it("n'existe que dans le même mois, avec un jour de fin plus petit", () => {
    const base = { month: 2, year: 2027 };
    expect(endBeforeStart({ ...base, day: 10, end: { day: 5, month: 2 } })).toBe(true);
    expect(endBeforeStart({ ...base, day: 10, end: { day: 10, month: 2 } })).toBe(false);
    expect(endBeforeStart({ ...base, day: 10, end: { day: 13, month: 2 } })).toBe(false);
    expect(endBeforeStart({ ...base, day: 10, end: { day: 5, month: 3 } })).toBe(false);
    expect(endBeforeStart({ ...base, day: 10, end: { day: 5, month: 1 } })).toBe(false);
    expect(endBeforeStart({ ...base, day: null, end: { day: 5, month: 2 } })).toBe(false);
    expect(endBeforeStart({ ...base, day: 10, end: null })).toBe(false);
  });

  it("une fin dans un mois antérieur tombe l'année suivante", () => {
    expect(endWraps({ month: 9, end: { day: 23, month: 6 } })).toBe(true);
    expect(endWraps({ month: 12, end: { day: 2, month: 1 } })).toBe(true);
    expect(endWraps({ month: 9, end: { day: 23, month: 9 } })).toBe(false);
    expect(endWraps({ month: 9, end: { day: 23, month: 10 } })).toBe(false);
    expect(endWraps({ month: 9, end: null })).toBe(false);
  });
});

describe("changer le début : la fin doit-elle être ramenée au début ?", () => {
  const event = (
    day: number | null,
    month: number,
    year: number | null,
    end: [number, number],
  ) => ({
    day,
    month,
    year,
    end: { day: end[0], month: end[1] },
  });

  it("le jour de début dépasse le jour de fin du même mois", () => {
    const e = event(10, 2, 2027, [13, 2]);
    expect(mustBringEndBack(e, { kind: "day", day: 14 })).toBe(true);
    expect(mustBringEndBack(e, { kind: "day", day: 13 })).toBe(false);
    expect(mustBringEndBack(e, { kind: "day", day: 12 })).toBe(false);
    expect(mustBringEndBack(e, { kind: "day", day: 1 })).toBe(false);
  });

  it("sans fin, ou en effaçant le jour, rien à ramener (le moteur parle)", () => {
    expect(
      mustBringEndBack({ ...event(10, 2, 2027, [13, 2]), end: null }, { kind: "day", day: 20 }),
    ).toBe(false);
    expect(mustBringEndBack(event(10, 2, 2027, [13, 2]), { kind: "day", day: null })).toBe(false);
  });

  it("un jour de début qui n'existe pas n'efface pas la fin : le moteur refuse seul le geste", () => {
    expect(mustBringEndBack(event(31, 3, 2027, [31, 3]), { kind: "month", month: 4 })).toBe(false);
    expect(mustBringEndBack(event(31, 3, 2027, [31, 3]), { kind: "year", year: 2027 })).toBe(false);
  });

  it("une fin qui suit le mois du début le suit : rien à ramener tant que le jour tient", () => {
    const e = event(10, 6, 2027, [20, 6]);
    expect(mustBringEndBack(e, { kind: "month", month: 8 })).toBe(false);
  });

  it("le mois de début rejoint le mois de fin avec un jour de fin plus petit", () => {
    const e = event(20, 6, 2027, [10, 8]);
    expect(mustBringEndBack(e, { kind: "month", month: 8 })).toBe(true);
    expect(mustBringEndBack(event(5, 6, 2027, [10, 8]), { kind: "month", month: 8 })).toBe(false);
  });

  it("le mois de début dépasse le mois de fin : la fin passerait à l'année suivante, sans l'avoir voulu", () => {
    const e = event(10, 6, 2027, [20, 8]);
    expect(mustBringEndBack(e, { kind: "month", month: 9 })).toBe(true);
    expect(mustBringEndBack(e, { kind: "month", month: 7 })).toBe(false);
    expect(mustBringEndBack(e, { kind: "month", month: 8 })).toBe(false);
  });

  it("une fin qui tombait déjà l'année suivante y reste tant qu'elle est valide", () => {
    const e = event(30, 12, 2026, [2, 1]);
    expect(mustBringEndBack(e, { kind: "day", day: 15 })).toBe(false);
    expect(mustBringEndBack(e, { kind: "month", month: 11 })).toBe(false);
    expect(mustBringEndBack(event(13, 9, 2026, [23, 6]), { kind: "month", month: 10 })).toBe(false);
    expect(mustBringEndBack(event(13, 9, 2026, [23, 6]), { kind: "month", month: 6 })).toBe(false);
    expect(mustBringEndBack(event(25, 9, 2026, [23, 6]), { kind: "month", month: 6 })).toBe(true);
  });

  it("le changement d'année qui retire le 29 février de la fin ramène la fin", () => {
    const e = event(30, 12, 2027, [29, 2]);
    expect(mustBringEndBack(e, { kind: "year", year: 2026 })).toBe(true);
    expect(mustBringEndBack(e, { kind: "year", year: 2027 })).toBe(false);
    expect(mustBringEndBack(e, { kind: "year", year: null })).toBe(false);
    expect(mustBringEndBack(event(10, 1, 2028, [29, 2]), { kind: "year", year: 2027 })).toBe(true);
    expect(mustBringEndBack(event(10, 1, 2028, [29, 2]), { kind: "year", year: 2032 })).toBe(false);
  });
});
