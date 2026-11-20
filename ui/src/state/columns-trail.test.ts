import { describe, expect, it } from "vitest";
import {
  columnActivated,
  type Columns,
  columnSplit,
  columnWalked,
  noteFollowed,
  noteOpened,
  noteShown,
  notesMoved,
  notesRemoved,
  type Tab,
  tabActivated,
} from "./columns";
import { type NotePosition, trailOf } from "./trail";

const at = (anchor: number): NotePosition => ({ anchor, head: anchor, top: 0, offset: 0 });

/** Deux colonnes : à gauche `a.md` et `c.md` (actif : `a.md`), à droite `b.md` (colonne active). */
const two: Columns = {
  list: [
    {
      id: 0,
      tabs: [
        { id: 1, note: "a.md", title: "A" },
        { id: 2, note: "c.md", title: "C" },
      ],
      activeTab: 1,
      width: 0.5,
    },
    { id: 3, tabs: [{ id: 4, note: "b.md", title: "B" }], activeTab: 4, width: 0.5 },
  ],
  active: 3,
  nextId: 5,
};

const tabOf = (columns: Columns, tabId: number) =>
  columns.list.flatMap((column) => column.tabs).find((tab) => tab.id === tabId);

const trailIn = (columns: Columns, tabId: number) => trailOf(tabOf(columns, tabId) as Tab);

describe("suivre un lien", () => {
  it("montre la note dans l'onglet actif, la note quittée entrant dans son parcours", () => {
    const next = noteFollowed(two, "d.md", at(5));
    expect(tabOf(next, 4)).toEqual({
      id: 4,
      note: "d.md",
      title: null,
      trail: { back: [{ note: "b.md", position: at(5) }], forward: [] },
    });
    expect(next.list[0]).toBe(two.list[0]);
    expect(next.nextId).toBe(5);
  });

  it("montre la note dans l'onglet actif même si un autre onglet de la colonne l'a", () => {
    const next = noteFollowed(columnActivated(two, 0), "c.md", at(1));
    expect(next.list[0]?.tabs.map((tab) => tab.note)).toEqual(["c.md", "c.md"]);
    expect(next.list[0]?.activeTab).toBe(1);
  });

  it("sur la note déjà montrée, ne change rien au parcours", () => {
    const next = noteFollowed(two, "b.md", at(1));
    expect(tabOf(next, 4)).toEqual({ id: 4, note: "b.md", title: "B" });
  });

  it("sans onglet, en ouvre un, sans parcours", () => {
    const empty: Columns = {
      list: [{ id: 0, tabs: [], activeTab: null, width: 1 }],
      active: 0,
      nextId: 1,
    };
    const next = noteFollowed(empty, "a.md", at(1));
    expect(next.list[0]).toEqual({
      id: 0,
      tabs: [{ id: 1, note: "a.md", title: null }],
      activeTab: 1,
      width: 1,
    });
    expect(next.nextId).toBe(2);
  });

  it("une note choisie dans une liste entre aussi dans le parcours, avec sa position", () => {
    const next = noteShown(two, "d.md", at(9));
    expect(trailIn(next, 4).back).toEqual([{ note: "b.md", position: at(9) }]);
    expect(trailIn(noteShown(two, "e.md"), 4).back).toEqual([{ note: "b.md", position: null }]);
  });
});

describe("revenir et avancer dans une colonne", () => {
  it("l'onglet actif de la colonne revient à la note précédente, qui devient active, puis repart", () => {
    const followed = noteFollowed(columnActivated(two, 0), "d.md", at(1));
    const back = columnWalked(columnActivated(followed, 3), 0, -1, at(2));
    expect(back.active).toBe(0);
    expect(tabOf(back, 1)?.note).toBe("a.md");
    expect(trailIn(back, 1).forward).toEqual([{ note: "d.md", position: at(2) }]);
    expect(back.list[1]).toBe(followed.list[1]);
    const forward = columnWalked(back, 0, 1, at(3));
    expect(tabOf(forward, 1)?.note).toBe("d.md");
    expect(trailIn(forward, 1).back).toEqual([{ note: "a.md", position: at(3) }]);
  });

  it("seul l'onglet actif de la colonne fait le pas", () => {
    // Les deux onglets de gauche ont un parcours ; seul l'actif (a.md) revient en arrière.
    const both = noteFollowed(
      tabActivated(noteFollowed(columnActivated(two, 0), "d.md", null), 2),
      "e.md",
      null,
    );
    const followed = tabActivated(both, 1);
    const back = columnWalked(followed, 0, -1, null);
    expect(tabOf(back, 1)?.note).toBe("a.md");
    expect(tabOf(back, 2)).toBe(tabOf(followed, 2));
  });

  it("une colonne inconnue, ou sans onglet, ne change rien", () => {
    expect(columnWalked(two, 9, -1, null)).toBe(two);
    const empty: Columns = {
      list: [{ id: 0, tabs: [], activeTab: null, width: 1 }],
      active: 0,
      nextId: 1,
    };
    expect(columnWalked(empty, 0, -1, null)).toBe(empty);
  });

  it("les parcours suivent les notes renommées, oublient celles jetées, et « Diviser » copie le sien", () => {
    const followed = noteFollowed(two, "d.md", null);
    const moved = notesMoved(followed, (path) => `Travail/${path}`);
    expect(trailIn(moved, 4).back).toEqual([{ note: "Travail/b.md", position: null }]);
    const removed = notesRemoved(followed, (path) => path === "b.md");
    expect(trailIn(removed, 4).back).toEqual([]);
    const split = columnSplit(followed);
    expect(trailOf(split.list[2]?.tabs[0] as Tab).back).toEqual([{ note: "b.md", position: null }]);
  });

  it("une note ouverte dans un nouvel onglet n'a pas de parcours", () => {
    const next = noteOpened(two, "d.md");
    expect(tabOf(next, 5)).toEqual({ id: 5, note: "d.md", title: null });
  });
});
