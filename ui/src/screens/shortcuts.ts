// Raccourcis clavier de la fenêtre, valables où que soit le curseur.

export type Shortcut = "toggle-focus";

/** Ce qu'il faut savoir d'une touche pressée. */
export interface KeyPress {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
}

/** L'action demandée par la touche, ou rien. */
export function shortcutFor(press: KeyPress): Shortcut | null {
  const letter = press.key.toLowerCase();
  if (letter === "f" && press.metaKey && press.shiftKey && !press.ctrlKey) return "toggle-focus";
  return null;
}
