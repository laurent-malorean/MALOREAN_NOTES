import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type Columns,
  columnsResized,
  columnsStarted,
  columnSplit,
  noteOpened,
  notePlaced,
  notesRemoved,
  tabActivated,
  tabClosed,
} from "./columns";
import type { PreferenceStorage } from "./focus-preference";
import { layoutRestored, loadLayout, savedLayout, saveLayout } from "./saved-layout";

const workspace = (...paths: string[]) =>
  paths.map((path) => ({ path, title: path.toUpperCase() }));
const ALL = workspace("a.md", "b.md", "c.md", "d.md");

/** Ce que l'on voit des colonnes, sans les identifiants : notes, onglet actif, largeur, colonne active. */
function shape(columns: Columns) {
  return {
    active: columns.list.findIndex((column) => column.id === columns.active),
    list: columns.list.map((column) => ({
      notes: column.tabs.map((tab) => tab.note),
      active: column.tabs.findIndex((tab) => tab.id === column.activeTab),
      width: Math.round(column.width * 1e9) / 1e9,
    })),
  };
}

/** Colonnes de gauche à droite : chacune donne ses notes, son onglet actif et sa largeur. */
function stored(columns: readonly [number, readonly string[], number | null][], active = 0) {
  return JSON.stringify({
    version: 1,
    active,
    columns: columns.map(([width, tabs, activeTab]) => ({ width, tabs, activeTab })),
  });
}

/** Deux colonnes : a et b (actif b) à gauche, c à droite, qui est active. */
const two = (() => {
  const left = noteOpened(noteOpened(columnsStarted, "a.md"), "b.md");
  return noteOpened(notePlaced(left, "c.md", "right"), "c.md");
})();

