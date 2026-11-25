// Menu contextuel (clic droit) : quelques choix, fermé dès qu'on choisit, clique ailleurs ou tape Échap.

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
  /** Un dessin devant le nom (décoratif). */
  readonly icon?: SVGElement;
  /** Le raccourci du choix, écrit après son nom (décoratif : le nom du choix reste seul lu). */
  readonly shortcut?: string;
}

/** Comment le menu s'ouvre et se ferme. */
export interface MenuOptions {
  /** Ouvert au clavier : le premier choix possible a le focus. */
  readonly focusFirst?: boolean;
  /** Appelé à la fermeture, quelle qu'en soit la cause. */
  readonly onClose?: () => void;
  /** Si le focus était dans le menu quand il se ferme, il revient à cet élément plutôt que de se perdre. */
  readonly returnFocusTo?: HTMLElement;
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

/** Le nom du choix, avec son icône devant et son raccourci après. */
function extras(button: HTMLButtonElement, entry: MenuEntry): void {
  button.classList.add("with-extras");
  if (entry.icon !== undefined) button.append(entry.icon);
  const label = document.createElement("span");
  label.className = "context-menu-label";
  label.textContent = entry.label;
  button.append(label);
  if (entry.shortcut !== undefined) {
    const shortcut = document.createElement("span");
    shortcut.className = "context-menu-shortcut";
    shortcut.setAttribute("aria-hidden", "true");
    shortcut.textContent = entry.shortcut;
    button.append(shortcut);
  }
}

/** Le bouton d'un choix : son nom, sa pastille, sa coche, son séparateur. */
function entryButton(entry: MenuEntry): HTMLButtonElement {
  const button = document.createElement("button");
  button.setAttribute("role", "menuitem");
  if (entry.swatch !== undefined) {
    const swatch = document.createElement("span");
    swatch.className = "context-menu-swatch";
    swatch.style.setProperty("--swatch", `var(--palette-${entry.swatch})`);
    button.append(swatch);
  }
  if (entry.icon !== undefined || entry.shortcut !== undefined) extras(button, entry);
  else button.append(entry.label);
  if (entry.checked === true) {
    button.setAttribute("aria-checked", "true");
    button.setAttribute("role", "menuitemcheckbox");
    button.classList.add("checked");
  }
  if (entry.separatorBefore === true) button.classList.add("separated");
  button.disabled = entry.disabled === true;
  return button;
}

/**
 * Ouvre un menu à la position `x`, `y` de la fenêtre ; il remplace celui qui serait ouvert. `note`,
 * s'il y en a une, s'écrit sous les choix (pourquoi certains sont grisés). Les flèches ↑ et ↓ passent
 * d'un choix possible à l'autre, en boucle.
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
  const onPointer = (event: MouseEvent) => {
    if (!element.contains(event.target as Node)) close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(element, event.key === "ArrowDown" ? 1 : -1);
    }
  };
  function close() {
    const focusInside = element.contains(document.activeElement);
    element.remove();
    document.removeEventListener("mousedown", onPointer);
    document.removeEventListener("keydown", onKey);
    open = null;
    if (focusInside) options.returnFocusTo?.focus();
    options.onClose?.();
  }
  for (const entry of entries) {
    const button = entryButton(entry);
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
  // Un menu long, ouvert près d'un bord de la fenêtre, remonte ou se décale pour rester entier.
  const box = element.getBoundingClientRect();
  const overflow = (end: number, room: number) => Math.max(0, end - room);
  element.style.left = `${Math.max(0, x - overflow(box.right, window.innerWidth))}px`;
  element.style.top = `${Math.max(0, y - overflow(box.bottom, window.innerHeight))}px`;
  open = { element, close };
  if (options.focusFirst === true) moveFocus(element, 1);
}

/** Le focus passe au choix possible suivant (`1`) ou précédent (`-1`), en boucle ; au premier ou au dernier si rien n'a le focus. */
function moveFocus(menu: HTMLElement, step: 1 | -1): void {
  const choices = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  if (choices.length === 0) return;
  const at = choices.indexOf(document.activeElement as HTMLButtonElement);
  const first = step === 1 ? 0 : choices.length - 1;
  const next = at < 0 ? first : (at + step + choices.length) % choices.length;
  choices[next]?.focus();
}
