// Barre de mise en forme : ses boutons, en deux pilules. Leur nom et leur raccourci viennent de
// la liste des commandes, la même que la palette et la barre des menus.
import { COMMANDS, type Command, type CommandId } from "./commands";

/** Les icônes dessinées de la barre : une par bouton. */
export type FormatIcon =
  | "bold"
  | "italic"
  | "link"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bullet-list"
  | "numbered-list"
  | "date"
  | "markdown"
  | "copy";

/** Un bouton de la barre : la commande qu'il lance, et l'icône qu'il montre (jamais de texte). */
export interface FormatButton {
  readonly command: CommandId;
  readonly icon: FormatIcon;
}

/** Les pilules de boutons, de gauche à droite : la mise en forme, puis les deux copies. */
export const FORMAT_BAR: readonly (readonly FormatButton[])[] = [
  [
    { command: "bold", icon: "bold" },
    { command: "italic", icon: "italic" },
    { command: "insert-link", icon: "link" },
    { command: "heading-1", icon: "heading-1" },
    { command: "heading-2", icon: "heading-2" },
    { command: "heading-3", icon: "heading-3" },
    { command: "bullet-list", icon: "bullet-list" },
    { command: "numbered-list", icon: "numbered-list" },
    { command: "insert-date", icon: "date" },
  ],
  [
    { command: "copy-markdown", icon: "markdown" },
    { command: "copy-note", icon: "copy" },
  ],
];

function command(id: CommandId): Command {
  return COMMANDS.find((candidate) => candidate.id === id) as Command;
}

/** Le nom du bouton : celui de sa commande. */
export function formatButtonName(id: CommandId): string {
  return command(id).label;
}

/** La bulle d'aide : le nom de la commande, et son raccourci s'il en a un. */
export function formatButtonTitle(id: CommandId): string {
  const { label, shortcut } = command(id);
  return shortcut ? `${label} (${shortcut})` : label;
}
