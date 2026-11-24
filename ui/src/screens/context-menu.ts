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
}

let open: { readonly element: HTMLElement; readonly close: () => void } | null = null;

/** Ferme le menu ouvert, s'il y en a un. */
export function closeContextMenu(): void {
  open?.close();
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
  button.append(entry.label);
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
 * s'il y en a une, s'écrit sous les choix (pourquoi certains sont grisés).
 */
export function showContextMenu(
  x: number,
  y: number,
  entries: readonly MenuEntry[],
  note?: string,
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
  };
  function close() {
    element.remove();
    document.removeEventListener("mousedown", onPointer);
    document.removeEventListener("keydown", onKey);
    open = null;
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
}
