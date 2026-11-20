// Barre de mise en forme : ses boutons lancent les commandes de la palette sur la note de la
// colonne active, et se grisent tant qu'aucune note n'y est montrée.
import { buildFormatBar, showNoteShown } from "../screens/format-bar";
import { activeNote, type Columns } from "../state/columns";
import type { CommandId } from "../state/commands";

export interface FormatBarConnection {
  /** Les colonnes ont changé : grise ou rend actifs les boutons. */
  follow(columns: Columns): void;
}

/** Construit la barre et relie chaque bouton à sa commande : les mêmes que pour les raccourcis. */
export function connectFormatBar(
  bar: HTMLElement,
  actions: Readonly<Record<CommandId, () => void>>,
): FormatBarConnection {
  buildFormatBar(bar, (command) => actions[command]());
  return { follow: (columns) => showNoteShown(bar, activeNote(columns) !== null) };
}
