// Barre des menus du Mac : ses menus et leurs éléments, rangés comme le veut Apple. Un élément
// de commande ne donne que l'identifiant : son nom et son raccourci viennent de la liste des
// commandes, la même que la palette et les raccourcis.
import type { AppMenu, MenuEntryItem, StandardItem } from "../bridge";
import { MENU_COMMANDS, type MenuCommandId } from "./commands";

/** Un élément de menu : une commande (nom de la palette sauf `label`), un élément standard, un trait. */
export type MenuItemDef =
  | { readonly command: MenuCommandId; readonly label?: string }
  | { readonly standard: StandardItem; readonly label: string }
  | "separator";

/** Un menu de la barre : son titre, son rôle pour le Mac, ses éléments. */
export interface MenuDef {
  readonly title: string;
  readonly role?: "window" | "help";
  readonly items: readonly MenuItemDef[];
}

const APP_NAME = "MALOREAN Notes";

/** La barre des menus, de gauche à droite. */
export const APP_MENU: readonly MenuDef[] = [
  {
    title: APP_NAME,
    items: [
      { standard: "about", label: `À propos de ${APP_NAME}` },
      "separator",
      { command: "open-settings", label: "Réglages…" },
      "separator",
      { standard: "services", label: "Services" },
      "separator",
      { standard: "hide", label: `Masquer ${APP_NAME}` },
      { standard: "hideOthers", label: "Masquer les autres" },
      { standard: "showAll", label: "Tout afficher" },
      "separator",
      { standard: "quit", label: `Quitter ${APP_NAME}` },
    ],
  },
  {
    title: "Fichier",
    items: [
      { command: "new-note" },
      { command: "new-note-from-template", label: "Nouvelle note depuis un modèle…" },
      { command: "daily-note" },
      { command: "new-folder" },
      "separator",
      { command: "quick-open", label: "Ouverture rapide…" },
      { command: "open-link" },
      { command: "new-tab", label: "Nouvel onglet…" },
      { command: "close-tab" },
      "separator",
      { command: "export-note" },
      { command: "print-note" },
      { command: "note-history" },
      "separator",
      { command: "switch-workspace", label: "Changer d'espace de travail…" },
      { command: "add-workspace", label: "Ajouter un espace de travail…" },
      { command: "rename-workspace", label: "Renommer l'espace de travail…" },
      { command: "remove-workspace", label: "Retirer un espace de travail…" },
      "separator",
      { command: "show-trash" },
      { command: "rebuild-index" },
    ],
  },
  {
    title: "Édition",
    items: [
      { standard: "undo", label: "Annuler" },
      { standard: "redo", label: "Rétablir" },
      "separator",
      { standard: "cut", label: "Couper" },
      { standard: "copy", label: "Copier" },
      { standard: "paste", label: "Coller" },
      { standard: "selectAll", label: "Tout sélectionner" },
      "separator",
      { command: "copy-note" },
      { command: "copy-markdown" },
      "separator",
      { command: "find-in-note", label: "Rechercher…" },
      { command: "find-and-replace", label: "Rechercher et remplacer…" },
      { command: "search-workspace", label: "Rechercher dans toutes les notes…" },
      "separator",
      { command: "correct-selection", label: "Corriger la sélection…" },
      { command: "rephrase-selection", label: "Reformuler la sélection…" },
      { command: "summarize-selection", label: "Résumer la sélection…" },
    ],
  },
  {
    title: "Format",
    items: [
      { command: "bold" },
      { command: "italic" },
      { command: "insert-link" },
      "separator",
      { command: "heading-1" },
      { command: "heading-2" },
      { command: "heading-3" },
      "separator",
      { command: "bullet-list" },
      { command: "numbered-list" },
      "separator",
      { command: "insert-date" },
    ],
  },
  {
    title: "Présentation",
    items: [
      { command: "toggle-side-panels" },
      { command: "toggle-full-screen" },
      "separator",
      { command: "toggle-focus" },
      { command: "toggle-typewriter" },
      { command: "toggle-outline" },
      { command: "toggle-claude-column" },
      "separator",
      { command: "split-column" },
      { command: "next-tab" },
      { command: "previous-tab" },
      "separator",
      { command: "sort-notes", label: "Trier la liste…" },
    ],
  },
  {
    title: "Fenêtre",
    role: "window",
    items: [
      { standard: "minimize", label: "Placer dans le Dock" },
      { standard: "zoom", label: "Réduire/agrandir" },
      "separator",
      { standard: "bringAllToFront", label: "Tout ramener au premier plan" },
    ],
  },
  {
    title: "Aide",
    role: "help",
    items: [{ command: "command-palette", label: "Palette de commandes…" }],
  },
];

/** Les commandes qui visent la note de la colonne active : grisées tant qu'aucune n'est montrée. */
export const NOTE_COMMANDS: ReadonlySet<MenuCommandId> = new Set<MenuCommandId>([
  "find-in-note",
  "find-and-replace",
  "close-tab",
  "split-column",
  "export-note",
  "print-note",
  "copy-note",
  "copy-markdown",
  "note-history",
  "open-link",
  "bold",
  "italic",
  "insert-link",
  "heading-1",
  "heading-2",
  "heading-3",
  "bullet-list",
  "numbered-list",
  "insert-date",
]);

/**
 * Les commandes de l'aide à l'écriture : grisées tant que l'assistant d'écriture n'a pas dit qu'il
 * peut répondre, et pour de bon sur un Mac sans Apple Intelligence.
 */
export const ASSISTANT_COMMANDS: ReadonlySet<MenuCommandId> = new Set<MenuCommandId>([
  "correct-selection",
  "rephrase-selection",
  "summarize-selection",
]);

/** Un raccourci écrit comme dans la palette (`Cmd+Maj+N`), écrit pour le Mac (`Cmd+Shift+N`). */
export function accelerator(shortcut: string): string {
  return shortcut.replace("Maj", "Shift");
}

const BY_ID: ReadonlyMap<string, (typeof MENU_COMMANDS)[number]> = new Map(
  MENU_COMMANDS.map((command) => [command.id, command]),
);

/** L'identifiant reçu de la barre des menus, s'il désigne une commande ; sinon rien. */
export function menuCommand(id: string): MenuCommandId | null {
  return BY_ID.get(id)?.id ?? null;
}

function entry(item: MenuItemDef, noteShown: boolean): MenuEntryItem {
  if (item === "separator") return { kind: "separator" };
  if ("standard" in item) return { kind: "standard", item: item.standard, label: item.label };
  const command = BY_ID.get(item.command);
  if (command === undefined) throw new Error(`commande inconnue : ${item.command}`);
  return {
    kind: "command",
    id: command.id,
    label: item.label ?? command.label,
    accelerator: command.shortcut === undefined ? null : accelerator(command.shortcut),
    enabled: (noteShown || !NOTE_COMMANDS.has(command.id)) && !ASSISTANT_COMMANDS.has(command.id),
  };
}

/**
 * La barre des menus à construire, ses commandes d'une note grisées si aucune note n'est montrée,
 * celles de l'aide à l'écriture grisées en attendant l'assistant d'écriture.
 */
export function menuBar(noteShown: boolean, menus: readonly MenuDef[] = APP_MENU): AppMenu[] {
  return menus.map((menu) => ({
    title: menu.title,
    role: menu.role ?? null,
    entries: menu.items.map((item) => entry(item, noteShown)),
  }));
}
