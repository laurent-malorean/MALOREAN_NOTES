// Palette de commandes : les actions de l'application, avec leur raccourci.
import { matching } from "./quick-open";

export type CommandId =
  | "quick-open"
  | "open-link"
  | "new-note"
  | "new-note-from-template"
  | "daily-note"
  | "new-research-notebook"
  | "new-mind-map"
  | "new-canvas"
  | "new-crm"
  | "new-agenda-12"
  | "canvas-fit"
  | "canvas-go-to-group"
  | "canvas-export-image"
  | "new-folder"
  | "search-workspace"
  | "find-in-note"
  | "find-and-replace"
  | FormatCommandId
  | "insert-date"
  | "correct-selection"
  | "rephrase-selection"
  | "summarize-selection"
  | "voice-input"
  | "toggle-focus"
  | "toggle-typewriter"
  | "toggle-outline"
  | "toggle-related-notes"
  | "toggle-claude-column"
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
  | "note-history"
  | "sort-notes"
  | "show-trash"
  | "open-settings"
  | "about"
  | "switch-workspace"
  | "add-workspace"
  | "rename-workspace"
  | "remove-workspace"
  | "rebuild-index";

/** Les commandes de mise en forme : la syntaxe Markdown posée autour de la sélection ou sur ses lignes. */
export type FormatCommandId =
  | "bold"
  | "italic"
  | "insert-link"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bullet-list"
  | "numbered-list";

export interface Command {
  readonly id: CommandId;
  readonly label: string;
  /** Le raccourci, écrit comme dans les menus du Mac. */
  readonly shortcut?: string;
}

/** Les commandes, dans l'ordre de la palette. Une nouvelle action s'ajoute ici. */
export const COMMANDS: readonly Command[] = [
  { id: "quick-open", label: "Ouvrir une note", shortcut: "Cmd+O" },
  { id: "open-link", label: "Ouvrir le lien" },
  { id: "new-note", label: "Nouvelle note", shortcut: "Cmd+N" },
  { id: "new-note-from-template", label: "Nouvelle note depuis un modèle", shortcut: "Cmd+Maj+N" },
  { id: "daily-note", label: "Note du jour", shortcut: "Cmd+Maj+J" },
  { id: "new-research-notebook", label: "Nouveau cahier de recherche" },
  { id: "new-mind-map", label: "Nouvelle carte mentale" },
  { id: "new-canvas", label: "Canvas : créer un canvas" },
  { id: "canvas-fit", label: "Canvas : tout voir" },
  { id: "canvas-go-to-group", label: "Canvas : aller à un groupe" },
  { id: "canvas-export-image", label: "Canvas : exporter en image" },
  { id: "new-crm", label: "Nouveau CRM" },
  { id: "new-agenda-12", label: "Nouvel agenda 12" },
  { id: "new-folder", label: "Nouveau dossier" },
  { id: "search-workspace", label: "Rechercher dans toutes les notes" },
  { id: "find-in-note", label: "Rechercher dans la note", shortcut: "Cmd+F" },
  { id: "find-and-replace", label: "Rechercher et remplacer", shortcut: "Alt+Cmd+F" },
  { id: "bold", label: "Gras", shortcut: "Cmd+B" },
  { id: "italic", label: "Italique", shortcut: "Cmd+I" },
  { id: "insert-link", label: "Lien", shortcut: "Cmd+K" },
  { id: "heading-1", label: "Titre 1", shortcut: "Cmd+1" },
  { id: "heading-2", label: "Titre 2", shortcut: "Cmd+2" },
  { id: "heading-3", label: "Titre 3", shortcut: "Cmd+3" },
  { id: "bullet-list", label: "Liste à puces", shortcut: "Cmd+Maj+8" },
  { id: "numbered-list", label: "Liste numérotée", shortcut: "Cmd+Maj+7" },
  { id: "insert-date", label: "Insérer la date du jour", shortcut: "Cmd+Maj+D" },
  { id: "correct-selection", label: "Corriger la sélection", shortcut: "Ctrl+Cmd+K" },
  { id: "rephrase-selection", label: "Reformuler la sélection", shortcut: "Ctrl+Cmd+R" },
  { id: "summarize-selection", label: "Résumer la sélection", shortcut: "Ctrl+Cmd+U" },
  { id: "voice-input", label: "Saisie vocale", shortcut: "Ctrl+Maj+D" },
  { id: "toggle-focus", label: "Mode focus", shortcut: "Cmd+Maj+F" },
  { id: "toggle-typewriter", label: "Mode machine à écrire", shortcut: "Cmd+Maj+T" },
  { id: "toggle-outline", label: "Plan de la note", shortcut: "Cmd+Maj+O" },
  { id: "toggle-related-notes", label: "Notes proches" },
  { id: "toggle-claude-column", label: "Colonne Claude Code", shortcut: "Ctrl+Cmd+L" },
  { id: "toggle-full-screen", label: "Plein écran", shortcut: "Ctrl+Cmd+F" },
  { id: "toggle-side-panels", label: "Panneaux latéraux", shortcut: "Cmd+0" },
  { id: "new-tab", label: "Nouvel onglet", shortcut: "Cmd+T" },
  { id: "close-tab", label: "Fermer l'onglet", shortcut: "Cmd+W" },
  { id: "next-tab", label: "Onglet suivant", shortcut: "Ctrl+Tab" },
  { id: "previous-tab", label: "Onglet précédent", shortcut: "Ctrl+Maj+Tab" },
  { id: "split-column", label: "Diviser la colonne", shortcut: "Ctrl+Cmd+T" },
  { id: "export-note", label: "Exporter…", shortcut: "Cmd+E" },
  { id: "print-note", label: "Imprimer…", shortcut: "Cmd+P" },
  { id: "copy-note", label: "Copier en texte mis en forme", shortcut: "Cmd+Maj+C" },
  { id: "copy-markdown", label: "Copier en Markdown", shortcut: "Ctrl+Cmd+C" },
  { id: "note-history", label: "Historique…", shortcut: "Cmd+Y" },
  { id: "sort-notes", label: "Trier la liste" },
  { id: "show-trash", label: "Corbeille" },
  { id: "open-settings", label: "Réglages", shortcut: "Cmd+," },
  { id: "about", label: "À propos de MALOREAN Notes" },
  { id: "switch-workspace", label: "Changer d'espace de travail", shortcut: "Cmd+Maj+E" },
  { id: "add-workspace", label: "Ajouter un espace de travail" },
  { id: "rename-workspace", label: "Renommer l'espace de travail" },
  { id: "remove-workspace", label: "Retirer un espace de travail" },
  { id: "rebuild-index", label: "Reconstruire l'index" },
];

