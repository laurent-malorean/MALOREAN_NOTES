import { afterEach, describe, expect, it } from "vitest";
import { closeContextMenu } from "./context-menu";
import { dragged, stopDragging } from "./dragging";
import { type NoteActions, renderNotesList } from "./notes-list";

const noActions: NoteActions = { open: () => {}, pin: () => {}, unpin: () => {} };

/** Les actions demandées, notées dans l'ordre : `ouvrir a.md`, `épingler a.md`… */
function recorded(): { readonly asked: string[]; readonly actions: NoteActions } {
  const asked: string[] = [];
  return {
    asked,
    actions: {
      open: (path) => asked.push(`ouvrir ${path}`),
      pin: (path) => asked.push(`épingler ${path}`),
      unpin: (path) => asked.push(`désépingler ${path}`),
    },
  };
}

afterEach(() => closeContextMenu());

const notes = [
  { path: "b.md", title: "Bêta", modified: Date.UTC(2026, 10, 16, 14, 30), pinned: false },
  { path: "a.md", title: "Alpha", modified: Date.UTC(2026, 10, 15, 9, 0), pinned: false },
];

function list() {
  const container = document.createElement("nav");
  document.body.replaceChildren(container);
  return container;
}

describe("liste des notes", () => {
  it("affiche les titres dans l'ordre reçu", () => {
    const container = list();
    renderNotesList(container, notes, null, noActions);
    const titles = [...container.querySelectorAll(".note-title")].map((t) => t.textContent);
    expect(titles).toEqual(["Bêta", "Alpha"]);
  });

  it("affiche la date de modification", () => {
    const container = list();
    renderNotesList(container, notes, null, noActions);
    expect(container.querySelector(".note-date")?.textContent).toMatch(
      /^16\/11\/2026 \d{2}:\d{2}$/,
    );
  });

  it("met en évidence la note ouverte, et elle seule", () => {
    const container = list();
    renderNotesList(container, notes, "a.md", noActions);
    const selected = [...container.querySelectorAll(".note-item.selected .note-title")];
    expect(selected.map((t) => t.textContent)).toEqual(["Alpha"]);
  });

  it("ouvre la note cliquée", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, notes, null, actions);
    (container.querySelectorAll<HTMLButtonElement>(".note-item")[1] as HTMLButtonElement).click();
    expect(asked).toEqual(["ouvrir a.md"]);
  });

  it("n'interprète pas un titre comme du HTML", () => {
    const container = list();
    renderNotesList(
      container,
      [{ path: "x.md", title: "<img src=x onerror=alert(1)>", modified: 0, pinned: false }],
      null,
      noActions,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".note-title")?.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
  });

  it("vide la liste pour une bibliothèque sans note", () => {
    const container = list();
    renderNotesList(container, notes, null, noActions);
    renderNotesList(container, [], null, noActions);
    expect(container.children).toHaveLength(0);
  });
});

describe("notes épinglées", () => {
  const withPinned = [
    { path: "p.md", title: "Épinglée", modified: 0, pinned: true },
    { path: "a.md", title: "Alpha", modified: 0, pinned: false },
  ];
  const rightClick = (target: Element) => {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 34,
    });
    target.dispatchEvent(event);
    return event;
  };
  const menuEntries = () =>
    [...document.querySelectorAll(".context-menu button")].map((b) => b.textContent);

  it("marque d'une épingle les notes épinglées, et elles seules", () => {
    const container = list();
    renderNotesList(container, withPinned, null, noActions);
    const pins = [...container.querySelectorAll(".note-item")].map((item) =>
      item.querySelector(".note-pin")?.getAttribute("aria-label"),
    );
    expect(pins).toEqual(["Épinglée", undefined]);
    expect(container.querySelector(".note-title")?.textContent).toBe("Épinglée");
    expect(container.querySelector(".note-heading > .note-pin")?.textContent).toBe("📌");
  });

  it("un clic droit sur une note propose de l'épingler, à l'endroit du clic", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, withPinned, null, actions);
    const event = rightClick(container.querySelectorAll(".note-item")[1] as Element);
    expect(event.defaultPrevented).toBe(true);
    expect(menuEntries()).toEqual(["Épingler"]);
    expect(document.querySelector<HTMLElement>(".context-menu")?.style.left).toBe("12px");
    document.querySelector<HTMLButtonElement>(".context-menu button")?.click();
    expect(asked).toEqual(["épingler a.md"]);
  });

  it("un clic droit sur une note épinglée propose de la désépingler", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, withPinned, null, actions);
    rightClick(container.querySelector(".note-item") as Element);
    expect(menuEntries()).toEqual(["Désépingler"]);
    document.querySelector<HTMLButtonElement>(".context-menu button")?.click();
    expect(asked).toEqual(["désépingler p.md"]);
  });
});

describe("glisser une note", () => {
  const drag = (target: Element, type: string) =>
    target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true }));

  it("une note se glisse vers un dossier, et le glissement s'oublie à la fin", () => {
    const container = list();
    renderNotesList(container, notes, null, noActions);
    const item = container.querySelectorAll<HTMLElement>(".note-item")[1] as HTMLElement;
    expect(item.draggable).toBe(true);
    drag(item, "dragstart");
    expect(dragged()).toEqual({ kind: "note", path: "a.md" });
    drag(item, "dragend");
    expect(dragged()).toBeNull();
    stopDragging();
  });
});
