import { describe, expect, it } from "vitest";
import type { NoteListItem } from "../bridge/generated/NoteListItem";
import { followRename, initialSelection, nextSelection } from "./selection";

const note = (path: string, modified: number): NoteListItem => ({
  path,
  title: path,
  modified,
  pinned: false,
});

describe("sélection de la note", () => {
  it("ouvre la note la plus récente au chargement", () => {
    expect(initialSelection([note("recente.md", 2), note("vieille.md", 1)])).toBe("recente.md");
  });

  it("n'ouvre rien dans une bibliothèque vide", () => {
    expect(initialSelection([])).toBeNull();
  });

  it("suit la note quand son fichier est renommé", () => {
    expect(followRename("ancien.md", "ancien.md", "nouveau.md")).toBe("nouveau.md");
  });

  it("garde la sélection quand une autre note est renommée", () => {
    expect(followRename("a.md", "b.md", "c.md")).toBe("a.md");
  });
});

describe("note ouverte après une suppression", () => {
  const notes = [note("a.md", 3), note("b.md", 2), note("c.md", 1)];

  it("ouvre la note suivante de la liste", () => {
    expect(nextSelection(notes, "b.md")).toBe("c.md");
  });

  it("ouvre la précédente quand la dernière part", () => {
    expect(nextSelection(notes, "c.md")).toBe("b.md");
  });

  it("n'ouvre rien quand la seule note part", () => {
    expect(nextSelection([note("a.md", 1)], "a.md")).toBeNull();
  });

  it("ouvre la première quand la note partie n'est pas dans la liste", () => {
    expect(nextSelection(notes, "autre.md")).toBe("a.md");
  });
});
