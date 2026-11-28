import { describe, expect, it } from "vitest";
import {
  dayEnabled,
  dayMark,
  endOffset,
  MAX_OFFSET,
  MONTH_ABBREVIATIONS,
  monthWeeks,
  stepYear,
  viewMonth,
  viewYear,
  WEEKDAYS,
} from "./agenda-12-calendar";

const event = (
  day: number | null,
  month: number,
  year: number | null,
  end: [number, number] | null,
) => ({ day, month, year, end: end === null ? null : { day: end[0], month: end[1] } });

describe("les mois et les jours de la semaine", () => {
  it("12 abréviations, de « janv. » à « déc. »", () => {
    expect(MONTH_ABBREVIATIONS).toHaveLength(12);
    expect(MONTH_ABBREVIATIONS[0]).toBe("janv.");
    expect(MONTH_ABBREVIATIONS[1]).toBe("févr.");
    expect(MONTH_ABBREVIATIONS[2]).toBe("mars");
    expect(MONTH_ABBREVIATIONS[11]).toBe("déc.");
  });

  it("la semaine commence le lundi : l m m j v s d", () => {
    expect(WEEKDAYS.map((d) => d.initial).join("")).toBe("lmmjvsd");
    expect(WEEKDAYS[0]?.name).toBe("lundi");
    expect(WEEKDAYS[6]?.name).toBe("dimanche");
  });
});

describe("les semaines d'un mois", () => {
  it("octobre 2027 commence un vendredi : quatre cases vides avant le 1er", () => {
    const weeks = monthWeeks(2027, 10);
    expect(weeks[0]).toEqual([null, null, null, null, 1, 2, 3]);
    expect(weeks[1]).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(weeks.at(-1)).toEqual([25, 26, 27, 28, 29, 30, 31]);
    expect(weeks).toHaveLength(5);
  });

  it("chaque ligne a sept cases, six lignes au plus, tous les jours une fois", () => {
    for (let year = 2024; year <= 2030; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const weeks = monthWeeks(year, month);
        expect(weeks.length).toBeLessThanOrEqual(6);
        for (const week of weeks) expect(week).toHaveLength(7);
        const days = weeks.flat().filter((d): d is number => d !== null);
        expect(days[0]).toBe(1);
        expect(days.at(-1)).toBe(new Date(year, month, 0).getDate());
        expect(days).toEqual([...days].sort((a, b) => a - b));
      }
    }
  });

  it("un mois qui commence un lundi n'a aucune case vide au début, et février 2027 tient sur quatre lignes", () => {
    expect(monthWeeks(2027, 2)[0]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(monthWeeks(2027, 2)).toHaveLength(4);
    expect(monthWeeks(2027, 2).flat()).not.toContain(29);
  });

  it("un mois qui commence un dimanche et fait 31 jours tient sur six lignes", () => {
    expect(monthWeeks(2026, 3)).toHaveLength(6);
    expect(monthWeeks(2026, 3)[0]).toEqual([null, null, null, null, null, null, 1]);
  });

  it("février a un 29 dans une année bissextile, et sans année (année bissextile de référence)", () => {
    expect(monthWeeks(2028, 2).flat()).toContain(29);
    expect(monthWeeks(null, 2).flat()).toContain(29);
    expect(monthWeeks(null, 2).flat()).not.toContain(30);
    expect(monthWeeks(1900, 2).flat()).not.toContain(29);
  });

  it("les années à un ou deux chiffres ne sont pas prises pour 19xx", () => {
    const weeks = monthWeeks(1, 1);
    expect(weeks.flat()).toContain(31);
    for (const week of weeks) expect(week).toHaveLength(7);
    // Le 1er janvier de l'an 1 (calendrier grégorien) est un lundi, celui de 1901 un mardi.
    expect(weeks[0]?.[0]).toBe(1);
    expect(monthWeeks(1901, 1)[0]?.[1]).toBe(1);
  });
});

