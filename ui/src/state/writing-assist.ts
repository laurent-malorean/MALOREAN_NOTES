// Aide à l'écriture : les actions proposées sur une sélection, et la place d'une proposition
// insérée sous la sélection. La note ne change qu'avec l'accord de l'utilisateur (fiche 0031).
import type { WritingActionItem } from "../bridge";
import type { CommandId } from "./commands";

/** Une action d'aide à l'écriture : ce qu'on demande à Rust, sa commande, son nom. */
export interface WritingActionDef {
  readonly action: WritingActionItem;
  readonly command: CommandId;
  readonly label: string;
}

/** Chaque action, par ce qu'on demande à Rust. */
export const WRITING_ACTION: Readonly<Record<WritingActionItem, WritingActionDef>> = {
  correct: { action: "correct", command: "correct-selection", label: "Corriger" },
  rephrase: { action: "rephrase", command: "rephrase-selection", label: "Reformuler" },
  summarize: { action: "summarize", command: "summarize-selection", label: "Résumer" },
};

/** Les actions, dans l'ordre du menu de la sélection et de la barre des menus. */
export const WRITING_ACTIONS: readonly WritingActionDef[] = Object.values(WRITING_ACTION);

/** Le message quand l'action est demandée sans texte sélectionné. */
export function noSelection(action: WritingActionDef): string {
  return `Sélectionnez d'abord le texte à ${action.label.toLowerCase()}`;
}

/** Le message quand le texte sélectionné a changé pendant la demande. */
export const SELECTION_CHANGED =
  "Le texte sélectionné a changé pendant la demande : la note n'a pas été modifiée";

/** Une insertion dans le texte : à la position `at`, le texte `insert`. */
export interface Insertion {
  readonly at: number;
  readonly insert: string;
}

/**
 * Où va `proposal` insérée sous la sélection `from`–`to` de `text` : à la fin de sa dernière ligne,
 * après une ligne vide. Une sélection qui finit par un retour à la ligne finit sur la ligne d'avant.
 */
export function insertionBelow(
  text: string,
  from: number,
  to: number,
  proposal: string,
): Insertion {
  // Le caractère juste avant la fin est sur la dernière ligne de la sélection, ou est son retour à
  // la ligne final : dans les deux cas, la fin de cette ligne est le premier retour à la ligne dès lui.
  const end = text.indexOf("\n", to > from ? to - 1 : to);
  return { at: end === -1 ? text.length : end, insert: `\n\n${proposal}` };
}
