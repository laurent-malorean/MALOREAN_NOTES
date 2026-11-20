import { describe, expect, it } from "vitest";
import {
  activeColumn,
  activeNote,
  type Column,
  type Columns,
  columnActivated,
  columnSplit,
  columnsResized,
  columnsStarted,
  MAX_COLUMNS,
  MIN_COLUMN_WIDTH,
  noteClosed,
  noteOpened,
  notePlaced,
  noteShown,
  notesMoved,
  notesRemoved,
  noteTitled,
  shownNote,
  tabActivated,
  tabClosed,
  tabPlaced,
} from "./columns";

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

const widths = (columns: Columns) => columns.list.map((column) => column.width);
/** Les largeurs, aux arrondis du calcul près. */
function expectWidths(columns: Columns, expected: readonly number[]) {
  expect(widths(columns)).toHaveLength(expected.length);
  expected.forEach((width, index) => expect(widths(columns)[index]).toBeCloseTo(width, 9));
}
const shown = (columns: Columns) => columns.list.map(shownNote);
const notesOf = (column: Column | undefined) => column?.tabs.map((t) => t.note);
const column = (columns: Columns, index: number) => columns.list[index] as Column;

describe("colonnes", () => {
  it("au lancement, une seule colonne, active, toute la largeur et sans onglet", () => {
    expect(columnsStarted.list).toEqual([{ id: 0, tabs: [], activeTab: null, width: 1 }]);
    expect(activeColumn(columnsStarted).id).toBe(0);
    expect(activeNote(columnsStarted)).toBeNull();
  });

  it("une colonne montre la note de son onglet actif", () => {
    expect(shown(three)).toEqual(["a.md", "b.md", null]);
    expect(activeNote(three)).toBe("b.md");
  });

  it("la colonne où l'on clique devient active ; un identifiant inconnu ne change rien", () => {
    expect(activeNote(columnActivated(three, 0))).toBe("a.md");
    expect(columnActivated(three, 4)).toBe(three);
  });

  it(`diviser ouvre à droite une colonne sur la note active, dans un onglet à elle, qui devient active`, () => {
    const two: Columns = { ...three, list: three.list.slice(0, 2) };
    const next = columnSplit(columnActivated(two, 0));
    expect(next.list.map((c) => c.id)).toEqual([0, 6, 3]);
    expect(column(next, 1)).toEqual({
      id: 6,
      tabs: [tab(7, "a.md", "A")],
      activeTab: 7,
      width: 0.25,
    });
    expect(column(next, 0).width).toBe(0.25);
    expect(next.active).toBe(6);
    expect(next.nextId).toBe(8);
  });

  it("diviser copie l'onglet actif de la colonne, pas un autre", () => {
    const two: Columns = { ...three, list: three.list.slice(0, 2) };
    const next = columnSplit(tabActivated(two, 2));
    expect(column(next, 1).tabs).toEqual([tab(7, "c.md")]);
  });

  it("diviser une colonne sans onglet ouvre une colonne sans onglet", () => {
    const next = columnSplit(columnsStarted);
    expect(next.list).toEqual([
      { id: 0, tabs: [], activeTab: null, width: 0.5 },
      { id: 1, tabs: [], activeTab: null, width: 0.5 },
    ]);
    expect(next.active).toBe(1);
  });

  it(`pas plus de ${MAX_COLUMNS} colonnes`, () => {
    expect(columnSplit(three)).toBe(three);
  });

  it("glisser un séparateur donne à une voisine ce que perd l'autre", () => {
    expectWidths(columnsResized(three, 0, 0.1), [0.6, 0.2, 0.2]);
    expectWidths(columnsResized(three, 1, -0.05), [0.5, 0.25, 0.25]);
    expect(columnsResized(three, 0, 0.1).active).toBe(3);
  });

  it("une colonne ne descend pas sous la largeur minimale", () => {
    expectWidths(columnsResized(three, 0, 1), [0.8 - MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH, 0.2]);
    expectWidths(columnsResized(three, 0, -1), [MIN_COLUMN_WIDTH, 0.8 - MIN_COLUMN_WIDTH, 0.2]);
  });

  it("un séparateur qui n'existe pas ne change rien", () => {
    expect(columnsResized(three, 2, 0.1)).toBe(three);
    expect(columnsResized(three, -1, 0.1)).toBe(three);
  });
});