describe("les mois montrés à partir du mois de début", () => {
  it("le mois montré avance depuis le mois de début, de décembre à janvier", () => {
    expect(viewMonth(9, 0)).toBe(9);
    expect(viewMonth(9, 1)).toBe(10);
    expect(viewMonth(12, 1)).toBe(1);
    expect(viewMonth(9, MAX_OFFSET)).toBe(8);
    expect(MAX_OFFSET).toBe(11);
  });

  it("l'année du mois montré passe à la suivante après décembre ; sans année, aucune", () => {
    expect(viewYear(2027, 9, 0)).toBe(2027);
    expect(viewYear(2027, 9, 3)).toBe(2027);
    expect(viewYear(2027, 9, 4)).toBe(2028);
    expect(viewYear(2027, 12, 1)).toBe(2028);
    expect(viewYear(null, 9, 5)).toBeNull();
  });

  it("l'écart de la fin avec le début : même mois 0, mois suivant 1, mois antérieur l'année suivante", () => {
    expect(endOffset(event(5, 10, 2026, [11, 10]))).toBe(0);
    expect(endOffset(event(30, 1, 2027, [2, 2]))).toBe(1);
    expect(endOffset(event(13, 9, 2026, [23, 6]))).toBe(9);
    expect(endOffset(event(30, 12, 2026, [2, 1]))).toBe(1);
    expect(endOffset(event(5, 10, 2026, null))).toBeNull();
  });
});

describe("l'année : les flèches", () => {
  it("avance et recule d'une année ; sans année, la flèche part de l'année en cours", () => {
    expect(stepYear(2027, 2026, 1)).toBe(2028);
    expect(stepYear(2027, 2026, -1)).toBe(2026);
    expect(stepYear(null, 2026, 1)).toBe(2026);
    expect(stepYear(null, 2026, -1)).toBe(2026);
  });

  it("reste entre 1 et 9999", () => {
    expect(stepYear(9999, 2026, 1)).toBe(9999);
    expect(stepYear(1, 2026, -1)).toBe(1);
  });
});

describe("la plage surlignée", () => {
  it("un jour seul : son jour est le début, rien d'autre n'est marqué", () => {
    const e = event(13, 9, 2027, null);
    expect(dayMark(e, 0, 13)).toBe("start");
    expect(dayMark(e, 0, 14)).toBe("plain");
    expect(dayMark(e, 0, 12)).toBe("plain");
    expect(dayMark(e, 1, 13)).toBe("plain");
  });

  it("une fin dans le même mois : début, jours entre, fin", () => {
    const e = event(5, 10, 2026, [11, 10]);
    expect(dayMark(e, 0, 5)).toBe("start");
    expect(dayMark(e, 0, 6)).toBe("between");
    expect(dayMark(e, 0, 10)).toBe("between");
    expect(dayMark(e, 0, 11)).toBe("end");
    expect(dayMark(e, 0, 12)).toBe("plain");
    expect(dayMark(e, 0, 4)).toBe("plain");
  });

  it("une fin le mois suivant : la fin du mois de début, le début du mois suivant", () => {
    const e = event(30, 1, 2027, [2, 2]);
    expect(dayMark(e, 0, 30)).toBe("start");
    expect(dayMark(e, 0, 31)).toBe("between");
    expect(dayMark(e, 0, 29)).toBe("plain");
    expect(dayMark(e, 1, 1)).toBe("between");
    expect(dayMark(e, 1, 2)).toBe("end");
    expect(dayMark(e, 1, 3)).toBe("plain");
  });

  it("une fin plus loin : tous les jours des mois entre sont entre", () => {
    const e = event(13, 9, 2026, [23, 11]);
    expect(dayMark(e, 1, 1)).toBe("between");
    expect(dayMark(e, 1, 31)).toBe("between");
    expect(dayMark(e, 2, 22)).toBe("between");
    expect(dayMark(e, 2, 23)).toBe("end");
    expect(dayMark(e, 2, 24)).toBe("plain");
  });

  it("sans jour de début, aucun jour n'est marqué", () => {
    expect(dayMark(event(null, 9, 2027, null), 0, 13)).toBe("plain");
  });

  it("les jours d'un mois suivant ne se choisissent que si le début a un jour", () => {
    expect(dayEnabled(event(13, 9, 2027, null), 0)).toBe(true);
    expect(dayEnabled(event(13, 9, 2027, null), 1)).toBe(true);
    expect(dayEnabled(event(null, 9, 2027, null), 0)).toBe(true);
    expect(dayEnabled(event(null, 9, 2027, null), 1)).toBe(false);
  });
});
