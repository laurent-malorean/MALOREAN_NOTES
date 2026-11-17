import { describe, expect, it } from "vitest";
import { type Column, type Columns, MAX_COLUMNS, tabDropped } from "./columns";

const tab = (id: number, note: string, title: string | null = null) => ({ id, note, title });

/**
 * Trois colonnes : à gauche `a.md` et `c.md` (actif : `a.md`), au milieu `b.md` (colonne active),
 * à droite aucun onglet.
 */
const three: Columns = {
  list: [
    { id: 0, tabs: [tab(1, "a.md", "A"), tab(2, "c.md")], activeTab: 1, width: 0.5 },
    { id: 3, tabs: [tab(4, "b.md")], activeTab: 4, width: 0.3 },
    { id: 5, tabs: [], activeTab: null, width: 0.2 },
  ],
  active: 3,
  nextId: 6,
};

/** Deux colonnes : à gauche `a.md` et `c.md` (actif : `a.md`), à droite `b.md` (colonne active). */
const two: Columns = {
  list: [
    { id: 0, tabs: [tab(1, "a.md", "A"), tab(2, "c.md")], activeTab: 1, width: 0.6 },
    { id: 3, tabs: [tab(4, "b.md")], activeTab: 4, width: 0.4 },
  ],
  active: 3,
  nextId: 6,
};

const column = (columns: Columns, index: number) => columns.list[index] as Column;
const ids = (columns: Columns) => columns.list.map((c) => c.id);
const tabIds = (columns: Columns) => columns.list.map((c) => c.tabs.map((t) => t.id));
function expectWidths(columns: Columns, expected: readonly number[]) {
  expect(columns.list).toHaveLength(expected.length);
  expected.forEach((width, index) => expect(column(columns, index).width).toBeCloseTo(width, 9));
}

describe("glisser un onglet dans une colonne", () => {
  it("l'onglet passe à la fin de la colonne, y devient actif, et elle devient la colonne active", () => {
    const next = tabDropped(columnsWithActive(three, 0), 2, { column: 3, before: null });
    expect(next.list).toEqual([
      { id: 0, tabs: [tab(1, "a.md", "A")], activeTab: 1, width: 0.5 },
      { id: 3, tabs: [tab(4, "b.md"), tab(2, "c.md")], activeTab: 2, width: 0.3 },
      three.list[2],
    ]);
    expect(next.active).toBe(3);
    expect(next.nextId).toBe(6);
  });

  it("lâché sur un onglet, il se place juste avant lui", () => {
    const next = tabDropped(three, 2, { column: 3, before: 4 });
    expect(tabIds(next)).toEqual([[1], [2, 4], []]);
    expect(tabIds(tabDropped(three, 4, { column: 0, before: 2 }))).toEqual([[1, 4, 2], []]);
  });

  it("l'onglet actif qui part laisse la place à son voisin ; une colonne vide le reçoit", () => {
    const next = tabDropped(three, 1, { column: 5, before: null });
    expect(column(next, 0).activeTab).toBe(2);
    expect(column(next, 2)).toEqual({
      id: 5,
      tabs: [tab(1, "a.md", "A")],
      activeTab: 1,
      width: 0.2,
    });
    expect(next.active).toBe(5);
  });

  it("la colonne qui perd son dernier onglet se ferme, ses voisines se partagent sa largeur", () => {
    const next = tabDropped(three, 4, { column: 0, before: null });
    expect(ids(next)).toEqual([0, 5]);
    expectWidths(next, [0.65, 0.35]);
    expect(tabIds(next)).toEqual([[1, 2, 4], []]);
    expect(column(next, 0).activeTab).toBe(4);
    expect(next.active).toBe(0);
  });

  it("dans sa propre colonne, l'onglet change de place", () => {
    const next = tabDropped(three, 2, { column: 0, before: 1 });
    expect(tabIds(next)).toEqual([[2, 1], [4], []]);
    expect(column(next, 0).activeTab).toBe(2);
    expect(next.active).toBe(0);
    expect(tabIds(tabDropped(three, 1, { column: 0, before: null }))).toEqual([[2, 1], [4], []]);
  });

  it("le seul onglet d'une colonne lâché dans sa colonne, ou sur lui-même, ne change rien", () => {
    expect(tabDropped(three, 4, { column: 3, before: null })).toBe(three);
    expect(tabDropped(three, 2, { column: 0, before: 2 })).toBe(three);
  });

  it("un onglet ou une colonne inconnus ne changent rien", () => {
    expect(tabDropped(three, 9, { column: 3, before: null })).toBe(three);
    expect(tabDropped(three, 2, { column: 9, before: null })).toBe(three);
    expect(tabDropped(three, 2, { column: 9, side: "left" })).toBe(three);
  });
});

describe("glisser un onglet au bord d'une colonne", () => {
  it("une colonne s'ouvre de ce côté pour lui, avec la moitié de la largeur de sa voisine", () => {
    const right = tabDropped(two, 2, { column: 0, side: "right" });
    expect(right).toEqual({
      list: [
        { id: 0, tabs: [tab(1, "a.md", "A")], activeTab: 1, width: 0.3 },
        { id: 6, tabs: [tab(7, "c.md")], activeTab: 7, width: 0.3 },
        two.list[1],
      ],
      active: 6,
      nextId: 8,
    });
    const left = tabDropped(two, 1, { column: 3, side: "left" });
    expect(ids(left)).toEqual([0, 6, 3]);
    expect(column(left, 1).tabs).toEqual([tab(7, "a.md", "A")]);
    expect(column(left, 0).activeTab).toBe(2);
    expectWidths(left, [0.6, 0.2, 0.2]);
  });

  it("la colonne qu'il quitte se ferme si elle n'a plus d'onglet", () => {
    const next = tabDropped(two, 4, { column: 0, side: "left" });
    expect(ids(next)).toEqual([6, 0]);
    expectWidths(next, [0.5, 0.5]);
    expect(tabIds(next)).toEqual([[7], [1, 2]]);
    expect(next.active).toBe(6);
  });

  it("le seul onglet d'une colonne lâché à son propre bord ne change rien", () => {
    expect(tabDropped(two, 4, { column: 3, side: "right" })).toBe(two);
  });

  it(`pas plus de ${MAX_COLUMNS} colonnes, sauf si celle qu'il quitte se ferme`, () => {
    expect(tabDropped(three, 2, { column: 3, side: "right" })).toBe(three);
    const next = tabDropped(three, 4, { column: 0, side: "left" });
    expect(ids(next)).toEqual([6, 0, 5]);
    expectWidths(next, [0.325, 0.325, 0.35]);
    expect(column(next, 0).tabs).toEqual([tab(7, "b.md")]);
  });
});

function columnsWithActive(columns: Columns, active: number): Columns {
  return { ...columns, active };
}
