import { describe, expect, it } from "vitest";
import { dragged, stopDragging } from "./dragging";
import { renderNotesList } from "./notes-list";

const notes = [
  { path: "b.md", title: "Bêta", modified: Date.UTC(2026, 10, 16, 14, 30) },
  { path: "a.md", title: "Alpha", modified: Date.UTC(2026, 10, 15, 9, 0) },
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
    renderNotesList(container, notes, null, (path) => opened.push(path));
    (container.querySelectorAll<HTMLButtonElement>(".note-item")[1] as HTMLButtonElement).click();
    expect(opened).toEqual(["a.md"]);
  });

  it("n'interprète pas un titre comme du HTML", () => {
    const container = list();
    renderNotesList(
      container,
      [{ path: "x.md", title: "<img src=x onerror=alert(1)>", modified: 0 }],
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

describe("glisser une note", () => {
  const drag = (target: Element, type: string) =>
    target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true }));

  it("une note se glisse vers un dossier, et le glissement s'oublie à la fin", () => {
    const container = list();
    renderNotesList(container, notes, null, () => {});
    const item = container.querySelectorAll<HTMLElement>(".note-item")[1] as HTMLElement;
    expect(item.draggable).toBe(true);
    drag(item, "dragstart");
    expect(dragged()).toEqual({ kind: "note", path: "a.md" });
    drag(item, "dragend");
    expect(dragged()).toBeNull();
    stopDragging();
  });
});