describe("onglets", () => {
  it("seul l'onglet actif change de note", () => {
    const next = noteShown(columnActivated(three, 0), "d.md");
    expect(column(next, 0).tabs).toMatchObject([tab(1, "d.md"), tab(2, "c.md")]);
  });

  it("l'onglet actif de la colonne active montre la note choisie à la place de la sienne, sans titre encore", () => {
    const next = noteShown(three, "d.md");
    expect(column(next, 1).tabs).toMatchObject([tab(4, "d.md")]);
    expect(column(next, 0)).toBe(column(three, 0));
    expect(next.nextId).toBe(6);
  });

  it("sans note à montrer, rien ne change", () => {
    expect(noteShown(three, null)).toBe(three);
  });

  it("une note déjà ouverte dans la colonne active y retrouve son onglet", () => {
    const next = noteShown(columnActivated(three, 0), "c.md");
    expect(column(next, 0).tabs).toEqual(column(three, 0).tabs);
    expect(activeNote(next)).toBe("c.md");
  });

  it("une colonne sans onglet en ouvre un pour montrer la note", () => {
    const next = noteShown(columnActivated(three, 5), "d.md");
    expect(column(next, 2)).toEqual({ id: 5, tabs: [tab(6, "d.md")], activeTab: 6, width: 0.2 });
    expect(next.nextId).toBe(7);
  });

  it("cliquer un onglet le rend actif, et sa colonne aussi ; un onglet inconnu ne change rien", () => {
    const next = tabActivated(three, 2);
    expect(next.active).toBe(0);
    expect(activeNote(next)).toBe("c.md");
    expect(column(next, 1)).toBe(column(three, 1));
    expect(column(next, 2)).toBe(column(three, 2));
    expect(tabActivated(three, 9)).toBe(three);
  });

  it("fermer l'onglet actif rend actif son voisin de droite, sinon de gauche", () => {
    const row: Columns = {
      list: [
        { id: 0, tabs: [tab(1, "x.md"), tab(2, "y.md"), tab(3, "z.md")], activeTab: 2, width: 1 },
      ],
      active: 0,
      nextId: 4,
    };
    expect(column(tabClosed(row, 2), 0).activeTab).toBe(3);
    expect(column(tabClosed(row, 1), 0).activeTab).toBe(2);
    const wide: Columns = {
      ...row,
      list: [{ ...column(row, 0), tabs: [tab(0, "w.md"), ...column(row, 0).tabs] }],
    };
    expect(column(tabClosed(wide, 2), 0).activeTab).toBe(3);
    expect(column(tabClosed(tabActivated(row, 3), 3), 0).activeTab).toBe(2);
    expect(column(tabClosed(three, 1), 0).activeTab).toBe(2);
    const right = tabClosed(tabActivated(three, 2), 2);
    expect(column(right, 0)).toEqual({ ...column(three, 0), tabs: [tab(1, "a.md", "A")] });
  });

  it("fermer un autre onglet garde l'onglet actif", () => {
    const next = tabClosed(three, 2);
    expect(column(next, 0).activeTab).toBe(1);
    expect(notesOf(column(next, 0))).toEqual(["a.md"]);
  });

  it("fermer le dernier onglet d'une colonne la ferme : ses deux voisines se partagent sa largeur", () => {
    const next = tabClosed(three, 4);
    expect(next.list.map((c) => c.id)).toEqual([0, 5]);
    expectWidths(next, [0.65, 0.35]);
    expect(next.nextId).toBe(three.nextId);
  });

  it("la colonne fermée, si elle était active, laisse la place à sa voisine de droite, sinon de gauche", () => {
    expect(tabClosed(three, 4).active).toBe(5);
    const two: Columns = { ...three, list: three.list.slice(0, 2) };
    const left = tabClosed(two, 4);
    expect(left.active).toBe(0);
    expectWidths(left, [0.8]);
    const first = tabClosed(tabClosed(columnActivated(three, 0), 1), 2);
    expect(first.list.map((c) => c.id)).toEqual([3, 5]);
    expect(first.active).toBe(3);
    expectWidths(first, [0.8, 0.2]);
  });

  it("une colonne déjà vide ne se ferme pas quand on ferme le dernier onglet d'une autre", () => {
    const reversed: Columns = { ...three, list: [...three.list].reverse() };
    const next = tabClosed(reversed, 4);
    expect(next.list.map((c) => c.id)).toEqual([5, 0]);
  });

  it("la colonne fermée sans être active laisse la colonne active telle quelle", () => {
    const next = tabClosed(columnActivated(three, 0), 4);
    expect(next.active).toBe(0);
    expect(column(next, 0)).toEqual({ ...column(three, 0), width: 0.65 });
  });

  it("la dernière colonne reste, vide, quand on ferme son dernier onglet", () => {
    const alone: Columns = {
      list: [{ id: 0, tabs: [tab(1, "a.md")], activeTab: 1, width: 1 }],
      active: 0,
      nextId: 2,
    };
    expect(tabClosed(alone, 1)).toEqual({
      list: [{ id: 0, tabs: [], activeTab: null, width: 1 }],
      active: 0,
      nextId: 2,
    });
  });

  it("fermer un onglet qui n'existe pas ne change rien", () => {
    expect(column(tabClosed(three, 9), 0)).toBe(column(three, 0));
  });

  it("les notes renommées ou déplacées sont suivies dans tous leurs onglets", () => {
    const next = notesMoved(three, (path) => `Travail/${path}`);
    expect(next.list.map(notesOf)).toEqual([
      ["Travail/a.md", "Travail/c.md"],
      ["Travail/b.md"],
      [],
    ]);
    expect(column(next, 0).tabs[0]?.title).toBe("A");
  });

  it("le titre lu ou enregistré d'une note va à tous ses onglets", () => {
    const both = noteShown(columnActivated(three, 5), "a.md");
    const next = noteTitled(both, "a.md", "Alpha");
    expect(column(next, 0).tabs).toEqual([tab(1, "a.md", "Alpha"), tab(2, "c.md")]);
    expect(column(next, 2).tabs).toEqual([tab(6, "a.md", "Alpha")]);
  });

  it("une note mise à la corbeille ferme tous ses onglets", () => {
    const both = noteShown(columnActivated(three, 5), "a.md");
    const next = notesRemoved(both, (path) => path === "a.md");
    expect(next.list.map(notesOf)).toEqual([["c.md"], ["b.md"], []]);
    expect(shown(next)).toEqual(["c.md", "b.md", null]);
  });

  it("ouvrir une note ajoute un onglet dans la colonne active, juste après l'onglet actif, et l'active", () => {
    const next = noteOpened(tabActivated(three, 1), "d.md");
    expect(column(next, 0).tabs).toEqual([tab(1, "a.md", "A"), tab(6, "d.md"), tab(2, "c.md")]);
    expect(column(next, 0).activeTab).toBe(6);
    expect(next.active).toBe(0);
    expect(next.nextId).toBe(7);
    expect(column(next, 1)).toBe(column(three, 1));
    const last = noteOpened(tabActivated(three, 2), "d.md");
    expect(notesOf(column(last, 0))).toEqual(["a.md", "c.md", "d.md"]);
  });

  it("ouvrir une note dans une colonne sans onglet lui en donne un", () => {
    const next = noteOpened(columnActivated(three, 5), "d.md");
    expect(column(next, 2)).toEqual({ id: 5, tabs: [tab(6, "d.md")], activeTab: 6, width: 0.2 });
  });

  it("ouvrir une note déjà ouverte dans la colonne active retrouve son onglet ; ailleurs, elle en a un de plus", () => {
    const again = noteOpened(columnActivated(three, 0), "c.md");
    expect(column(again, 0).tabs).toEqual(column(three, 0).tabs);
    expect(activeNote(again)).toBe("c.md");
    const elsewhere = noteOpened(three, "a.md");
    expect(notesOf(column(elsewhere, 1))).toEqual(["b.md", "a.md"]);
  });

  it("ouvrir dans un nouvel onglet ajoute un onglet après l'onglet actif, même si la note est déjà ouverte", () => {
    const next = notePlaced(columnActivated(three, 0), "c.md", "newTab");
    expect(column(next, 0).tabs).toEqual([tab(1, "a.md", "A"), tab(6, "c.md"), tab(2, "c.md")]);
    expect(column(next, 0).activeTab).toBe(6);
    expect(next.nextId).toBe(7);
  });

  it("un nouvel onglet ou une nouvelle colonne prend le titre de la note, si un autre onglet le connaît", () => {
    expect(column(notePlaced(three, "a.md", "newTab"), 1).tabs[1]).toEqual(tab(6, "a.md", "A"));
    expect(column(notePlaced(three, "c.md", "newTab"), 1).tabs[1]).toEqual(tab(6, "c.md"));
    const untitledFirst: Columns = {
      ...three,
      list: [{ id: 7, tabs: [tab(8, "a.md")], activeTab: 8, width: 0.1 }, ...three.list],
    };
    expect(column(notePlaced(untitledFirst, "a.md", "newTab"), 2).tabs[1]?.title).toBe("A");
    const alone: Columns = { list: [{ ...column(three, 0), width: 1 }], active: 0, nextId: 6 };
    expect(column(notePlaced(alone, "a.md", "right"), 1).tabs).toEqual([tab(7, "a.md", "A")]);
  });

  it("ouvrir à droite ou à gauche ouvre la note dans la colonne voisine, qui devient active", () => {
    const right = notePlaced(three, "a.md", "right");
    expect(right.active).toBe(5);
    expect(column(right, 2).tabs).toEqual([tab(6, "a.md", "A")]);
    const left = notePlaced(three, "a.md", "left");
    expect(left.active).toBe(0);
    expect(column(left, 0).activeTab).toBe(1);
    expect(left.list.map(notesOf)).toEqual(three.list.map(notesOf));
    const added = notePlaced(three, "d.md", "left");
    expect(notesOf(column(added, 0))).toEqual(["a.md", "d.md", "c.md"]);
  });

  it("sans voisine de ce côté, une colonne s'ouvre, avec la moitié de la largeur de la colonne active", () => {
    const alone: Columns = {
      list: [{ id: 0, tabs: [tab(1, "a.md")], activeTab: 1, width: 1 }],
      active: 0,
      nextId: 2,
    };
    const left = notePlaced(alone, "b.md", "left");
    expect(left).toEqual({
      list: [
        { id: 2, tabs: [tab(3, "b.md")], activeTab: 3, width: 0.5 },
        { id: 0, tabs: [tab(1, "a.md")], activeTab: 1, width: 0.5 },
      ],
      active: 2,
      nextId: 4,
    });
    const right = notePlaced(alone, "b.md", "right");
    expect(right.list.map((c) => c.id)).toEqual([0, 2]);
    expect(right.active).toBe(2);
    expect(notesOf(column(right, 1))).toEqual(["b.md"]);
  });

  it(`à ${MAX_COLUMNS} colonnes, sans voisine de ce côté, la note s'ouvre dans un nouvel onglet de la colonne active`, () => {
    const next = notePlaced(columnActivated(three, 5), "b.md", "right");
    expect(next.list).toHaveLength(MAX_COLUMNS);
    expect(column(next, 2)).toEqual({ id: 5, tabs: [tab(6, "b.md")], activeTab: 6, width: 0.2 });
    const left = notePlaced(columnActivated(three, 0), "b.md", "left");
    expect(notesOf(column(left, 0))).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("le menu d'un onglet ouvre sa note à partir de la colonne de l'onglet ; un onglet inconnu ne change rien", () => {
    const next = tabPlaced(three, 2, "right");
    expect(next.active).toBe(3);
    expect(notesOf(column(next, 1))).toEqual(["b.md", "c.md"]);
    expect(column(next, 0)).toBe(column(three, 0));
    expect(tabPlaced(three, 9, "right")).toBe(three);
  });

  it("fermer une note ferme son onglet dans la colonne active, et là seulement", () => {
    const both = noteOpened(three, "a.md");
    const next = noteClosed(both, "a.md");
    expect(next.list.map(notesOf)).toEqual([["a.md", "c.md"], ["b.md"], []]);
    expect(noteClosed(three, "a.md")).toBe(three);
  });
});
