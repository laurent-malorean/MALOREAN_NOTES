import { describe, expect, it } from "vitest";
import type { NoteListItem } from "../bridge/generated/NoteListItem";
import { followRename, initialSelection } from "./selection";

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
