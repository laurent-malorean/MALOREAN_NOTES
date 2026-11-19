// Menu contextuel (clic droit) : quelques choix, fermé dès qu'on choisit, clique ailleurs ou tape Échap.

/** Un choix du menu. */
export interface MenuEntry {
  readonly label: string;
  readonly run: () => void;
  /** Montré grisé : on ne peut pas le choisir. */
  readonly disabled?: boolean;
}

let open: { readonly element: HTMLElement; readonly close: () => void } | null = null;

/** Ferme le menu ouvert, s'il y en a un. */
export function closeContextMenu(): void {
  open?.close();
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
    const button = document.createElement("button");
    button.setAttribute("role", "menuitem");
    button.textContent = entry.label;
    button.disabled = entry.disabled === true;
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
  open = { element, close };
}
