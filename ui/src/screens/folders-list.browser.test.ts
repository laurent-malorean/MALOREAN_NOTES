import { afterEach, describe, expect, it } from "vitest";
import { closeContextMenu } from "./context-menu";
import { startDragging, stopDragging } from "./dragging";
import { type FolderActions, renderFoldersList, startFolderCreation } from "./folders-list";
import "../theme.css";
import "../style.css";

type Call = readonly [string, ...string[]];

function column(
  folders: readonly string[] = ["Perso", "Travail", "Travail/Réunions"],
  selected: string | null = "",
  folded: readonly string[] = [],
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
    trashFolder: (path) => calls.push(["trashFolder", path]),
    fold: (path) => calls.push(["fold", path]),
  };
  renderFoldersList(container, "Notes", folders, selected, actions, folded);
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
  it("affiche l'espace de travail puis l'arbre des dossiers, indenté", () => {
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

describe("nom de dossier coupé", () => {
  it("au survol, un nom coupé montre son nom complet", () => {
    const { container } = column(["comptabilité/impôts/déclarations de l'année"]);
    container.style.width = "120px";
    const deep = container.querySelector(".folder-item:last-child .folder-name") as HTMLElement;
    deep.dispatchEvent(new PointerEvent("pointerenter"));
    expect(deep.title).toBe("déclarations de l'année");
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
    renderFoldersList(container, "Notes", ["Autre"], "", actions, []);
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

  it("l'espace de travail lui-même ne se renomme pas", () => {
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

  it("l'espace de travail lui-même ne se déplace pas", () => {
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

describe("jeter un dossier", () => {
  afterEach(() => closeContextMenu());
  const rightClick = (target: HTMLElement) => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  it("le clic droit sur un dossier propose de le placer dans la corbeille", () => {
    const { container, calls } = column();
    expect(rightClick(item(container, "Travail")).defaultPrevented).toBe(true);
    const entries = [...document.querySelectorAll<HTMLButtonElement>(".context-menu button")];
    expect(entries.map((e) => e.textContent)).toEqual(["Placer dans la corbeille"]);
    entries[0]?.click();
    expect(calls).toEqual([["trashFolder", "Travail"]]);
  });

  it("l'espace de travail lui-même n'a pas ce menu", () => {
    const { container } = column();
    expect(rightClick(item(container, "")).defaultPrevented).toBe(false);
    expect(document.querySelector(".context-menu")).toBeNull();
  });

  it("aucun dossier n'est choisi quand la corbeille est affichée", () => {
    const { container } = column(["Travail"], null);
    expect(container.querySelector(".folder-item.selected")).toBeNull();
  });
});

describe("icônes et dossiers pliés", () => {
  const FOLDERS = ["Perso", "Travail", "Travail/Réunions", "Travail/Réunions/2026"];
  const toggle = (container: HTMLElement, path: string) =>
    item(container, path).querySelector<HTMLElement>(".folder-toggle") as HTMLElement;
  const arrow = (container: HTMLElement, path: string) =>
    toggle(container, path).querySelector<SVGSVGElement>("svg.folder-chevron");

  it("chaque dossier a son icône de dossier, dessinée de la couleur du texte", () => {
    const { container } = column(FOLDERS);
    for (const path of ["", ...FOLDERS]) {
      const icon = item(container, path).querySelector("svg.folder-icon");
      expect(icon?.getAttribute("stroke")).toBe("currentColor");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("l'icône et la flèche sont des dessins au trait, à l'échelle de leur place", () => {
    const { container } = column(FOLDERS);
    const icon = item(container, "Travail").querySelector("svg.folder-icon") as SVGSVGElement;
    for (const drawing of [icon, arrow(container, "Travail") as SVGSVGElement]) {
      expect(drawing.viewBox.baseVal.width).toBe(24);
      const line = drawing.querySelector("path") as SVGPathElement;
      expect(line.getBBox().width).toBeGreaterThan(0);
      expect(getComputedStyle(line).fill).toBe("none");
    }
  });

  it("une flèche devant les seuls dossiers qui ont des sous-dossiers ; les autres gardent sa place", () => {
    const { container } = column(FOLDERS);
    expect(arrow(container, "Travail")).not.toBeNull();
    expect(arrow(container, "Travail/Réunions")).not.toBeNull();
    for (const path of ["Perso", "Travail/Réunions/2026"]) {
      expect(toggle(container, path)).not.toBeNull();
      expect(arrow(container, path)).toBeNull();
      expect(item(container, path).hasAttribute("aria-expanded")).toBe(false);
    }
    const name = item(container, "Perso").querySelector(".folder-name") as HTMLElement;
    const otherName = item(container, "Travail").querySelector(".folder-name") as HTMLElement;
    expect(name.getBoundingClientRect().left).toBe(otherName.getBoundingClientRect().left);
    expect(item(container, "Travail").textContent).toBe("Travail");
  });

  it("la racine a sa flèche dès que l'espace de travail a un dossier ; pliée, elle les cache tous", () => {
    const { container, calls } = column(["archives"]);
    expect(arrow(container, "")).not.toBeNull();
    expect(item(container, "").getAttribute("aria-expanded")).toBe("true");
    toggle(container, "").click();
    expect(calls).toEqual([["fold", ""]]);
    const folded = column(["archives"], "", [""]).container;
    expect(names(folded)).toEqual(["Notes"]);
    expect(item(folded, "").getAttribute("aria-expanded")).toBe("false");
    const empty = column([]).container;
    expect(arrow(empty, "")).toBeNull();
    expect(item(empty, "").hasAttribute("aria-expanded")).toBe(false);
  });

  it("un dossier plié cache ses sous-dossiers ; sa flèche dit s'il est déplié", () => {
    const { container } = column(FOLDERS, "", ["Travail/Réunions"]);
    expect(names(container)).toEqual(["Notes", "Perso", "Travail", "Réunions"]);
    expect(item(container, "Travail").getAttribute("aria-expanded")).toBe("true");
    expect(item(container, "Travail/Réunions").getAttribute("aria-expanded")).toBe("false");
    column(FOLDERS, "", ["Travail"]);
    expect(names(document.querySelector("nav") as HTMLElement)).toEqual([
      "Notes",
      "Perso",
      "Travail",
    ]);
  });

  it("la flèche tourne vers le bas quand le dossier est déplié", () => {
    const { container } = column(FOLDERS, "", ["Travail/Réunions"]);
    const turn = (path: string) => getComputedStyle(toggle(container, path)).transform;
    expect(turn("Travail/Réunions")).toBe("none");
    expect(turn("Travail")).not.toBe("none");
  });

  it("un clic sur la flèche plie ou déplie le dossier, sans le choisir ni le renommer", () => {
    const { container, calls } = column(FOLDERS);
    toggle(container, "Travail").click();
    toggle(container, "Travail").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(calls).toEqual([["fold", "Travail"]]);
    expect(input(container)).toBeNull();
  });

  it("au clavier, → déplie et ← plie le dossier qui a le focus", () => {
    const { container, calls } = column(FOLDERS, "", ["Travail/Réunions"]);
    press(item(container, "Travail/Réunions"), "ArrowRight");
    press(item(container, "Travail/Réunions"), "ArrowLeft");
    press(item(container, "Travail"), "ArrowLeft");
    press(item(container, "Travail"), "ArrowRight");
    press(item(container, "Perso"), "ArrowLeft");
    press(item(container, "Perso"), "ArrowRight");
    press(item(container, "Travail"), "Enter");
    press(item(container, "Travail/Réunions"), "Enter");
    expect(calls).toEqual([
      ["fold", "Travail/Réunions"],
      ["fold", "Travail"],
    ]);
  });

  it("le dossier qui avait le focus le garde quand la colonne est redessinée", () => {
    const { container, actions } = column(FOLDERS);
    item(container, "Travail").focus();
    renderFoldersList(container, "Notes", FOLDERS, "", actions, ["Travail"]);
    expect(document.activeElement).toBe(item(container, "Travail"));
    (document.activeElement as HTMLElement).blur();
    renderFoldersList(container, "Notes", FOLDERS, "", actions, []);
    expect(document.activeElement).toBe(document.body);
  });

  it("un dossier qui avait le focus et qu'un pli cache le perd, sans erreur", () => {
    const { container, actions } = column(FOLDERS);
    item(container, "Travail/Réunions").focus();
    renderFoldersList(container, "Notes", FOLDERS, "", actions, ["Travail"]);
    expect(names(container)).toEqual(["Notes", "Perso", "Travail"]);
  });

  it("glisser une note sur un dossier qui a des sous-dossiers l'y dépose toujours", () => {
    const { container, calls } = column(FOLDERS, "", ["Travail"]);
    startDragging({ kind: "note", path: "courses.md" });
    expect(drag(toggle(container, "Travail"), "dragover").defaultPrevented).toBe(true);
    drag(toggle(container, "Travail"), "drop");
    expect(calls).toEqual([["moveNote", "courses.md", "Travail"]]);
  });
});
