// Menu contextuel (clic droit) : quelques choix, fermé dès qu'on choisit, clique ailleurs ou tape Échap.
// Chaque choix a son icône devant son nom, toutes dans une même colonne (vide pour un choix sans icône).
import { type AppIcon, appIcon } from "./app-icons";

/** Un choix du menu. */
export interface MenuEntry {
  readonly label: string;
  readonly run: () => void;
  /** Montré grisé : on ne peut pas le choisir. */
  readonly disabled?: boolean;
  /** Une pastille de cette couleur de la palette des cartes mentales devant le nom. */
  readonly swatch?: string;
  /** Le choix est celui en vigueur : une coche devant. */
  readonly checked?: boolean;
  /** Un séparateur au-dessus de ce choix. */
  readonly separatorBefore?: boolean;
  /**
   * Avec `checked` : la coche se montre devant le nom, et ce nom d'état (« ouvert ») la double pour les
   * lecteurs d'écran ; les autres choix du menu s'alignent sur le nom.
   */
  readonly stateName?: string;
  /** Le dessin du jeu d'icônes de l'application devant le nom (décoratif) ; sans lui, la colonne reste vide. */
  readonly icon?: AppIcon;
  /** Le raccourci du choix, écrit après son nom (décoratif : le nom du choix reste seul lu). */
  readonly shortcut?: string;
}

/** Comment s'ouvre le menu. */
export interface MenuOptions {
  /** Le menu s'ouvre au-dessus du point donné (son bord bas est en `y`), pas en dessous. */
  readonly above?: boolean;
  /** Largeur minimale du menu, en pixels (celle de la barre qui l'ouvre). */
  readonly minWidth?: number;
  /** Le clavier entre dans le menu (le choix coché, sinon le premier) et le rend à sa fermeture. */
  readonly focus?: boolean;
  /** Avec `focus` : le bouton qui reprend le focus à la fermeture (sinon celui qui l'avait à l'ouverture). */
  readonly opener?: HTMLElement;
  /** Appelé à la fermeture, quelle qu'en soit la cause. */
  readonly onClose?: () => void;
}

let open: { readonly element: HTMLElement; readonly close: () => void } | null = null;

/** Un menu est-il ouvert ? */
export function contextMenuOpen(): boolean {
  return open !== null;
}

/** Ferme le menu ouvert, s'il y en a un. */
export function closeContextMenu(): void {
  open?.close();
}

/** La colonne de la coche : la coche du choix en vigueur, vide pour les autres. */
function checkColumn(mark: string): HTMLSpanElement {
  const column = document.createElement("span");
  column.className = "context-menu-check";
  column.setAttribute("aria-hidden", "true");
  column.textContent = mark;
  return column;
}

/** Le nom d'état, lu par les lecteurs d'écran et invisible à l'écran. */
function stateSpan(name: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "context-menu-state";
  span.textContent = ` ${name}`;
  return span;
}

/** La colonne des icônes : le dessin du choix, sa pastille, ou rien (la colonne garde alors sa place). */
function iconColumn(entry: MenuEntry): HTMLSpanElement {
  const column = document.createElement("span");
  column.className = "context-menu-icon";
  column.setAttribute("aria-hidden", "true");
  if (entry.swatch !== undefined) {
    const swatch = document.createElement("span");
    swatch.className = "context-menu-swatch";
    swatch.style.setProperty("--swatch", `var(--palette-${entry.swatch})`);
    column.append(swatch);
  } else if (entry.icon !== undefined) column.append(appIcon(entry.icon));
  return column;
}

/** Le raccourci du choix, écrit après son nom. */
function shortcutSpan(shortcut: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "context-menu-shortcut";
  span.setAttribute("aria-hidden", "true");
  span.textContent = shortcut;
  return span;
}

/** Ce qui s'aligne d'un choix à l'autre : la colonne de la coche (nom d'état) et celle des icônes. */
interface Columns {
  readonly check: boolean;
  readonly icon: boolean;
}

