// Palette de commandes : les actions de l'application, avec leur raccourci.
import { matching } from "./quick-open";

export type CommandId =
  | "quick-open"
  | "new-note"
  | "new-folder"
  | "search-library"
  | "find-in-note"
  | "toggle-focus"
  | "toggle-typewriter"
  | "toggle-outline"
  | "toggle-full-screen"
  | "new-tab"
  | "close-tab"
  | "next-tab"
  | "previous-tab"
  | "split-column"
  | "show-trash"
  | "open-settings"
  | "choose-library";

export interface Command {
  readonly id: CommandId;
  readonly label: string;
  /** Le raccourci, écrit comme dans les menus du Mac. */
  readonly shortcut?: string;
}

/** Les commandes, dans l'ordre de la palette. Une nouvelle action s'ajoute ici. */
export const COMMANDS: readonly Command[] = [
  { id: "quick-open", label: "Ouvrir une note", shortcut: "Cmd+O" },
  { id: "new-note", label: "Nouvelle note" },
  { id: "new-folder", label: "Nouveau dossier" },
  { id: "search-library", label: "Rechercher dans toutes les notes" },
  { id: "find-in-note", label: "Rechercher dans la note", shortcut: "Cmd+F" },
  { id: "toggle-focus", label: "Mode focus", shortcut: "Cmd+Maj+F" },
  { id: "toggle-typewriter", label: "Mode machine à écrire", shortcut: "Cmd+Maj+T" },
  { id: "toggle-outline", label: "Plan de la note", shortcut: "Cmd+Maj+O" },
  { id: "toggle-full-screen", label: "Plein écran", shortcut: "Ctrl+Cmd+F" },
  { id: "new-tab", label: "Nouvel onglet", shortcut: "Cmd+T" },
  { id: "close-tab", label: "Fermer l'onglet", shortcut: "Cmd+W" },
  { id: "next-tab", label: "Onglet suivant", shortcut: "Ctrl+Tab" },
  { id: "previous-tab", label: "Onglet précédent", shortcut: "Ctrl+Maj+Tab" },
  { id: "split-column", label: "Diviser la colonne", shortcut: "Ctrl+Cmd+T" },
  { id: "show-trash", label: "Corbeille" },
  { id: "open-settings", label: "Réglages", shortcut: "Cmd+," },
  { id: "choose-library", label: "Changer de dossier de notes" },
];

/** Les commandes dont le nom correspond à ce qui est tapé ; celles qui commencent par lui d'abord. */
export function matchingCommands(query: string): Command[] {
  return matching(COMMANDS, query, (command) => command.label);
}
