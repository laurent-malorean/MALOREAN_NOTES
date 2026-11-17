import { describe, expect, it } from "vitest";
import {
  activeColumn,
  activeNote,
  type Columns,
  columnActivated,
  columnSplit,
  columnsResized,
  columnsStarted,
  MAX_COLUMNS,
  MIN_COLUMN_WIDTH,
  noteShown,
  notesMoved,
  notesRemoved,
} from "./columns";

/** Trois colonnes : `a.md` à gauche, `b.md` au milieu (active), rien à droite. */
const three: Columns = {
  list: [
    { id: 0, note: "a.md", width: 0.5 },
    { id: 3, note: "b.md", width: 0.3 },
    { id: 5, note: null, width: 0.2 },
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
const notes = (columns: Columns) => columns.list.map((column) => column.note);

describe("colonnes", () => {
  it("au lancement, une seule colonne, active, toute la largeur et sans note", () => {
    expect(columnsStarted.list).toEqual([{ id: 0, note: null, width: 1 }]);
    expect(activeColumn(columnsStarted).id).toBe(0);
    expect(activeNote(columnsStarted)).toBeNull();
  });

  it("la colonne active montre la note ouverte, les autres gardent la leur", () => {
    const next = noteShown(three, "c.md");
    expect(notes(next)).toEqual(["a.md", "c.md", null]);
    expect(activeNote(next)).toBe("c.md");
    expect(notes(noteShown(three, null))).toEqual(["a.md", null, null]);
  });

  it("la colonne où l'on clique devient active ; un identifiant inconnu ne change rien", () => {
    expect(activeNote(columnActivated(three, 0))).toBe("a.md");
    expect(columnActivated(three, 4)).toBe(three);
  });

  it("diviser ouvre à droite de la colonne active une colonne sur la même note, qui devient active", () => {
    const next = columnSplit(noteShown(columnsStarted, "a.md"));
    expect(next.list).toEqual([
      { id: 0, note: "a.md", width: 0.5 },
      { id: 1, note: "a.md", width: 0.5 },
    ]);
    expect(next.active).toBe(1);
    expect(next.nextId).toBe(2);
  });

  it("diviser une colonne du milieu insère la nouvelle juste après elle", () => {
    const two: Columns = {
      list: [
        { id: 0, note: "a.md", width: 0.6 },
        { id: 1, note: "b.md", width: 0.4 },
      ],
      active: 0,
      nextId: 2,
    };
    const next = columnSplit(two);
    expect(next.list.map((column) => column.id)).toEqual([0, 2, 1]);
    expect(widths(next)).toEqual([0.3, 0.3, 0.4]);
    expect(notes(next)).toEqual(["a.md", "a.md", "b.md"]);
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

  it("les notes renommées ou déplacées sont suivies dans toutes les colonnes", () => {
    const next = notesMoved(three, (path) => `Travail/${path}`);
    expect(notes(next)).toEqual(["Travail/a.md", "Travail/b.md", null]);
  });

  it("seules les colonnes qui montrent une note sont concernées par la corbeille", () => {
    const asked: string[] = [];
    notesRemoved(three, (path) => (asked.push(path), false));
    expect(asked).toEqual(["a.md", "b.md"]);
  });

  it("une note mise à la corbeille quitte les colonnes qui la montraient", () => {
    const both = noteShown(columnActivated(three, 5), "a.md");
    expect(notes(notesRemoved(both, (path) => path === "a.md"))).toEqual([null, "b.md", null]);
  });
});
