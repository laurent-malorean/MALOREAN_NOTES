import { describe, expect, it } from "vitest";
import { type Columns, notesChangedOutside, titlesKnown } from "./columns";

const tab = (id: number, note: string, title: string | null = null) => ({ id, note, title });

/** À gauche `a.md` (actif) et `b.md` ; à droite `b.md` (actif). */
const columns: Columns = {
  list: [
    { id: 0, tabs: [tab(1, "a.md", "A"), tab(2, "b.md", "B")], activeTab: 1, width: 0.5 },
    { id: 3, tabs: [tab(4, "b.md", "B")], activeTab: 4, width: 0.5 },
  ],
  active: 0,
  nextId: 5,
};

const note = (path: string, title: string) => ({ path, title });
const tabs = (next: Columns) => next.list.map((c) => c.tabs.map((t) => `${t.note} ${t.title}`));

describe("notes changées hors de l'application", () => {
  it("une note ouverte dont le titre a changé : tous ses onglets le prennent", () => {
    const next = notesChangedOutside(columns, ["b.md"], [note("a.md", "A"), note("b.md", "Bis")]);
    expect(tabs(next)).toEqual([["a.md A", "b.md Bis"], ["b.md Bis"]]);
  });

  it("une note annoncée qui n'est ouverte nulle part ne change rien", () => {
    const workspace = [note("a.md", "A"), note("b.md", "B"), note("c.md", "C")];
    expect(notesChangedOutside(columns, ["c.md"], workspace)).toEqual(columns);
  });

  it("une note ouverte partie, une note apparue : c'est un renommage, ses onglets la suivent", () => {
    const workspace = [note("a.md", "A"), note("c.md", "Cé")];
    const next = notesChangedOutside(columns, ["b.md", "c.md"], workspace);
    expect(tabs(next)).toEqual([["a.md A", "c.md Cé"], ["c.md Cé"]]);
    expect(next.active).toBe(0);
    expect(next.list.map((c) => c.activeTab)).toEqual([1, 4]);
  });

  it("le renommage se reconnaît parmi d'autres changements : note ouverte modifiée, note fermée supprimée", () => {
    const workspace = [note("a.md", "A2"), note("c.md", "Cé")];
    const next = notesChangedOutside(columns, ["a.md", "b.md", "c.md", "x.md"], workspace);
    expect(tabs(next)).toEqual([["a.md A2", "c.md Cé"], ["c.md Cé"]]);
  });

  it("une note apparue déjà ouverte n'est pas le nouveau nom d'une note partie", () => {
    const workspace = [note("a.md", "A2")];
    const next = notesChangedOutside(columns, ["b.md", "a.md"], workspace);
    expect(tabs(next)).toEqual([["a.md A2", "b.md B"], ["b.md B"]]);
  });

  it("sans paire certaine (deux parties ou deux apparues), aucun onglet ne change de note", () => {
    const twoNew = [note("a.md", "A"), note("c.md", "C"), note("d.md", "D")];
    expect(notesChangedOutside(columns, ["b.md", "c.md", "d.md"], twoNew)).toEqual(columns);
    const twoGone = [note("c.md", "C")];
    expect(notesChangedOutside(columns, ["a.md", "b.md", "c.md"], twoGone)).toEqual(columns);
  });

  it("une note partie sans remplaçante garde ses onglets", () => {
    expect(notesChangedOutside(columns, ["b.md"], [note("a.md", "A")])).toEqual(columns);
  });
});

describe("titres déjà connus de l'écran", () => {
  it("un onglet sans titre prend celui de sa note dans la liste ; un onglet titré garde le sien", () => {
    const opened: Columns = {
      ...columns,
      list: [{ id: 0, tabs: [tab(1, "a.md", "A"), tab(2, "c.md")], activeTab: 2, width: 1 }],
    };
    const next = titlesKnown(opened, (path) => ({ "a.md": "Autre", "c.md": "C" })[path]);
    expect(tabs(next)).toEqual([["a.md A", "c.md C"]]);
  });

  it("un onglet dont le titre n'est connu nulle part reste sans titre", () => {
    const opened: Columns = {
      ...columns,
      list: [{ id: 0, tabs: [tab(1, "c.md")], activeTab: 1, width: 1 }],
    };
    expect(tabs(titlesKnown(opened, () => undefined))).toEqual([["c.md null"]]);
  });
});
