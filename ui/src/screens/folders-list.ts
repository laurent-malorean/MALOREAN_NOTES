// Liste des dossiers : la racine (nom de l'espace de travail) puis l'arbre des dossiers, chacun
// avec son icône, et une flèche de dépliage devant ceux qui ont des sous-dossiers (la racine
// comprise, dès que l'espace de travail a un dossier).
// Créer, renommer (double-clic) et déplacer (glisser-déposer) passent par un champ ou un geste ;
// une note glissée depuis la liste se dépose aussi sur un dossier.
import { canMoveInto, folderTree } from "../state/folders";
import { hasSubfolders, visibleFolders } from "../state/folding";
import { showContextMenu } from "./context-menu";
import { type Dragged, dragged, startDragging, stopDragging } from "./dragging";
import { showFullNameWhenTruncated } from "./truncated-name";

/** Ce que l'utilisateur peut demander depuis la liste des dossiers. */
export interface FolderActions {
  readonly select: (path: string) => void;
  readonly create: (parent: string, name: string) => void;
  readonly rename: (path: string, name: string) => void;
  readonly move: (path: string, into: string) => void;
  readonly moveNote: (path: string, into: string) => void;
  readonly trashFolder: (path: string) => void;
  /** Plie le dossier, ou le déplie s'il est plié. */
  readonly fold: (path: string) => void;
}

/** Comment un dossier se montre : sans sous-dossier, plié ou déplié. */
type Folding = "none" | "folded" | "unfolded";

const ROOT = "";
const INPUT_CLASS = "folder-input";
const DROP_TARGET_CLASS = "drop-target";
const SVG = "http://www.w3.org/2000/svg";
const FOLDER_OUTLINE =
  "M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z";
const CHEVRON = "M9 6l6 6-6 6";

/** Un dessin au trait, de la couleur du texte ; sa taille et sa couleur viennent du thème. */
function drawing(className: string, path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS(SVG, "path");
  line.setAttribute("d", path);
  svg.append(line);
  return svg;
}

/** La flèche de dépliage : vide (mais à sa place) pour un dossier sans sous-dossier. */
function foldToggle(path: string, folding: Folding, actions: FolderActions) {
  const toggle = document.createElement("span");
  toggle.className = "folder-toggle";
  if (folding === "none") return toggle;
  toggle.append(drawing("folder-chevron", CHEVRON));
  // Ni choisir le dossier (clic), ni le renommer (double-clic).
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.fold(path);
  });
  toggle.addEventListener("dblclick", (event) => event.stopPropagation());
  return toggle;
}

/** Au clavier, → déplie et ← plie le dossier. */
function foldWithArrows(
  button: HTMLElement,
  path: string,
  folding: Folding,
  actions: FolderActions,
) {
  button.addEventListener("keydown", (event) => {
    const unfold = event.key === "ArrowRight" && folding === "folded";
    const fold = event.key === "ArrowLeft" && folding === "unfolded";
    if (unfold || fold) actions.fold(path);
  });
}

function item(
  path: string,
  name: string,
  depth: number,
  selected: string | null,
  folding: Folding,
  actions: FolderActions,
) {
  const button = document.createElement("button");
  button.className = "folder-item";
  button.dataset.path = path;
  button.classList.toggle("selected", path === selected);
  button.style.setProperty("--depth", String(depth));
  if (folding !== "none") button.setAttribute("aria-expanded", String(folding === "unfolded"));
  foldWithArrows(button, path, folding, actions);
  const label = document.createElement("span");
  label.className = "folder-name";
  label.textContent = name;
  showFullNameWhenTruncated(label);
  button.append(foldToggle(path, folding, actions), drawing("folder-icon", FOLDER_OUTLINE), label);
  // Le second clic d'un double-clic (renommer) ne rechoisit pas le dossier.
  button.addEventListener("click", (event) => {
    if (event.detail < 2) actions.select(path);
  });
  acceptDrops(button, path, actions);
  if (path !== ROOT) {
    button.draggable = true;
    button.addEventListener("dragstart", () => startDragging({ kind: "folder", path }));
    button.addEventListener("dragend", stopDragging);
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showContextMenu(event.clientX, event.clientY, [
        { label: "Placer dans la corbeille", run: () => actions.trashFolder(path) },
      ]);
    });
    button.addEventListener("dblclick", () => {
      const input = nameInput(
        name,
        (renamed) => actions.rename(path, renamed),
        () => input.replaceWith(label),
      );
      label.replaceWith(input);
      focus(input);
    });
  }
  return button;
}

