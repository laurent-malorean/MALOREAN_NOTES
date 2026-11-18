import { describe, expect, it } from "vitest";
import type { NoteListItem, TagItem, TrashInfo } from "../bridge";
import {
  activeTag,
  folderSelected,
  workspaceOpened,
  type Screen,
  searchTyped,
  tagCleared,
  tagSelected,
  tagsRefreshed,
  trashShown,
  welcome,
} from "./screen";

const workspace = { name: "Notes", path: "/Users/moi/Notes" };
const note = (path: string, tags: string[] = []): NoteListItem => ({
  path,
  title: path,
  modified: 0,
  pinned: false,
  tags,
});
const opened = workspaceOpened(workspace, ["Travail"], [note("a.md")]);
const workspace_ = (screen: Screen) => screen as Extract<Screen, { kind: "workspace" }>;

describe("filtre par étiquette", () => {
  it("un espace de travail s'ouvre sans filtre ni étiquette connue", () => {
    expect(workspace_(opened).tag).toBeNull();
    expect(workspace_(opened).tags).toEqual([]);
    expect(activeTag(opened)).toBeNull();
    expect(activeTag(welcome)).toBeNull();
  });

  it("choisir une étiquette montre ses notes, sélectionne la première et vide la recherche", () => {
    const searching = searchTyped(opened, "pain");
    const tagged = [note("Travail/b.md", ["perso"]), note("c.md", ["perso"])];
    const screen = workspace_(tagSelected(searching, "perso", tagged));
    expect(screen.tag).toBe("perso");
    expect(screen.notes).toEqual(tagged);
    expect(screen.selected).toBe("Travail/b.md");
    expect(screen.search).toBeNull();
    expect(screen.folder).toBe("");
    expect(activeTag(screen)).toBe("perso");
  });

  it("choisir une étiquette quitte la corbeille", () => {
    const trash: TrashInfo = { folders: [], notes: [] };
    const screen = workspace_(tagSelected(trashShown(opened, trash), "perso", []));
    expect(screen.trash).toBeNull();
    expect(screen.selected).toBeNull();
  });

  it("retirer le filtre ramène les notes du dossier et garde la note sélectionnée", () => {
    const tagged = tagSelected(opened, "perso", [note("b.md", ["perso"])]);
    const screen = workspace_(tagCleared(tagged, [note("a.md"), note("b.md")]));
    expect(screen.tag).toBeNull();
    expect(screen.notes).toEqual([note("a.md"), note("b.md")]);
    expect(screen.selected).toBe("b.md");
  });

  it("choisir un dossier retire le filtre", () => {
    const tagged = tagSelected(opened, "perso", []);
    expect(workspace_(folderSelected(tagged, "Travail", [])).tag).toBeNull();
  });

  it("la recherche et la corbeille gardent le filtre, qui revient ensuite", () => {
    const tagged = tagSelected(opened, "perso", []);
    expect(workspace_(searchTyped(tagged, "pain")).tag).toBe("perso");
    expect(workspace_(trashShown(tagged, { folders: [], notes: [] })).tag).toBe("perso");
  });

  it("la liste des étiquettes relue remplace l'ancienne", () => {
    const tags: TagItem[] = [{ name: "perso", count: 2 }];
    expect(workspace_(tagsRefreshed(opened, tags)).tags).toEqual(tags);
  });

  it("l'accueil ne change pas", () => {
    expect(tagSelected(welcome, "perso", [])).toBe(welcome);
    expect(tagCleared(welcome, [])).toBe(welcome);
    expect(tagsRefreshed(welcome, [])).toBe(welcome);
  });
});
