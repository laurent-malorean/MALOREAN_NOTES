import { describe, expect, it } from "vitest";
import type { LinkingNoteItem } from "../bridge";
import { renderBacklinks } from "./backlinks-view";

const note = (path: string, title: string, folder = ""): LinkingNoteItem => ({
  path,
  title,
  folder,
});

function render(notes: readonly LinkingNoteItem[]) {
  const container = document.createElement("nav");
  const opened: string[] = [];
  renderBacklinks(container, notes, (path) => opened.push(path));
  return { container, opened };
}

describe("liens entrants", () => {
  it("sont cachés quand aucune note ne pointe vers la note ouverte", () => {
    const { container } = render([note("a.md", "A")]);
    renderBacklinks(container, [], () => {});
    expect(container.hidden).toBe(true);
    expect(container.childElementCount).toBe(0);
  });

  it("listent les notes qui pointent ici, avec leur dossier", () => {
    const { container } = render([
      note("Travail/lundi.md", "Lundi", "Travail"),
      note("b.md", "Mardi"),
    ]);
    expect(container.hidden).toBe(false);
    expect(container.querySelector(".backlinks-title")?.textContent).toBe("Liens entrants");
    const items = [...container.querySelectorAll("button.backlink")].map((b) => [
      b.querySelector(".backlink-title")?.textContent,
      b.querySelector(".backlink-folder")?.textContent ?? null,
    ]);
    expect(items).toEqual([
      ["Lundi", "Travail"],
      ["Mardi", null],
    ]);
  });

  it("ouvrent la note cliquée", () => {
    const { container, opened } = render([note("a.md", "A"), note("b.md", "B")]);
    container.querySelectorAll<HTMLButtonElement>("button.backlink")[1]?.click();
    expect(opened).toEqual(["b.md"]);
  });

  it("remplacent la liste précédente", () => {
    const { container } = render([note("a.md", "A"), note("b.md", "B")]);
    renderBacklinks(container, [note("c.md", "C")], () => {});
    expect(container.querySelectorAll("button.backlink")).toHaveLength(1);
  });
});