describe("disposition gardée", () => {
  it("se retrouve telle quelle : colonnes, largeurs, onglets dans l'ordre, onglets actifs, colonne active", () => {
    const resized = columnsResized(two, 0, 0.2);
    const restored = layoutRestored(savedLayout(resized), ALL) as Columns;
    expect(shape(restored)).toEqual(shape(resized));
    expect(shape(restored)).toEqual({
      active: 1,
      list: [
        { notes: ["a.md", "b.md"], active: 1, width: 0.7 },
        { notes: ["c.md"], active: 0, width: 0.3 },
      ],
    });
  });

  it("donne à chaque colonne et onglet un identifiant à lui, et le titre de la note dans l'espace de travail", () => {
    const restored = layoutRestored(stored([[1, ["a.md", "b.md"], 0]]), ALL) as Columns;
    expect(restored).toEqual({
      list: [
        {
          id: 0,
          tabs: [
            { id: 1, note: "a.md", title: "A.MD" },
            { id: 2, note: "b.md", title: "B.MD" },
          ],
          activeTab: 1,
          width: 1,
        },
      ],
      active: 0,
      nextId: 3,
    });
  });

  it("des largeurs qui ne font pas 1 sont remises en parts de la zone d'édition", () => {
    const restored = layoutRestored(
      stored([
        [3, ["a.md"], 0],
        [1, ["b.md"], 0],
      ]),
      ALL,
    ) as Columns;
    expect(restored.list.map((column) => column.width)).toEqual([0.75, 0.25]);
  });

  it("une note disparue est oubliée ; si elle était active, sa voisine de droite, sinon de gauche, le devient", () => {
    const notes = workspace("a.md", "c.md");
    const right = layoutRestored(stored([[1, ["a.md", "b.md", "c.md"], 1]]), notes) as Columns;
    expect(shape(right).list).toEqual([{ notes: ["a.md", "c.md"], active: 1, width: 1 }]);
    const left = layoutRestored(stored([[1, ["a.md", "b.md"], 1]]), notes) as Columns;
    expect(shape(left).list).toEqual([{ notes: ["a.md"], active: 0, width: 1 }]);
  });

  it("une colonne restée sans onglet se ferme : ses voisines prennent sa largeur et, active, la voisine de droite le devient", () => {
    const layout = stored(
      [
        [0.25, ["a.md"], 0],
        [0.5, ["gone.md"], 0],
        [0.25, ["c.md"], 0],
      ],
      1,
    );
    expect(shape(layoutRestored(layout, ALL) as Columns)).toEqual({
      active: 1,
      list: [
        { notes: ["a.md"], active: 0, width: 0.5 },
        { notes: ["c.md"], active: 0, width: 0.5 },
      ],
    });
  });

  it("une colonne gardée sans onglet se ferme aussi", () => {
    const layout = stored(
      [
        [0.5, [], null],
        [0.5, ["a.md"], 0],
      ],
      0,
    );
    expect(shape(layoutRestored(layout, ALL) as Columns)).toEqual({
      active: 0,
      list: [{ notes: ["a.md"], active: 0, width: 1 }],
    });
  });

  it("des colonnes dont l'une n'a plus d'onglet se retrouvent sans elle", () => {
    const emptied = notesRemoved(two, (note) => note === "c.md");
    expect(emptied.list[1]?.tabs).toEqual([]);
    expect(shape(layoutRestored(savedLayout(emptied), ALL) as Columns)).toEqual({
      active: 0,
      list: [{ notes: ["a.md", "b.md"], active: 1, width: 1 }],
    });
  });

  it("s'il ne reste aucune note, il n'y a rien à retrouver", () => {
    const layout = stored([
      [0.5, ["gone.md"], 0],
      [0.5, [], null],
    ]);
    expect(layoutRestored(layout, ALL)).toBeNull();
    expect(layoutRestored(stored([[1, [], null]]), ALL)).toBeNull();
  });

  it("rien de gardé, une valeur abîmée ou d'une autre version : rien à retrouver", () => {
    const column = { width: 1, tabs: ["a.md"], activeTab: 0 };
    const layout = (change: Record<string, unknown>) =>
      JSON.stringify({ version: 1, active: 0, columns: [column], ...change });
    expect(layoutRestored(layout({}), ALL)).not.toBeNull();
    const broken = [
      null,
      "",
      "{",
      "null",
      "3",
      layout({ version: 2 }),
      layout({ version: undefined }),
      layout({ columns: "a.md" }),
      layout({ columns: [] }),
      layout({ columns: [column, column, column, column] }),
      layout({ active: 1 }),
      layout({ active: -1 }),
      layout({ active: 0.5 }),
      layout({ active: "0" }),
      layout({ columns: [null] }),
      layout({ columns: [3] }),
      layout({ columns: [{ ...column, width: 0 }] }),
      layout({ columns: [{ ...column, width: -1 }] }),
      layout({ columns: [{ ...column, width: "1" }] }),
      layout({ columns: [{ ...column, tabs: "a.md" }] }),
      layout({ columns: [{ ...column, tabs: ["a.md", 3] }] }),
      layout({ columns: [{ ...column, activeTab: 1 }] }),
      layout({ columns: [{ ...column, activeTab: null }] }),
      layout({ columns: [{ ...column, tabs: [], activeTab: 0 }] }),
      layout({ columns: [column, { ...column, width: 0 }] }),
    ];
    for (const value of broken) expect(layoutRestored(value, ALL), String(value)).toBeNull();
    expect(
      layoutRestored(
        '{"version":1,"active":0,"columns":[{"width":1e999,"tabs":[],"activeTab":null}]}',
        ALL,
      ),
    ).toBeNull();
  });

  it("trois colonnes se retrouvent", () => {
    const three = columnSplit(columnSplit(noteOpened(columnsStarted, "a.md")));
    expect(shape(layoutRestored(savedLayout(three), ALL) as Columns)).toEqual(shape(three));
  });
});

/** Un stockage en mémoire, qui peut refuser d'écrire ou de lire. */
function memoryStorage(refused = false) {
  const items = new Map<string, string>();
  const storage: PreferenceStorage = {
    getItem: (key) => {
      if (refused) throw new Error("refusé");
      return items.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (refused) throw new Error("refusé");
      items.set(key, value);
    },
    removeItem: (key) => void items.delete(key),
  };
  return { storage, items };
}

