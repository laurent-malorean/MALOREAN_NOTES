// Colonne des dossiers : la racine (nom de la bibliothèque) puis l'arbre des dossiers.
// Créer, renommer (double-clic) et déplacer (glisser-déposer) passent par un champ ou un geste ;
// une note glissée depuis la liste se dépose aussi sur un dossier.
import { canMoveInto, folderTree } from "../state/folders";
import { type Dragged, dragged, startDragging, stopDragging } from "./dragging";

/** Ce que l'utilisateur peut demander depuis la colonne des dossiers. */
export interface FolderActions {
  readonly select: (path: string) => void;
  readonly create: (parent: string, name: string) => void;
  readonly rename: (path: string, name: string) => void;
  readonly move: (path: string, into: string) => void;
  readonly moveNote: (path: string, into: string) => void;
}

const ROOT = "";
const INPUT_CLASS = "folder-input";
const DROP_TARGET_CLASS = "drop-target";

function item(path: string, name: string, depth: number, selected: string, actions: FolderActions) {
  const button = document.createElement("button");
  button.className = "folder-item";
  button.dataset.path = path;
  button.classList.toggle("selected", path === selected);
  button.style.setProperty("--depth", String(depth));
  const label = document.createElement("span");
  label.className = "folder-name";
  label.textContent = name;
  button.append(label);
  // Le second clic d'un double-clic (renommer) ne rechoisit pas le dossier.
  button.addEventListener("click", (event) => {
    if (event.detail < 2) actions.select(path);
  });
  acceptDrops(button, path, actions);
  if (path !== ROOT) {
    button.draggable = true;
    button.addEventListener("dragstart", () => startDragging({ kind: "folder", path }));
    button.addEventListener("dragend", stopDragging);
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

/** Affiche la colonne ; ne fait rien pendant qu'un nom est en cours de saisie. */
export function renderFoldersList(
  container: HTMLElement,
  libraryName: string,
  folders: readonly string[],
  selected: string,
  actions: FolderActions,
): void {
  if (container.querySelector(`.${INPUT_CLASS}`)) return;
  container.replaceChildren(
    item(ROOT, libraryName, 0, selected, actions),
    ...folderTree(folders).map((f) => item(f.path, f.name, f.depth, selected, actions)),
  );
}

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
