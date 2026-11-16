import { describe, expect, it } from "vitest";
import { startDragging, stopDragging } from "./dragging";
import { type FolderActions, renderFoldersList, startFolderCreation } from "./folders-list";

type Call = readonly [string, ...string[]];

function column(
  folders: readonly string[] = ["Perso", "Travail", "Travail/Réunions"],
  selected = "",
) {
  const container = document.createElement("nav");
  document.body.replaceChildren(container);
  const calls: Call[] = [];
  const actions: FolderActions = {
    select: (path) => calls.push(["select", path]),
    create: (parent, name) => calls.push(["create", parent, name]),
    rename: (path, name) => calls.push(["rename", path, name]),
    move: (path, into) => calls.push(["move", path, into]),
    moveNote: (path, into) => calls.push(["moveNote", path, into]),
  };
  renderFoldersList(container, "Notes", folders, selected, actions);
  return { container, calls, actions };
}

const item = (container: HTMLElement, path: string) =>
  container.querySelector<HTMLElement>(`.folder-item[data-path="${path}"]`) as HTMLElement;
const names = (container: HTMLElement) =>
  [...container.querySelectorAll(".folder-name")].map((n) => n.textContent);
const input = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>("input.folder-input") as HTMLInputElement;
const press = (target: HTMLElement, key: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
const drag = (target: HTMLElement, type: string) => {
  const event = new DragEvent(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe("colonne des dossiers", () => {
  it("affiche la bibliothèque puis l'arbre des dossiers, indenté", () => {
    const { container } = column();
    expect(names(container)).toEqual(["Notes", "Perso", "Travail", "Réunions"]);
    expect(item(container, "Travail/Réunions").style.getPropertyValue("--depth")).toBe("2");
    expect(item(container, "").style.getPropertyValue("--depth")).toBe("0");
  });

  it("met en avant le dossier affiché", () => {
    const { container } = column(["Perso"], "Perso");
    expect(item(container, "Perso").classList.contains("selected")).toBe(true);
    expect(item(container, "").classList.contains("selected")).toBe(false);
  });

  it("un clic choisit le dossier, pas le second clic d'un double-clic", () => {
    const { container, calls } = column();
    item(container, "Travail").click();
    item(container, "").click();
    item(container, "Perso").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
    expect(calls).toEqual([
      ["select", "Travail"],
      ["select", ""],
    ]);
  });
});

describe("créer un dossier", () => {
  it("demande son nom en tête de colonne, et le crée avec Entrée", () => {
    const { container, calls, actions } = column();
    startFolderCreation(container, "Travail", actions.create);
    expect(container.firstElementChild).toBe(input(container));
    expect(document.activeElement).toBe(input(container));
    expect(input(container).placeholder).toBe("Nom du dossier");
    expect(input(container).value).toBe("");
    press(input(container), "a");
    expect(input(container)).not.toBeNull();
    input(container).value = "  Projets ";
    press(input(container), "Enter");
    expect(calls).toEqual([["create", "Travail", "Projets"]]);
    expect(input(container)).toBeNull();
  });

  it("n'accepte pas un nom vide", () => {
    const { container, calls, actions } = column();
    startFolderCreation(container, "", actions.create);
    input(container).value = "   ";
    press(input(container), "Enter");
    expect(calls).toEqual([]);
  });

  it("abandonne avec Échap ou en cliquant ailleurs", () => {
    const { container, calls, actions } = column();
    startFolderCreation(container, "", actions.create);
    input(container).value = "x";
    press(input(container), "Escape");
    startFolderCreation(container, "", actions.create);
    input(container).blur();
    expect(calls).toEqual([]);
    expect(input(container)).toBeNull();
  });

  it("garde la saisie quand la colonne est redessinée pendant qu'on tape", () => {
    const { container, actions } = column();
    startFolderCreation(container, "", actions.create);
    input(container).value = "Pro";
    renderFoldersList(container, "Notes", ["Autre"], "", actions);
    expect(input(container).value).toBe("Pro");
  });
});

describe("renommer un dossier", () => {
  it("un double-clic ouvre son nom à la saisie ; Entrée renomme", () => {
    const { container, calls } = column();
    item(container, "Travail/Réunions").dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
    expect(input(container).value).toBe("Réunions");
    expect(document.activeElement).toBe(input(container));
    expect([input(container).selectionStart, input(container).selectionEnd]).toEqual([0, 8]);
    input(container).click();
    input(container).value = "Comptes rendus";
    press(input(container), "Enter");
    expect(calls).toEqual([["rename", "Travail/Réunions", "Comptes rendus"]]);
    expect(names(container)).toContain("Réunions");
  });

  it("Échap rend le nom intact", () => {
    const { container, calls } = column();
    item(container, "Perso").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    press(input(container), "Escape");
    press(item(container, "Perso"), "Enter");
    expect(calls).toEqual([]);
    expect(names(container)).toContain("Perso");
  });

  it("la bibliothèque elle-même ne se renomme pas", () => {
    const { container } = column();
    item(container, "").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(input(container)).toBeNull();
  });
});

describe("déplacer un dossier", () => {
  it("glisser un dossier sur un autre l'y déplace", () => {
    const { container, calls } = column();
    expect(item(container, "Perso").draggable).toBe(true);
    drag(item(container, "Perso"), "dragstart");
    const over = drag(item(container, "Travail"), "dragover");
    expect(over.defaultPrevented).toBe(true);
    expect(item(container, "Travail").classList.contains("drop-target")).toBe(true);
    const dropped = drag(item(container, "Travail"), "drop");
    expect(dropped.defaultPrevented).toBe(true);
    expect(item(container, "Travail").classList.contains("drop-target")).toBe(false);
    expect(calls).toEqual([["move", "Perso", "Travail"]]);
  });

  it("refuse de le poser en lui-même, dans ses sous-dossiers ou là où il est", () => {
    const { container, calls } = column();
    drag(item(container, "Travail"), "dragstart");
    for (const target of ["Travail", "Travail/Réunions", ""]) {
      expect(drag(item(container, target), "dragover").defaultPrevented).toBe(false);
      expect(drag(item(container, target), "drop").defaultPrevented).toBe(false);
    }
    expect(item(container, "").classList.contains("drop-target")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("le pose à la racine", () => {
    const { container, calls } = column();
    drag(item(container, "Travail/Réunions"), "dragstart");
    drag(item(container, ""), "drop");
    expect(calls).toEqual([["move", "Travail/Réunions", ""]]);
  });

  it("oublie le glissement terminé ailleurs, et la cible quittée", () => {
    const { container, calls } = column();
    drag(item(container, "Perso"), "dragstart");
    drag(item(container, "Travail"), "dragover");
    drag(item(container, "Travail"), "dragleave");
    expect(item(container, "Travail").classList.contains("drop-target")).toBe(false);
    drag(item(container, "Perso"), "dragend");
    expect(drag(item(container, "Travail"), "dragover").defaultPrevented).toBe(false);
    drag(item(container, "Travail"), "drop");
    expect(calls).toEqual([]);
  });

  it("oublie le dossier une fois déposé, même si sa fin de glissement ne vient jamais", () => {
    const { container, calls } = column();
    drag(item(container, "Perso"), "dragstart");
    drag(item(container, "Travail"), "drop");
    drag(item(container, "Travail/Réunions"), "drop");
    expect(calls).toEqual([["move", "Perso", "Travail"]]);
  });

  it("la bibliothèque elle-même ne se déplace pas", () => {
    const { container } = column();
    expect(item(container, "").draggable).toBe(false);
  });
});

describe("déplacer une note dans un dossier", () => {
  it("poser une note sur un dossier l'y déplace", () => {
    const { container, calls } = column();
    startDragging({ kind: "note", path: "Perso/courses.md" });
    expect(drag(item(container, "Travail"), "dragover").defaultPrevented).toBe(true);
    expect(item(container, "Travail").classList.contains("drop-target")).toBe(true);
    expect(drag(item(container, "Travail"), "drop").defaultPrevented).toBe(true);
    expect(calls).toEqual([["moveNote", "Perso/courses.md", "Travail"]]);
  });

  it("la pose à la racine", () => {
    const { container, calls } = column();
    startDragging({ kind: "note", path: "Travail/Réunions/lundi.md" });
    drag(item(container, ""), "drop");
    expect(calls).toEqual([["moveNote", "Travail/Réunions/lundi.md", ""]]);
  });

  it("ne fait rien sur le dossier où elle se trouve déjà", () => {
    const { container, calls } = column();
    startDragging({ kind: "note", path: "Perso/courses.md" });
    expect(drag(item(container, "Perso"), "dragover").defaultPrevented).toBe(false);
    expect(drag(item(container, "Perso"), "drop").defaultPrevented).toBe(false);
    stopDragging();
    startDragging({ kind: "note", path: "courses.md" });
    expect(drag(item(container, ""), "drop").defaultPrevented).toBe(false);
    stopDragging();
    expect(calls).toEqual([]);
  });

  it("oublie la note une fois déposée", () => {
    const { container, calls } = column();
    startDragging({ kind: "note", path: "courses.md" });
    drag(item(container, "Perso"), "drop");
    drag(item(container, "Travail"), "drop");
    expect(calls).toEqual([["moveNote", "courses.md", "Perso"]]);
  });
});
