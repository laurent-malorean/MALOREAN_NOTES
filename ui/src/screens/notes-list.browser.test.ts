import { afterEach, describe, expect, it } from "vitest";
import { closeContextMenu } from "./context-menu";
import { dragged, stopDragging } from "./dragging";
import { type NoteActions, renderNotesList } from "./notes-list";

const noActions: NoteActions = {
  open: () => {},
  pin: () => {},
  unpin: () => {},
  trash: () => {},
  place: () => {},
  closeNote: () => {},
  selectTag: () => {},
  exportNote: () => {},
  printNote: () => {},
  copyNote: () => {},
  copyMarkdown: () => {},
  showHistory: () => {},
};

/** Les actions demandées, notées dans l'ordre : `ouvrir a.md`, `épingler a.md`… */
function recorded(): { readonly asked: string[]; readonly actions: NoteActions } {
  const asked: string[] = [];
  return {
    asked,
    actions: {
      open: (path) => asked.push(`ouvrir ${path}`),
      pin: (path) => asked.push(`épingler ${path}`),
      unpin: (path) => asked.push(`désépingler ${path}`),
      trash: (path) => asked.push(`jeter ${path}`),
      place: (path, placement) => asked.push(`placer ${path} ${placement}`),
      closeNote: (path) => asked.push(`fermer ${path}`),
      selectTag: (tag) => asked.push(`filtrer #${tag}`),
      exportNote: (path) => asked.push(`exporter ${path}`),
      printNote: (path) => asked.push(`imprimer ${path}`),
      copyNote: (path) => asked.push(`copier ${path}`),
      copyMarkdown: (path) => asked.push(`copier en Markdown ${path}`),
      showHistory: (path) => asked.push(`historique ${path}`),
    },
  };
}

afterEach(() => closeContextMenu());

const notes = [
  {
    path: "b.md",
    title: "Bêta",
    modified: Date.UTC(2026, 10, 16, 14, 30),
    pinned: false,
    tags: [],
  },
  { path: "a.md", title: "Alpha", modified: Date.UTC(2026, 10, 15, 9, 0), pinned: false, tags: [] },
];

function list() {
  const container = document.createElement("nav");
  document.body.replaceChildren(container);
  return container;
}

describe("liste des notes", () => {
  it("montre les étiquettes de chaque note sous sa date ; un clic filtre sans ouvrir la note", () => {
    const container = list();
    const { asked, actions } = recorded();
    const tagged = [{ ...notes[0], tags: ["perso", "loisirs"] }, notes[1]];
    renderNotesList(container, tagged as typeof notes, null, actions);
    const [first, second] = [...container.querySelectorAll(".note-item")];
    expect(first?.lastElementChild?.className).toBe("note-tags");
    expect(first?.lastElementChild?.previousElementSibling?.className).toBe("note-date");
    expect(second?.querySelector(".note-tags")).toBeNull();
    container.querySelectorAll<HTMLElement>(".note-tag")[1]?.click();
    expect(asked).toEqual(["filtrer #loisirs"]);
  });

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

  it("ouvre dans un nouvel onglet la note Cmd+cliquée", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, notes, null, actions);
    const item = container.querySelectorAll<HTMLButtonElement>(".note-item")[1] as HTMLElement;
    item.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
    expect(asked).toEqual(["placer a.md newTab"]);
  });

  it("n'interprète pas un titre comme du HTML", () => {
    const container = list();
    renderNotesList(
      container,
      [
        {
          path: "x.md",
          title: "<img src=x onerror=alert(1)>",
          modified: 0,
          pinned: false,
          tags: [],
        },
      ],
      null,
      noActions,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".note-title")?.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
  });

  it("vide la liste pour un espace de travail sans note", () => {
    const container = list();
    renderNotesList(container, notes, null, noActions);
    renderNotesList(container, [], null, noActions);
    expect(container.children).toHaveLength(0);
  });
});