/** Le bouton d'un choix : sa coche, son icône ou sa pastille, son nom, son raccourci, son séparateur. */
function entryButton(entry: MenuEntry, columns: Columns): HTMLButtonElement {
  const button = document.createElement("button");
  button.setAttribute("role", "menuitem");
  button.classList.add("with-extras");
  if (columns.check)
    button.append(checkColumn(entry.checked === true && entry.stateName !== undefined ? "✓" : ""));
  if (columns.icon) button.append(iconColumn(entry));
  const label = document.createElement("span");
  label.className = "context-menu-label";
  label.textContent = entry.label;
  button.append(label);
  if (entry.shortcut !== undefined) button.append(shortcutSpan(entry.shortcut));
  if (entry.checked === true) {
    button.setAttribute("aria-checked", "true");
    button.setAttribute("role", "menuitemcheckbox");
    if (entry.stateName === undefined) button.classList.add("checked");
    else button.append(stateSpan(entry.stateName));
  }
  if (entry.separatorBefore === true) button.classList.add("separated");
  button.disabled = entry.disabled === true;
  return button;
}

/** Les choix qu'on peut faire (pas les grisés), dans l'ordre. */
function choices(element: HTMLElement): HTMLButtonElement[] {
  return [...element.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
}

/** Déplace le focus : `step` choix plus loin, en boucle ; sans choix visé, le premier (ou le dernier en montant). */
function moveFocus(element: HTMLElement, step: 1 | -1): void {
  const list = choices(element);
  const at = list.findIndex((button) => button === document.activeElement);
  const next =
    at === -1 ? (step === 1 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
  list[next]?.focus();
}

/** Les touches qui parcourent le menu ; vrai si la touche a été prise. */
function navigate(element: HTMLElement, key: string): boolean {
  const list = choices(element);
  if (key === "ArrowDown") moveFocus(element, 1);
  else if (key === "ArrowUp") moveFocus(element, -1);
  else if (key === "Home") list[0]?.focus();
  else if (key === "End") list[list.length - 1]?.focus();
  else return false;
  return true;
}

/** Place le menu : `x`, `y` est son coin haut-gauche, ou son coin bas-gauche s'il s'ouvre au-dessus ; il reste entier dans la fenêtre. */
function place(element: HTMLElement, x: number, y: number, above: boolean): void {
  const box = element.getBoundingClientRect();
  const overflow = (end: number, room: number) => Math.max(0, end - room);
  const top = above ? y - box.height : y;
  element.style.left = `${Math.max(0, x - overflow(box.right, window.innerWidth))}px`;
  element.style.top = `${Math.max(0, top - overflow(top + box.height, window.innerHeight))}px`;
}

/**
 * Ouvre un menu à la position `x`, `y` de la fenêtre ; il remplace celui qui serait ouvert. `note`,
 * s'il y en a une, s'écrit sous les choix (pourquoi certains sont grisés). Les flèches parcourent les
 * choix, Échap ferme.
 */
export function showContextMenu(
  x: number,
  y: number,
  entries: readonly MenuEntry[],
  note?: string,
  options: MenuOptions = {},
): void {
  closeContextMenu();
  const element = document.createElement("div");
  element.className = "context-menu";
  element.setAttribute("role", "menu");
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  if (options.minWidth !== undefined) element.style.minWidth = `${options.minWidth}px`;
  const opener = options.focus === true ? (options.opener ?? document.activeElement) : null;
  const onPointer = (event: MouseEvent) => {
    if (!element.contains(event.target as Node)) close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
    else if (navigate(element, event.key)) event.preventDefault();
  };
  function close() {
    const active = document.activeElement;
    const keptFocus = active === document.body || element.contains(active);
    element.remove();
    document.removeEventListener("mousedown", onPointer);
    document.removeEventListener("keydown", onKey);
    open = null;
    if (keptFocus && opener instanceof HTMLElement) opener.focus();
    options.onClose?.();
  }
  const columns = {
    check: entries.some((entry) => entry.stateName !== undefined),
    icon: entries.some((entry) => entry.icon !== undefined || entry.swatch !== undefined),
  };
  for (const entry of entries) {
    const button = entryButton(entry, columns);
    button.addEventListener("click", () => {
      close();
      entry.run();
    });
    element.append(button);
  }
  if (note !== undefined) {
    const paragraph = document.createElement("p");
    paragraph.className = "context-menu-note";
    paragraph.textContent = note;
    element.append(paragraph);
  }
  document.addEventListener("mousedown", onPointer);
  document.addEventListener("keydown", onKey);
  document.body.append(element);
  place(element, x, y, options.above === true);
  if (options.focus === true) {
    const list = choices(element);
    (list.find((button) => button.getAttribute("aria-checked") === "true") ?? list[0])?.focus();
  }
  open = { element, close };
}