/** La palette elle-même : lancée par son raccourci ou par la barre des menus, absente de sa liste. */
export const PALETTE = {
  id: "command-palette",
  label: "Palette de commandes",
  shortcut: "Cmd+Maj+P",
} as const;

/** Ce que lancent un raccourci et un élément de la barre des menus : une commande, ou la palette. */
export type MenuCommandId = CommandId | typeof PALETTE.id;

/** Les commandes et la palette : la seule liste des noms et des raccourcis de l'application. */
export const MENU_COMMANDS: readonly (Command | typeof PALETTE)[] = [...COMMANDS, PALETTE];

/** Les commandes dont le nom correspond à ce qui est tapé ; celles qui commencent par lui d'abord. */
export function matchingCommands(query: string): Command[] {
  return matching(COMMANDS, query, (command) => command.label);
}

const BY_ID: ReadonlyMap<MenuCommandId, (typeof MENU_COMMANDS)[number]> = new Map(
  MENU_COMMANDS.map((command) => [command.id, command]),
);
const chosenShortcuts = new Map<MenuCommandId, string>();
const shortcutListeners = new Set<() => void>();
let shortcutsRevision = 0;

/** Le raccourci d'une commande : celui que l'utilisateur a choisi (saisie vocale), sinon celui de la liste. */
export function shortcutOf(command: { readonly id: MenuCommandId; readonly shortcut?: string }) {
  return chosenShortcuts.get(command.id) ?? command.shortcut;
}

/** Choisit le raccourci d'une commande (`null` : celui de la liste) et prévient ceux qui le montrent. */
export function chooseShortcut(id: MenuCommandId, shortcut: string | null): void {
  const before = shortcutOf(BY_ID.get(id) ?? { id });
  if (shortcut === null) chosenShortcuts.delete(id);
  else chosenShortcuts.set(id, shortcut);
  if (shortcutOf(BY_ID.get(id) ?? { id }) === before) return;
  shortcutsRevision += 1;
  shortcutListeners.forEach((listener) => listener());
}

/** Combien de fois un raccourci a été choisi : de quoi savoir qu'une table de raccourcis est périmée. */
export function shortcutsChanged(): number {
  return shortcutsRevision;
}

/** Appelle `listener` à chaque raccourci choisi (la barre des menus se reconstruit). */
export function onShortcutChosen(listener: () => void): void {
  shortcutListeners.add(listener);
}