/** Ce qui est glissé (dossier ou note), s'il peut aller dans le dossier `into` : ni là où il
 * est déjà, ni, pour un dossier, en lui-même ou dans ses sous-dossiers. */
function movableInto(into: string): Dragged | null {
  const moving = dragged();
  return moving !== null && canMoveInto(moving.path, into) ? moving : null;
}

function acceptDrops(target: HTMLElement, path: string, actions: FolderActions) {
  target.addEventListener("dragover", (event) => {
    if (movableInto(path) === null) return;
    event.preventDefault();
    target.classList.add(DROP_TARGET_CLASS);
  });
  target.addEventListener("dragleave", () => target.classList.remove(DROP_TARGET_CLASS));
  target.addEventListener("drop", (event) => {
    target.classList.remove(DROP_TARGET_CLASS);
    const moving = movableInto(path);
    if (moving === null) return;
    event.preventDefault();
    stopDragging();
    if (moving.kind === "folder") actions.move(moving.path, path);
    else actions.moveNote(moving.path, path);
  });
}

/**
 * Champ de saisie d'un nom de dossier : Entrée valide un nom non vide, Échap ou un clic
 * ailleurs annule ; dans les deux cas, `close` retire le champ.
 */
function nameInput(initial: string, onDone: (name: string) => void, close: () => void) {
  const input = document.createElement("input");
  input.className = INPUT_CLASS;
  input.value = initial;
  // Fermer deux fois (Entrée, puis la perte du focus qui suit) est sans effet.
  const finish = (name: string | null) => {
    close();
    if (name) onDone(name);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") finish(input.value.trim());
    if (event.key === "Escape") finish(null);
  });
  input.addEventListener("blur", () => finish(null));
  input.addEventListener("click", (event) => event.stopPropagation());
  return input;
}

/** Le champ prend le focus, son texte sélectionné pour être remplacé d'un coup. */
function focus(input: HTMLInputElement) {
  input.select();
}

/**
 * Affiche la colonne, avec le dossier `selected` en évidence (aucun : `null`) et les
 * sous-dossiers des dossiers `folded` cachés ; ne fait rien pendant qu'un nom est en cours de
 * saisie. Le dossier qui avait le focus le garde.
 */
export function renderFoldersList(
  container: HTMLElement,
  workspaceName: string,
  folders: readonly string[],
  selected: string | null,
  actions: FolderActions,
  folded: readonly string[],
): void {
  if (container.querySelector(`.${INPUT_CLASS}`)) return;
  const focused = container.querySelector<HTMLElement>(".folder-item:focus");
  const folding = (path: string): Folding => {
    if (!hasSubfolders(folders, path)) return "none";
    return folded.includes(path) ? "folded" : "unfolded";
  };
  container.replaceChildren(
    item(ROOT, workspaceName, 0, selected, folding(ROOT), actions),
    ...folderTree(visibleFolders(folders, folded)).map((f) =>
      item(f.path, f.name, f.depth, selected, folding(f.path), actions),
    ),
  );
  if (focused)
    container.querySelector<HTMLElement>(itemAt(focused.dataset.path as string))?.focus();
}

const itemAt = (path: string) => `.folder-item[data-path="${CSS.escape(path)}"]`;

/** Ouvre un champ pour nommer un nouveau dossier dans `parent`, en tête de la colonne. */
export function startFolderCreation(
  container: HTMLElement,
  parent: string,
  create: FolderActions["create"],
): void {
  const input = nameInput(
    "",
    (name) => create(parent, name),
    () => input.remove(),
  );
  input.placeholder = "Nom du dossier";
  container.prepend(input);
  focus(input);
}
