// Les règles de la date d'un événement que l'écran sait sans le moteur (spécification §§ 4.3 et 4.4) : la liste
// des années, les jours possibles d'un mois, et la cohérence d'une fin avec son début. Le moteur valide chaque geste
// et reste seul juge ; ici, seulement ce qui évite à l'écran de proposer ou de laisser passer l'impossible.
import type { Agenda12EventItem } from "../bridge";

/** Le nombre d'années proposées après l'année en cours. */
export const YEAR_SPAN = 10;

/** Le début d'un événement tel que l'écran le compare à sa fin. */
export interface Start {
  readonly day: number | null;
  readonly month: number;
  readonly year: number | null;
}

type End = NonNullable<Agenda12EventItem["end"]>;
type Dated = Pick<Agenda12EventItem, "day" | "month" | "year" | "end">;

/** Un geste sur le début : son jour, son mois ou son année. */
export type StartGesture =
  | { readonly kind: "day"; readonly day: number | null }
  | { readonly kind: "month"; readonly month: number }
  | { readonly kind: "year"; readonly year: number | null };

/** L'année en cours et les `YEAR_SPAN` suivantes ; l'année déjà écrite hors de cette plage est ajoutée à sa place. */
export function yearChoices(current: number, chosen: number | null): number[] {
  const years = Array.from({ length: YEAR_SPAN + 1 }, (_, index) => current + index);
  if (chosen === null || years.includes(chosen)) return years;
  return chosen < current ? [chosen, ...years] : [...years, chosen];
}

const isLeap = (year: number): boolean => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Le nombre de jours du mois : février a 29 jours sans année (le 29 février est permis), selon l'année sinon. */
export function daysInMonth(month: number, year: number | null): number {
  if (month === 2) return year === null || isLeap(year) ? 29 : 28;
  return LENGTHS[month - 1] ?? 31;
}

/** Le jour de début existe dans ce mois. */
export const startDayAvailable = (day: number, month: number, year: number | null): boolean =>
  day <= daysInMonth(month, year);

/** Une fin dans un mois antérieur au mois du début tombe l'année suivante (du 30 décembre au 2 janvier). */
export const endWraps = ({ month, end }: Pick<Agenda12EventItem, "month" | "end">): boolean =>
  end !== null && end.month < month;

/** L'année de la fin : celle du début, ou la suivante quand la fin passe l'année. */
function endYear({ month, year }: Start, endMonth: number): number | null {
  if (year === null) return null;
  return endMonth < month ? year + 1 : year;
}

const endDayExists = (day: number, start: Start, endMonth: number): boolean =>
  day <= daysInMonth(endMonth, endYear(start, endMonth));

/** Le jour de fin se choisit : il existe dans le mois de fin, et n'est pas avant le jour de début quand c'est le même mois. */
export function endDayAvailable(day: number, start: Start, endMonth: number): boolean {
  if (!endDayExists(day, start, endMonth)) return false;
  return endMonth !== start.month || start.day === null || day >= start.day;
}

/** La fin tombe le mois du début avant son jour : le moteur la refuse (« La fin est avant le début. »). */
export const endBeforeStart = ({ day, month, end }: Dated): boolean =>
  end !== null && day !== null && end.month === month && end.day < day;

/** Le début après `gesture`. */
function startAfter(event: Dated, gesture: StartGesture): Start {
  const { day, month, year } = event;
  if (gesture.kind === "day") return { day: gesture.day, month, year };
  if (gesture.kind === "month") return { day, month: gesture.month, year };
  return { day, month, year: gesture.year };
}

/** La fin après `gesture` : sans mois écrit, elle suit le mois du début (comme le moteur). */
function endAfter(event: Dated, end: End, gesture: StartGesture): End {
  const follows = gesture.kind === "month" && end.month === event.month;
  return follows ? { day: end.day, month: gesture.month } : end;
}

/**
 * Changer le début le fait dépasser la fin déjà saisie : la fin passerait avant lui, n'existerait plus, ou
 * passerait à l'année suivante alors qu'elle ne le faisait pas. Un début sans jour ou dont le jour n'existe pas
 * n'est pas jugé ici : le moteur refuse le geste et l'écran dit son message.
 */
export function mustBringEndBack(event: Dated, gesture: StartGesture): boolean {
  if (event.end === null) return false;
  const start = startAfter(event, gesture);
  if (start.day === null || !startDayAvailable(start.day, start.month, start.year)) return false;
  const end = endAfter(event, event.end, gesture);
  if (!endDayExists(end.day, start, end.month)) return true;
  if (end.month === start.month) return end.day < start.day;
  return end.month < start.month && !endWraps(event);
}
