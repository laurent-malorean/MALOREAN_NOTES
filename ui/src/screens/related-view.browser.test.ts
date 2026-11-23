import { describe, expect, it } from "vitest";
import type { NoteListItem } from "../bridge";
import { renderRelatedNotes } from "./related-view";

const note = (path: string, title: string): NoteListItem => ({
  ...{ path, title, modified: 0, pinned: false, tags: [] },
});

function render(notes: readonly NoteListItem[] | null) {
  const container = document.createElement("nav");
  const opened: string[] = [];
  renderRelatedNotes(container, notes, (path) => opened.push(path));
  return { container, opened };
}

describe("notes proches", () => {
  it("sont cachées quand la liste n'est pas demandée, sans rien garder", () => {
    const { container } = render([note("a.md", "A")]);
    renderRelatedNotes(container, null, () => {});
    expect(container.hidden).toBe(true);
    expect(container.childElementCount).toBe(0);
  });

  it("listent les notes proches, avec leur dossier", () => {
    const { container } = render([note("Cuisine/tarte.md", "Tarte"), note("cidre.md", "Cidre")]);
    expect(container.hidden).toBe(false);
    expect(container.querySelector(".backlinks-title")?.textContent).toBe("Notes proches");
    const items = [...container.querySelectorAll("button.backlink")].map((b) => [
      b.querySelector(".backlink-title")?.textContent,
      b.querySelector(".backlink-folder")?.textContent ?? null,
    ]);
    expect(items).toEqual([
      ["Tarte", "Cuisine"],
      ["Cidre", null],
    ]);
    expect(container.querySelector(".related-none")).toBeNull();
  });

  it("disent qu'aucune note n'est proche quand le sens n'est pas encore calculé", () => {
    const { container } = render([]);
    expect(container.hidden).toBe(false);
    expect(container.querySelector(".backlinks-title")?.textContent).toBe("Notes proches");
    expect(container.querySelector(".related-none")?.textContent).toBe(
      "Aucune note proche (le sens n'est pas encore calculé)",
    );
    expect(container.querySelector("button")).toBeNull();
  });

  it("ouvrent la note cliquée", () => {
    const { container, opened } = render([note("a.md", "A"), note("b.md", "B")]);
    container.querySelectorAll<HTMLButtonElement>("button.backlink")[1]?.click();
    expect(opened).toEqual(["b.md"]);
  });

  it("remplacent la liste précédente", () => {
    const { container } = render([note("a.md", "A"), note("b.md", "B")]);
    renderRelatedNotes(container, [note("c.md", "C")], () => {});
    expect(container.querySelectorAll("button.backlink")).toHaveLength(1);
  });
});
