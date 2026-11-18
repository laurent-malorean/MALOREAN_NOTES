// Raccourcis clavier de la fenêtre, valables où que soit le curseur.

export type Shortcut =
  | "toggle-focus"
  | "toggle-typewriter"
  | "toggle-outline"
  | "toggle-full-screen"
  | "leave-full-screen"
  | "toggle-side-panels"
  | "open-settings"
  | "quick-open"
  | "command-palette"
  | "new-tab"
  | "close-tab"
  | "next-tab"
  | "previous-tab"
  | "split-column"
  | "new-note-from-template"
  | "daily-note"
  | "switch-workspace"
  | "export-note"
  | "print-note"
  | "copy-note";

const SHORTCUTS: Readonly<Record<string, Shortcut>> = {
  "cmd+shift+f": "toggle-focus",
  "cmd+shift+t": "toggle-typewriter",
  "cmd+shift+o": "toggle-outline",
  "cmd+ctrl+f": "toggle-full-screen",
  escape: "leave-full-screen",
  "cmd+ctrl+s": "toggle-side-panels",
  "cmd+,": "open-settings",
  "cmd+o": "quick-open",
  "cmd+shift+p": "command-palette",
  "cmd+t": "new-tab",
  "cmd+w": "close-tab",
  "ctrl+tab": "next-tab",
  "ctrl+shift+tab": "previous-tab",
  "cmd+ctrl+t": "split-column",
  "cmd+shift+n": "new-note-from-template",
  "cmd+shift+j": "daily-note",
  "cmd+shift+e": "switch-workspace",
  "cmd+e": "export-note",
  "cmd+p": "print-note",
  "cmd+shift+c": "copy-note",
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
