import { describe, expect, it } from "vitest";
import type { NoteListItem } from "../bridge";
import {
  libraryOpened,
  noteRenamed,
  noteSelected,
  notesRefreshed,
  selectedNote,
  welcome,
} from "./screen";

const library = { name: "Notes", path: "/Users/moi/Notes" };
const note = (path: string, modified: number): NoteListItem => ({
  path,
  title: path,
  modified,
});

describe("état de l'écran", () => {
  it("commence par l'accueil", () => {
    expect(welcome).toEqual({ kind: "welcome" });
  });

  it("ouvre une bibliothèque sur sa note la plus récente", () => {
    const screen = libraryOpened(library, [note("recente.md", 2), note("vieille.md", 1)]);
    expect(screen).toEqual({
      kind: "library",
      library,
      notes: [note("recente.md", 2), note("vieille.md", 1)],
      selected: "recente.md",
    });
  });

  it("ouvre une bibliothèque vide sans note sélectionnée", () => {
    expect(libraryOpened(library, [])).toEqual({
      kind: "library",
      library,
      notes: [],
      selected: null,
    });
  });

  it("sélectionne la note choisie", () => {
    const screen = noteSelected(libraryOpened(library, [note("a.md", 2), note("b.md", 1)]), "b.md");
    expect(screen).toEqual({
      kind: "library",
      library,
      notes: [note("a.md", 2), note("b.md", 1)],
      selected: "b.md",
    });
  });

  it("suit la note sélectionnée quand son fichier est renommé", () => {
    const screen = noteRenamed(libraryOpened(library, [note("a.md", 1)]), "a.md", "b.md");
    expect(screen).toEqual({
      kind: "library",
      library,
      notes: [note("a.md", 1)],
      selected: "b.md",
    });
  });

  it("remplace la liste sans toucher à la sélection", () => {
    const screen = notesRefreshed(libraryOpened(library, [note("a.md", 1)]), [
      note("b.md", 2),
      note("a.md", 1),
    ]);
    expect(screen).toEqual({
      kind: "library",
      library,
      notes: [note("b.md", 2), note("a.md", 1)],
      selected: "a.md",
    });
  });

  it("ignore les actions sur les notes tant que l'accueil est affiché", () => {
    expect(noteSelected(welcome, "a.md")).toBe(welcome);
    expect(noteRenamed(welcome, "a.md", "b.md")).toBe(welcome);
    expect(notesRefreshed(welcome, [note("a.md", 1)])).toBe(welcome);
  });
});

describe("note sélectionnée", () => {
  it("est celle de la bibliothèque ouverte", () => {
    expect(selectedNote(libraryOpened(library, [note("a.md", 1)]))).toBe("a.md");
  });

  it("n'existe pas sur l'accueil", () => {
    expect(selectedNote(welcome)).toBeNull();
  });
});
