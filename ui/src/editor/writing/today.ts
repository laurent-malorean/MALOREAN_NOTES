// Insertion de la date du jour, en toutes lettres : « 16 novembre 2026 », « 1er mars 2027 ».
import { EditorSelection } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/** La date en toutes lettres, comme on l'écrit en français ; le premier du mois s'écrit « 1er ». */
export function frenchLongDate(date: Date): string {
  const day = date.getDate();
  return `${day === 1 ? "1er" : day} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Donne la date du jour ; remplacée dans les tests par une date fixe. */
export type Today = () => Date;

const insertToday =
  (today: Today): Command =>
  (view) => {
    const text = frenchLongDate(today());
    view.dispatch(
      view.state.changeByRange((range) => ({
        changes: { from: range.from, to: range.to, insert: text },
        range: EditorSelection.cursor(range.from + text.length),
      })),
      { scrollIntoView: true },
    );
    return true;
  };

/** Cmd+Maj+D insère la date du jour à la place de la sélection. */
export const todayShortcut = (today: Today) =>
  keymap.of([{ key: "Mod-Shift-d", run: insertToday(today) }]);
