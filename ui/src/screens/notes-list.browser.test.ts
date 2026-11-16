import { describe, expect, it } from "vitest";
import { renderNotesList } from "./notes-list";

const notes = [
  { fileName: "b.md", title: "Bêta", modified: Date.UTC(2026, 10, 16, 14, 30) },
  { fileName: "a.md", title: "Alpha", modified: Date.UTC(2026, 10, 15, 9, 0) },
];

function list() {
  const container = document.createElement("nav");
  document.body.replaceChildren(container);
  return container;
}

describe("liste des notes", () => {
  it("affiche les titres dans l'ordre reçu", () => {
    const container = list();
    renderNotesList(container, notes, null, () => {});
    const titles = [...container.querySelectorAll(".note-title")].map((t) => t.textContent);
    expect(titles).toEqual(["Bêta", "Alpha"]);
  });

  it("affiche la date de modification", () => {
    const container = list();
    renderNotesList(container, notes, null, () => {});
    expect(container.querySelector(".note-date")?.textContent).toMatch(
      /^16\/11\/2026 \d{2}:\d{2}$/,
    );
  });

  it("met en évidence la note ouverte, et elle seule", () => {
    const container = list();
    renderNotesList(container, notes, "a.md", () => {});
    const selected = [...container.querySelectorAll(".note-item.selected .note-title")];
    expect(selected.map((t) => t.textContent)).toEqual(["Alpha"]);
  });

  it("ouvre la note cliquée", () => {
    const container = list();
    const opened: string[] = [];
    renderNotesList(container, notes, null, (fileName) => opened.push(fileName));
    (container.querySelectorAll<HTMLButtonElement>(".note-item")[1] as HTMLButtonElement).click();
    expect(opened).toEqual(["a.md"]);
  });

  it("n'interprète pas un titre comme du HTML", () => {
    const container = list();
    renderNotesList(
      container,
      [{ fileName: "x.md", title: "<img src=x onerror=alert(1)>", modified: 0 }],
      null,
      () => {},
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".note-title")?.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
  });

  it("vide la liste pour une bibliothèque sans note", () => {
    const container = list();
    renderNotesList(container, notes, null, () => {});
    renderNotesList(container, [], null, () => {});
    expect(container.children).toHaveLength(0);
  });
});
