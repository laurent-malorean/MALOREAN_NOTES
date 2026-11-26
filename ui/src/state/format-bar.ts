// Barre de mise en forme et bloc d'outils d'affichage : leurs boutons, en pilules. Leur raccourci
// vient de la liste des commandes, la même que la palette et la barre des menus.
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
  | "copy"
  | "focus"
  | "outline"
  | "typewriter"
  | "full-screen"
  | "full-screen-exit"
  | "claude";

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
  return displayToolTitle(command(id).label, id);
}

/** Un bouton du bloc d'outils d'affichage : sa clé (`data-<clé>` dans la fenêtre), son nom de départ, sa commande, son icône. */
export interface DisplayTool {
  readonly key: string;
  readonly label: string;
  readonly command: CommandId;
  readonly icon: FormatIcon;
}

/** Le troisième bloc, de gauche à droite : les boutons qui changent l'affichage, jamais le texte de la note. */
export const DISPLAY_TOOLS: readonly DisplayTool[] = [
  { key: "focus", label: "Focus", command: "toggle-focus", icon: "focus" },
  { key: "outline", label: "Plan", command: "toggle-outline", icon: "outline" },
  {
    key: "typewriter",
    label: "Machine à écrire",
    command: "toggle-typewriter",
    icon: "typewriter",
  },
  { key: "full-screen", label: "Plein écran", command: "toggle-full-screen", icon: "full-screen" },
  { key: "claude", label: "Claude", command: "toggle-claude-column", icon: "claude" },
];

/** La bulle d'aide d'un bouton d'affichage : son nom du moment, et le raccourci de sa commande. */
export function displayToolTitle(label: string, id: CommandId): string {
  const { shortcut } = command(id);
  return shortcut ? `${label} (${shortcut})` : label;
}
