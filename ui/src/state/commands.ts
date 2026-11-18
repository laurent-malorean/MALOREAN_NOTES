// Palette de commandes : les actions de l'application, avec leur raccourci.
import { matching } from "./quick-open";

export type CommandId =
  | "quick-open"
  | "new-note"
  | "new-note-from-template"
  | "daily-note"
  | "new-folder"
  | "search-workspace"
  | "find-in-note"
  | "toggle-focus"
  | "toggle-typewriter"
  | "toggle-outline"
  | "toggle-full-screen"
  | "toggle-side-panels"
  | "new-tab"
  | "close-tab"
  | "next-tab"
  | "previous-tab"
  | "split-column"
  | "export-note"
  | "print-note"
  | "copy-note"
  | "copy-markdown"
  | "sort-notes"
  | "show-trash"
  | "open-settings"
  | "switch-workspace"
  | "add-workspace"
  | "rename-workspace"
  | "remove-workspace"
  | "rebuild-index";

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
  { id: "new-note-from-template", label: "Nouvelle note depuis un modèle", shortcut: "Cmd+Maj+N" },
  { id: "daily-note", label: "Note du jour", shortcut: "Cmd+Maj+J" },
  { id: "new-folder", label: "Nouveau dossier" },
  { id: "search-workspace", label: "Rechercher dans toutes les notes" },
  { id: "find-in-note", label: "Rechercher dans la note", shortcut: "Cmd+F" },
  { id: "toggle-focus", label: "Mode focus", shortcut: "Cmd+Maj+F" },
  { id: "toggle-typewriter", label: "Mode machine à écrire", shortcut: "Cmd+Maj+T" },
  { id: "toggle-outline", label: "Plan de la note", shortcut: "Cmd+Maj+O" },
  { id: "toggle-full-screen", label: "Plein écran", shortcut: "Ctrl+Cmd+F" },
  { id: "toggle-side-panels", label: "Panneaux latéraux", shortcut: "Ctrl+Cmd+S" },
  { id: "new-tab", label: "Nouvel onglet", shortcut: "Cmd+T" },
  { id: "close-tab", label: "Fermer l'onglet", shortcut: "Cmd+W" },
  { id: "next-tab", label: "Onglet suivant", shortcut: "Ctrl+Tab" },
  { id: "previous-tab", label: "Onglet précédent", shortcut: "Ctrl+Maj+Tab" },
  { id: "split-column", label: "Diviser la colonne", shortcut: "Ctrl+Cmd+T" },
  { id: "export-note", label: "Exporter…", shortcut: "Cmd+E" },
  { id: "print-note", label: "Imprimer…", shortcut: "Cmd+P" },
  { id: "copy-note", label: "Copier en texte mis en forme", shortcut: "Cmd+Maj+C" },
  { id: "copy-markdown", label: "Copier en Markdown", shortcut: "Ctrl+Cmd+C" },
  { id: "sort-notes", label: "Trier la liste" },
  { id: "show-trash", label: "Corbeille" },
  { id: "open-settings", label: "Réglages", shortcut: "Cmd+," },
  { id: "switch-workspace", label: "Changer d'espace de travail", shortcut: "Cmd+Maj+E" },
  { id: "add-workspace", label: "Ajouter un espace de travail" },
  { id: "rename-workspace", label: "Renommer l'espace de travail" },
  { id: "remove-workspace", label: "Retirer un espace de travail" },
  { id: "rebuild-index", label: "Reconstruire l'index" },
];

/** Les commandes dont le nom correspond à ce qui est tapé ; celles qui commencent par lui d'abord. */
export function matchingCommands(query: string): Command[] {
  return matching(COMMANDS, query, (command) => command.label);
}
