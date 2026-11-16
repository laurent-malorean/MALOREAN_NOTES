import { describe, expect, it } from "vitest";
import type { NoteListItem } from "../bridge";
import {
  currentFolder,
  folderMoved,
  folderSelected,
  foldersRefreshed,
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
    const screen = libraryOpened(library, [], [note("recente.md", 2), note("vieille.md", 1)]);
    expect(screen).toEqual({
      kind: "library",
      library,
      folders: [],
      folder: "",
      notes: [note("recente.md", 2), note("vieille.md", 1)],
      selected: "recente.md",
    });
  });

  it("ouvre une bibliothèque vide sans note sélectionnée", () => {
    expect(libraryOpened(library, [], [])).toEqual({
      kind: "library",
      library,
      folders: [],
      folder: "",
      notes: [],
      selected: null,
    });
  });

  it("sélectionne la note choisie", () => {
    const screen = noteSelected(
      libraryOpened(library, [], [note("a.md", 2), note("b.md", 1)]),
      "b.md",
    );
    expect(screen).toEqual({
      kind: "library",
      library,
      folders: [],
      folder: "",
      notes: [note("a.md", 2), note("b.md", 1)],
      selected: "b.md",
    });
  });

  it("suit la note sélectionnée quand son fichier est renommé", () => {
    const screen = noteRenamed(libraryOpened(library, [], [note("a.md", 1)]), "a.md", "b.md");
    expect(screen).toEqual({
      kind: "library",
      library,
      folders: [],
      folder: "",
      notes: [note("a.md", 1)],
      selected: "b.md",
    });
  });

  it("remplace la liste sans toucher à la sélection", () => {
    const screen = notesRefreshed(libraryOpened(library, [], [note("a.md", 1)]), [
      note("b.md", 2),
      note("a.md", 1),
    ]);
    expect(screen).toEqual({
      kind: "library",
      library,
      folders: [],
      folder: "",
      notes: [note("b.md", 2), note("a.md", 1)],
      selected: "a.md",
    });
  });

  it("ignore les actions sur les notes tant que l'accueil est affiché", () => {
    expect(folderSelected(welcome, "a", [])).toBe(welcome);
    expect(foldersRefreshed(welcome, ["a"])).toBe(welcome);
    expect(folderMoved(welcome, "a", "b")).toBe(welcome);
    expect(noteSelected(welcome, "a.md")).toBe(welcome);
    expect(noteRenamed(welcome, "a.md", "b.md")).toBe(welcome);
    expect(notesRefreshed(welcome, [note("a.md", 1)])).toBe(welcome);
  });
});

describe("note sélectionnée", () => {
  it("est celle de la bibliothèque ouverte", () => {
    expect(selectedNote(libraryOpened(library, [], [note("a.md", 1)]))).toBe("a.md");
  });

  it("n'existe pas sur l'accueil", () => {
    expect(selectedNote(welcome)).toBeNull();
  });
});

describe("dossiers", () => {
  const opened = libraryOpened(library, ["Travail", "Travail/Réunions"], [note("a.md", 1)]);

  it("ouvre une bibliothèque sur sa racine, avec ses dossiers", () => {
    expect(opened).toMatchObject({ folders: ["Travail", "Travail/Réunions"], folder: "" });
    expect(currentFolder(opened)).toBe("");
    expect(currentFolder(welcome)).toBe("");
  });

  it("choisit un dossier et sa note la plus récente", () => {
    const screen = folderSelected(opened, "Travail", [note("Travail/b.md", 2)]);
    expect(screen).toMatchObject({
      folder: "Travail",
      notes: [note("Travail/b.md", 2)],
      selected: "Travail/b.md",
    });
    expect(currentFolder(screen)).toBe("Travail");
  });

  it("remplace la liste des dossiers", () => {
    expect(foldersRefreshed(opened, ["Perso"])).toMatchObject({ folders: ["Perso"] });
  });

  it("suit le dossier affiché et la note ouverte quand leur dossier est déplacé", () => {
    const inside = folderSelected(opened, "Travail/Réunions", [note("Travail/Réunions/l.md", 1)]);
    expect(folderMoved(inside, "Travail", "Perso/Travail")).toMatchObject({
      folder: "Perso/Travail/Réunions",
      selected: "Perso/Travail/Réunions/l.md",
    });
  });

  it("ne touche à rien quand un autre dossier est déplacé", () => {
    const empty = folderSelected(opened, "Perso", []);
    expect(folderMoved(empty, "Travail", "x/Travail")).toMatchObject({
      folder: "Perso",
      selected: null,
    });
  });
});
