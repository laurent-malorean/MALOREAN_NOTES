// Menu de création (« + » de la liste des notes) : ce qu'il propose, dans l'ordre, et la durée de
// l'appui prolongé qui l'ouvre. Chaque entrée est une commande de la palette (mêmes identifiants,
// mêmes raccourcis) : le menu n'a pas de logique de création à lui.
import { COMMANDS, type CommandId } from "./commands";

/** L'appui maintenu sur le « + », en millisecondes, qui ouvre le menu au lieu de créer une note. */
export const LONG_PRESS_MS = 500;

/** Le dessin de chaque entrée. */
export type NewContentIcon = "note" | "template" | "notebook" | "mind-map" | "canvas" | "crm";

type NewContentCommand = Extract<
  CommandId,
  | "new-note"
  | "new-note-from-template"
  | "new-research-notebook"
  | "new-mind-map"
  | "new-canvas"
  | "new-crm"
>;

/** Une entrée du menu : sa commande, son nom, son dessin et le raccourci de la commande. */
export interface NewContentItem {
  readonly command: NewContentCommand;
  readonly label: string;
  readonly icon: NewContentIcon;
  readonly shortcut: string | undefined;
}

function item(command: NewContentCommand, label: string, icon: NewContentIcon): NewContentItem {
  return { command, label, icon, shortcut: COMMANDS.find((c) => c.id === command)?.shortcut };
}

/** Les entrées, dans l'ordre du menu. */
export const NEW_CONTENT_MENU: readonly NewContentItem[] = [
  item("new-note", "Note", "note"),
  item("new-note-from-template", "Note depuis un modèle", "template"),
  item("new-research-notebook", "Cahier de recherche", "notebook"),
  item("new-mind-map", "Carte mentale", "mind-map"),
  item("new-canvas", "Canvas", "canvas"),
  item("new-crm", "CRM", "crm"),
];