describe("notes épinglées", () => {
  const withPinned = [
    { path: "p.md", title: "Épinglée", modified: 0, pinned: true, tags: [] },
    { path: "a.md", title: "Alpha", modified: 0, pinned: false, tags: [] },
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
  const menuButtons = () => [
    ...document.querySelectorAll<HTMLButtonElement>(".context-menu button"),
  ];
  const menuEntries = () => menuButtons().map((b) => b.textContent);

  it("un clic droit sur une note propose d'abord de l'ouvrir ailleurs ou de la fermer", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, withPinned, null, actions);
    rightClick(container.querySelectorAll(".note-item")[1] as Element);
    expect(menuEntries().slice(0, 4)).toEqual([
      "Ouvrir dans un nouvel onglet",
      "Ouvrir à gauche",
      "Ouvrir à droite",
      "Fermer",
    ]);
    menuButtons()[1]?.click();
    rightClick(container.querySelectorAll(".note-item")[1] as Element);
    menuButtons()[3]?.click();
    expect(asked).toEqual(["placer a.md left", "fermer a.md"]);
  });

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
    expect(menuEntries().slice(4)).toEqual([
      "Épingler",
      "Exporter…",
      "Imprimer…",
      "Copier en texte mis en forme",
      "Copier en Markdown",
      "Historique…",
      "Placer dans la corbeille",
    ]);
    expect(document.querySelector<HTMLElement>(".context-menu")?.style.left).toBe("12px");
    menuButtons()[4]?.click();
    expect(asked).toEqual(["épingler a.md"]);
  });

  it("un clic droit sur une note épinglée propose de la désépingler", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, withPinned, null, actions);
    rightClick(container.querySelector(".note-item") as Element);
    expect(menuEntries().slice(4)).toEqual([
      "Désépingler",
      "Exporter…",
      "Imprimer…",
      "Copier en texte mis en forme",
      "Copier en Markdown",
      "Historique…",
      "Placer dans la corbeille",
    ]);
    menuButtons()[4]?.click();
    expect(asked).toEqual(["désépingler p.md"]);
  });

  it("un clic droit sur une note propose de l'exporter", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, withPinned, null, actions);
    rightClick(container.querySelector(".note-item") as Element);
    menuButtons()[5]?.click();
    expect(asked).toEqual(["exporter p.md"]);
  });

  it("un clic droit sur une note propose de l'imprimer", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, withPinned, null, actions);
    rightClick(container.querySelectorAll(".note-item")[1] as Element);
    menuButtons()[6]?.click();
    expect(asked).toEqual(["imprimer a.md"]);
  });

  it("un clic droit sur une note propose de la copier en texte mis en forme", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, withPinned, null, actions);
    rightClick(container.querySelectorAll(".note-item")[1] as Element);
    menuButtons()[7]?.click();
    expect(asked).toEqual(["copier a.md"]);
  });

  it("un clic droit sur une note propose de la copier en Markdown", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, withPinned, null, actions);
    rightClick(container.querySelectorAll(".note-item")[1] as Element);
    menuButtons()[8]?.click();
    expect(asked).toEqual(["copier en Markdown a.md"]);
  });

  it("un clic droit sur une note propose son historique", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, withPinned, null, actions);
    rightClick(container.querySelectorAll(".note-item")[1] as Element);
    menuButtons()[9]?.click();
    expect(asked).toEqual(["historique a.md"]);
  });
});

describe("jeter une note", () => {
  const press = (target: Element, key: string) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  it("le clic droit propose de placer la note dans la corbeille", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, notes, null, actions);
    const item = container.querySelectorAll(".note-item")[1] as Element;
    item.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    [...document.querySelectorAll<HTMLButtonElement>(".context-menu button")].at(-1)?.click();
    expect(asked).toEqual(["jeter a.md"]);
  });

  it("les touches Effacer et Suppr placent la note choisie dans la corbeille", () => {
    const container = list();
    const { asked, actions } = recorded();
    renderNotesList(container, notes, null, actions);
    const [first, second] = container.querySelectorAll(".note-item");
    expect(press(first as Element, "Backspace").defaultPrevented).toBe(true);
    press(second as Element, "Delete");
    expect(press(second as Element, "a").defaultPrevented).toBe(false);
    expect(asked).toEqual(["jeter b.md", "jeter a.md"]);
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
