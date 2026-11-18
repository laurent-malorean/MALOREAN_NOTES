import { describe, expect, it } from "vitest";
import type { NoteListItem, TrashInfo } from "../bridge";
import {
  folderSelected,
  libraryOpened,
  recentShown,
  recentOn,
  type Screen,
  searchTyped,
  tagSelected,
  trashShown,
  welcome,
} from "./screen";

const library = { name: "Notes", path: "/Users/moi/Notes" };
const note = (path: string): NoteListItem => ({
  path,
  title: path,
  modified: 0,
  pinned: false,
  tags: [],
});
const opened = libraryOpened(library, ["Travail"], [note("a.md")]);
const library_ = (screen: Screen) => screen as Extract<Screen, { kind: "library" }>;
const recent = [note("Travail/b.md"), note("a.md")];

describe("Récentes", () => {
  it("une bibliothèque s'ouvre sur son dossier, pas sur les notes récentes", () => {
    expect(library_(opened).recent).toBe(false);
    expect(recentOn(opened)).toBe(false);
    expect(recentOn(welcome)).toBe(false);
    expect(recentShown(welcome, recent)).toBe(welcome);
  });

  it("montre les notes récentes, la première sélectionnée ; quitte la recherche, la corbeille et le filtre", () => {
    const trash: TrashInfo = { folders: [], notes: [] };
    const before = trashShown(tagSelected(searchTyped(opened, "pain"), "perso", []), trash);
    const screen = library_(recentShown(before, recent));
    expect(screen.recent).toBe(true);
    expect(screen.notes).toEqual(recent);
    expect(screen.selected).toBe("Travail/b.md");
    expect(screen.search).toBeNull();
    expect(screen.trash).toBeNull();
    expect(screen.tag).toBeNull();
    expect(recentOn(screen)).toBe(true);
  });

  it("choisir un dossier ou une étiquette les quitte", () => {
    const shown = recentShown(opened, recent);
    expect(library_(folderSelected(shown, "Travail", [])).recent).toBe(false);
    expect(library_(tagSelected(shown, "perso", [])).recent).toBe(false);
  });

  it("restent de côté pendant une recherche ou dans la corbeille", () => {
    const shown = recentShown(opened, recent);
    const trash: TrashInfo = { folders: [], notes: [] };
    expect(library_(searchTyped(shown, "pain")).recent).toBe(true);
    expect(library_(trashShown(shown, trash)).recent).toBe(true);
  });
});
