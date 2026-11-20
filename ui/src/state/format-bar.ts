// Barre de mise en forme : ses boutons, en trois groupes. Leur nom et leur raccourci viennent de
// la liste des commandes, la même que la palette et la barre des menus.
import { COMMANDS, type Command, type CommandId } from "./commands";

/** Un bouton de la barre : la commande qu'il lance, et le texte court qu'il montre. */
export interface FormatButton {
  readonly command: CommandId;
  readonly text: string;
}

/** Les groupes de boutons, de gauche à droite, séparés par un trait. */
export const FORMAT_BAR: readonly (readonly FormatButton[])[] = [
  [
    { command: "bold", text: "G" },
    { command: "italic", text: "I" },
    { command: "insert-link", text: "Lien" },
  ],
  [
    { command: "heading-1", text: "T1" },
    { command: "heading-2", text: "T2" },
    { command: "heading-3", text: "T3" },
    { command: "bullet-list", text: "•" },
    { command: "numbered-list", text: "1." },
    { command: "insert-date", text: "Date" },
  ],
  [
    { command: "copy-markdown", text: "Copier Markdown" },
    { command: "copy-note", text: "Copier mis en forme" },
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
