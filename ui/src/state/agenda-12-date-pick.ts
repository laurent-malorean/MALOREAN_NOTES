// Ce que chaque choix du sélecteur de date change dans l'événement (spécification §§ 4.3 et 4.4) : les gestes à
// envoyer au moteur, dans l'ordre où il les accepte, et le message que l'écran dit quand il a lui-même effacé
// quelque chose. Calcul pur : les gestes sont validés par le moteur, mais l'ordre fait qu'aucun ne passe par une
// date impossible.
import type { Agenda12EventChangeItem, Agenda12EventItem } from "../bridge";
import { viewMonth } from "./agenda-12-calendar";
import { mustBringEndBack, startDayAvailable } from "./agenda-12-when";

/** Ce que l'écran dit quand il a effacé la fin parce que le début la dépassait. */
export const END_BROUGHT_BACK = "La fin a été ramenée au début.";
/** Ce qu'il dit quand le jour n'existe pas dans le nouveau mois (ou la nouvelle année), seul ou avec la fin. */
export const DAY_REMOVED = "Ce jour n'existe pas dans ce mois : il a été retiré.";
export const DAY_AND_END_REMOVED =
  "Ce jour n'existe pas dans ce mois : le jour et la fin ont été retirés.";

type Dated = Pick<Agenda12EventItem, "day" | "month" | "year" | "end">;

/** Les gestes d'un choix, et ce que l'écran en dit. */
export interface Choice {
  readonly changes: readonly Agenda12EventChangeItem[];
  readonly notice?: string;
}

/** Le choix d'un jour du calendrier : ce qui suit, et si la fenêtre se ferme. */
export interface DayPick extends Choice {
  /** Le début est fixé, la fin est attendue : le prochain jour choisi est la fin. */
  readonly awaitingEnd: boolean;
  readonly close: boolean;
}

const END_NULL: Agenda12EventChangeItem = { kind: "end", end: null };
const DAY_NULL: Agenda12EventChangeItem = { kind: "day", day: null };
const withEnd = (event: Dated): Agenda12EventChangeItem[] => (event.end === null ? [] : [END_NULL]);

/** Un nouveau mois ou une nouvelle année de début : le jour qui n'existe plus est retiré, la fin qui passerait avant le début est ramenée. */
export function pickStart(
  event: Dated,
  gesture: { kind: "month"; month: number } | { kind: "year"; year: number | null },
): Choice {
  const month = gesture.kind === "month" ? gesture.month : event.month;
  const year = gesture.kind === "year" ? gesture.year : event.year;
  if (month === event.month && year === event.year) return { changes: [] };
  if (event.day !== null && !startDayAvailable(event.day, month, year)) {
    const notice = event.end === null ? DAY_REMOVED : DAY_AND_END_REMOVED;
    return { changes: [...withEnd(event), DAY_NULL, gesture], notice };
  }
  if (mustBringEndBack(event, gesture))
    return { changes: [END_NULL, gesture], notice: END_BROUGHT_BACK };
  return { changes: [gesture] };
}

/** Un nouveau jour de début : la fin déjà écrite est effacée d'abord, puis la fin est attendue. */
function newStart(event: Dated, day: number): DayPick {
  const same = event.day === day && event.end === null;
  return {
    changes: same ? [] : [...withEnd(event), { kind: "day", day }],
    awaitingEnd: true,
    close: false,
  };
}

/**
 * Le clic sur le jour `day` du mois montré `offset` mois après le mois de début. Dans le mois de début, en attendant
 * la fin : un jour après le début fixe la fin, le même jour fait un seul jour, un jour avant recommence la plage ;
 * sans fin attendue, le clic fixe un nouveau début. Dans un mois suivant, le clic fixe la fin (jour et mois).
 */
export function pickDay(event: Dated, offset: number, awaitingEnd: boolean, day: number): DayPick {
  if (offset > 0) {
    const end = { day, month: viewMonth(event.month, offset) };
    return { changes: [{ kind: "end", end }], awaitingEnd: false, close: true };
  }
  if (!awaitingEnd || event.day === null || day < event.day) return newStart(event, day);
  if (day === event.day) return { changes: [], awaitingEnd: false, close: true };
  const end = { day, month: event.month };
  return { changes: [{ kind: "end", end }], awaitingEnd: false, close: true };
}

/** « Mois entier » : plus de jour, donc plus de fin. */
export function wholeMonth(event: Dated): Choice {
  return { changes: event.day === null ? [] : [...withEnd(event), DAY_NULL] };
}

/** « Effacer la fin » : l'événement tient sur le jour du début. */
export function clearEnd(event: Dated): Choice {
  return { changes: withEnd(event) };
}
