import { describe, expect, it } from "vitest";
import {
  clearEnd,
  DAY_AND_END_REMOVED,
  DAY_REMOVED,
  END_BROUGHT_BACK,
  pickDay,
  pickStart,
  wholeMonth,
} from "./agenda-12-date-pick";

const event = (
  day: number | null,
  month: number,
  year: number | null,
  end: [number, number] | null,
) => ({ day, month, year, end: end === null ? null : { day: end[0], month: end[1] } });
const END_NULL = { kind: "end", end: null } as const;

describe("le calendrier : un premier clic fixe le début, un second la fin", () => {
  it("un jour sur un événement sans jour fixe le début et attend la fin", () => {
    const pick = pickDay(event(null, 9, 2027, null), 0, false, 13);
    expect(pick).toEqual({ changes: [{ kind: "day", day: 13 }], awaitingEnd: true, close: false });
  });

  it("un jour après le début, en attendant la fin, fixe la fin dans le mois et ferme", () => {
    const pick = pickDay(event(13, 9, 2027, null), 0, true, 23);
    expect(pick).toEqual({
      changes: [{ kind: "end", end: { day: 23, month: 9 } }],
      awaitingEnd: false,
      close: true,
    });
  });

  it("le même jour deux fois fait un seul jour : rien n'est écrit, la fenêtre ferme", () => {
    expect(pickDay(event(13, 9, 2027, null), 0, true, 13)).toEqual({
      changes: [],
      awaitingEnd: false,
      close: true,
    });
  });

  it("un jour avant le début, en attendant la fin, recommence la plage", () => {
    const pick = pickDay(event(13, 9, 2027, null), 0, true, 5);
    expect(pick).toEqual({ changes: [{ kind: "day", day: 5 }], awaitingEnd: true, close: false });
  });

  it("recommencer une plage qui a une fin efface la fin d'abord", () => {
    const pick = pickDay(event(13, 9, 2027, [23, 9]), 0, false, 5);
    expect(pick.changes).toEqual([END_NULL, { kind: "day", day: 5 }]);
    expect(pick.awaitingEnd).toBe(true);
    expect(pick.close).toBe(false);
  });

  it("un clic sur le jour de début d'une plage terminée la recommence aussi", () => {
    const pick = pickDay(event(13, 9, 2027, [23, 9]), 0, false, 13);
    expect(pick.changes).toEqual([END_NULL, { kind: "day", day: 13 }]);
    expect(pickDay(event(13, 9, 2027, null), 0, false, 13).changes).toEqual([]);
  });

  it("un jour du mois suivant fixe la fin avec son mois (pas d'année de fin) et ferme", () => {
    const pick = pickDay(event(30, 1, 2027, null), 1, true, 2);
    expect(pick).toEqual({
      changes: [{ kind: "end", end: { day: 2, month: 2 } }],
      awaitingEnd: false,
      close: true,
    });
  });

  it("un jour d'un mois suivant, de décembre à janvier, porte le mois de janvier", () => {
    const pick = pickDay(event(30, 12, 2026, null), 1, true, 2);
    expect(pick.changes).toEqual([{ kind: "end", end: { day: 2, month: 1 } }]);
  });

  it("un jour d'un mois suivant remplace une fin déjà écrite, sans attendre", () => {
    const pick = pickDay(event(13, 9, 2027, [23, 9]), 2, false, 4);
    expect(pick.changes).toEqual([{ kind: "end", end: { day: 4, month: 11 } }]);
    expect(pick.close).toBe(true);
  });
});

describe("la grille des mois et l'année : le début change", () => {
  it("le même mois, ou la même année, ne fait rien", () => {
    expect(pickStart(event(13, 9, 2027, null), { kind: "month", month: 9 }).changes).toEqual([]);
    expect(pickStart(event(13, 9, 2027, null), { kind: "year", year: 2027 }).changes).toEqual([]);
    expect(pickStart(event(13, 9, null, null), { kind: "year", year: null }).changes).toEqual([]);
  });

  it("un mois où le jour existe : un seul geste", () => {
    expect(pickStart(event(13, 9, 2027, null), { kind: "month", month: 10 })).toEqual({
      changes: [{ kind: "month", month: 10 }],
    });
  });

  it("un mois où le jour n'existe pas : le jour est retiré avant, avec un message", () => {
    const pick = pickStart(event(31, 1, 2027, null), { kind: "month", month: 4 });
    expect(pick.changes).toEqual([
      { kind: "day", day: null },
      { kind: "month", month: 4 },
    ]);
    expect(pick.notice).toBe(DAY_REMOVED);
  });

  it("avec une fin, le jour et la fin sont retirés, avec leur message", () => {
    const pick = pickStart(event(31, 1, 2027, [2, 2]), { kind: "month", month: 4 });
    expect(pick.changes).toEqual([
      END_NULL,
      { kind: "day", day: null },
      { kind: "month", month: 4 },
    ]);
    expect(pick.notice).toBe(DAY_AND_END_REMOVED);
  });

  it("le 29 février d'une année qui n'est plus bissextile retire le jour ; sans année, il reste", () => {
    const pick = pickStart(event(29, 2, 2028, null), { kind: "year", year: 2027 });
    expect(pick.changes).toEqual([
      { kind: "day", day: null },
      { kind: "year", year: 2027 },
    ]);
    expect(pick.notice).toBe(DAY_REMOVED);
    expect(pickStart(event(29, 2, 2028, null), { kind: "year", year: null }).changes).toEqual([
      { kind: "year", year: null },
    ]);
  });

  it("un début qui dépasse la fin la ramène au début, avec son message", () => {
    const pick = pickStart(event(10, 2, 2027, [2, 3]), { kind: "month", month: 4 });
    expect(pick.changes).toEqual([END_NULL, { kind: "month", month: 4 }]);
    expect(pick.notice).toBe(END_BROUGHT_BACK);
  });

  it("une fin du mois du début le suit sans rien dire", () => {
    const pick = pickStart(event(10, 2, 2027, [13, 2]), { kind: "month", month: 5 });
    expect(pick).toEqual({ changes: [{ kind: "month", month: 5 }] });
  });

  it("un événement sans jour change de mois sans autre geste", () => {
    expect(pickStart(event(null, 2, null, null), { kind: "month", month: 7 }).changes).toEqual([
      { kind: "month", month: 7 },
    ]);
  });
});

describe("« Mois entier » et « Effacer la fin »", () => {
  it("« Mois entier » efface la fin puis le jour ; sans fin ni jour, rien", () => {
    expect(wholeMonth(event(13, 9, 2027, [23, 9])).changes).toEqual([
      END_NULL,
      { kind: "day", day: null },
    ]);
    expect(wholeMonth(event(13, 9, 2027, null)).changes).toEqual([{ kind: "day", day: null }]);
    expect(wholeMonth(event(null, 9, 2027, null)).changes).toEqual([]);
  });

  it("« Effacer la fin » n'écrit que s'il y a une fin", () => {
    expect(clearEnd(event(13, 9, 2027, [23, 9])).changes).toEqual([END_NULL]);
    expect(clearEnd(event(13, 9, 2027, null)).changes).toEqual([]);
  });
});
