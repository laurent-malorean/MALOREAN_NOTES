import { describe, expect, it } from "vitest";
import { renumbered, type Row } from "./renumber";

const item = (indent: number, listId = 1, ordered = true, start = 1): Row => ({
  ordered,
  indent,
  listId,
  start,
});
const other: Row = { ordered: false, indent: 0, listId: null, start: 0 };
const ALL = new Set([1, 2]);

describe("numéros des éléments d'une liste numérotée", () => {
  it("refait les numéros dans l'ordre, à partir du numéro de départ de la liste", () => {
    expect(renumbered([item(0), item(0), item(0)], ALL)).toEqual([1, 2, 3]);
    expect(renumbered([item(0, 1, true, 5), item(0, 1, true, 5)], ALL)).toEqual([5, 6]);
  });

  it("numérote à part les sous-éléments numérotés de chaque élément", () => {
    const rows = [item(0), item(3), item(3), item(0), item(3)];
    expect(renumbered(rows, ALL)).toEqual([1, 1, 2, 2, 1]);
  });

  it("un sous-élément à puce ne casse pas la suite des éléments numérotés", () => {
    const rows = [item(0), item(3, 1, false), item(0)];
    expect(renumbered(rows, ALL)).toEqual([1, null, 2]);
  });

  it("une puce au même niveau interrompt la numérotation", () => {
    const rows = [item(0), item(0, 1, false), item(0)];
    expect(renumbered(rows, ALL)).toEqual([1, null, 1]);
  });

  it("un autre bloc, ou une autre liste, recommence la numérotation", () => {
    expect(renumbered([item(0), other, item(0)], ALL)).toEqual([1, null, 1]);
    expect(renumbered([item(0, 1), item(0, 2)], ALL)).toEqual([1, 1]);
  });

  it("ne touche que les listes concernées", () => {
    const rows = [item(0, 1, true, 1), item(0, 1, true, 1), item(0, 2, true, 1)];
    expect(renumbered(rows, new Set([2]))).toEqual([null, null, 1]);
  });
});
