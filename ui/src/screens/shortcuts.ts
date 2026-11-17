// Raccourcis clavier de la fenêtre, valables où que soit le curseur.

export type Shortcut =
  | "toggle-focus"
  | "toggle-typewriter"
  | "toggle-outline"
  | "toggle-full-screen"
  | "leave-full-screen";

const SHORTCUTS: Readonly<Record<string, Shortcut>> = {
  "cmd+shift+f": "toggle-focus",
  "cmd+shift+t": "toggle-typewriter",
  "cmd+shift+o": "toggle-outline",
  "cmd+ctrl+f": "toggle-full-screen",
  escape: "leave-full-screen",
};

/** Ce qu'il faut savoir d'une touche pressée. */
export interface KeyPress {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
}

/** L'action demandée par la touche, ou rien. */
export function shortcutFor(press: KeyPress): Shortcut | null {
  const modifiers = `${press.metaKey ? "cmd+" : ""}${press.ctrlKey ? "ctrl+" : ""}${press.shiftKey ? "shift+" : ""}`;
  return SHORTCUTS[`${modifiers}${press.key.toLowerCase()}`] ?? null;
}