describe("disposition gardée dans le stockage de l'interface", () => {
  it("chaque espace de travail a la sienne", () => {
    const { storage } = memoryStorage();
    saveLayout(storage, "/notes", two);
    saveLayout(storage, "/autres", noteOpened(columnsStarted, "d.md"));
    expect(shape(loadLayout(storage, "/notes", ALL) as Columns)).toEqual(shape(two));
    expect(activeNoteOf(loadLayout(storage, "/autres", ALL))).toBe("d.md");
    expect(loadLayout(storage, "/ailleurs", ALL)).toBeNull();
  });

  it("un stockage refusé n'empêche rien : rien n'est gardé ni retrouvé", () => {
    const { storage, items } = memoryStorage(true);
    expect(() => saveLayout(storage, "/notes", two)).not.toThrow();
    expect(items.size).toBe(0);
    expect(loadLayout(storage, "/notes", ALL)).toBeNull();
  });
});

function activeNoteOf(columns: Columns | null) {
  const column = columns?.list.find((c) => c.id === columns.active);
  return column?.tabs.find((tab) => tab.id === column.activeTab)?.note;
}

const NOTES = ["a.md", "b.md", "c.md", "d.md"];
const step = fc.oneof(
  fc.constantFrom(...NOTES).map((note) => (c: Columns) => noteOpened(c, note)),
  fc
    .tuple(
      fc.constantFrom(...NOTES),
      fc.constantFrom("newTab", "left", "right") as fc.Arbitrary<"newTab" | "left" | "right">,
    )
    .map(
      ([note, placement]) =>
        (c: Columns) =>
          notePlaced(c, note, placement),
    ),
  fc.nat(20).map((id) => (c: Columns) => tabClosed(c, id)),
  fc.nat(20).map((id) => (c: Columns) => tabActivated(c, id)),
  fc.constant((c: Columns) => columnSplit(c)),
  fc.tuple(fc.nat(2), fc.double({ min: -0.5, max: 0.5, noNaN: true })).map(
    ([divider, delta]) =>
      (c: Columns) =>
        columnsResized(c, divider, delta),
  ),
);
const reached = fc
  .array(step, { maxLength: 15 })
  .map((steps) => steps.reduce((columns, next) => next(columns), columnsStarted));

describe("disposition gardée, sur des colonnes quelconques", () => {
  it("des colonnes qui ont toutes un onglet se retrouvent telles quelles", () => {
    fc.assert(
      fc.property(reached, (columns) => {
        fc.pre(columns.list.every((column) => column.tabs.length > 0));
        expect(shape(layoutRestored(savedLayout(columns), ALL) as Columns)).toEqual(shape(columns));
      }),
    );
  });

  it("n'importe quelle valeur gardée donne des colonnes valides, ou rien", () => {
    const value = fc.oneof(
      fc.string(),
      fc.json(),
      fc
        .record({
          version: fc.constantFrom(1, 2),
          active: fc.integer({ min: -1, max: 3 }),
          columns: fc.array(
            fc.record({
              width: fc.double({ min: -1, max: 2 }),
              tabs: fc.array(fc.constantFrom("a.md", "gone.md")),
              activeTab: fc.option(fc.integer({ min: -1, max: 3 })),
            }),
            { maxLength: 4 },
          ),
        })
        .map((layout) => JSON.stringify(layout)),
    );
    fc.assert(
      fc.property(value, (text) => {
        const columns = layoutRestored(text, workspace("a.md"));
        if (columns === null) return;
        expect(columns.list.length).toBeGreaterThan(0);
        expect(columns.list.reduce((sum, column) => sum + column.width, 0)).toBeCloseTo(1);
        expect(columns.list.some((column) => column.id === columns.active)).toBe(true);
        for (const column of columns.list) {
          expect(column.tabs.some((tab) => tab.id === column.activeTab)).toBe(true);
          expect(column.tabs.every((tab) => tab.note === "a.md")).toBe(true);
        }
      }),
    );
  });
});
