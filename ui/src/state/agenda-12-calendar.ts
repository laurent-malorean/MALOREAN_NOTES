// Le calendrier du sélecteur de date de la bande d'un événement (spécification § 4.3) : les semaines d'un mois,
// le mois montré après le mois de début, la plage surlignée entre le jour de début et le jour de fin. Calcul pur :
// le sélecteur ne fait que dessiner ce que disent ces fonctions.
import type { Agenda12EventItem } from "../bridge";
import { daysInMonth, MAX_YEAR, MIN_YEAR } from "./agenda-12-when";

/** Les mois, abrégés comme dans la grille des mois du sélecteur. */
export const MONTH_ABBREVIATIONS = [
  ...["janv.", "févr.", "mars", "avr.", "mai", "juin"],
  ...["juil.", "août", "sept.", "oct.", "nov.", "déc."],
] as const;

/** Les jours de la semaine, lundi en premier : l'initiale en en-tête, le nom pour les lecteurs d'écran. */
export const WEEKDAYS = [
  ...[
    { initial: "l", name: "lundi" },
    { initial: "m", name: "mardi" },
    { initial: "m", name: "mercredi" },
    { initial: "j", name: "jeudi" },
  ],
  ...[
    { initial: "v", name: "vendredi" },
    { initial: "s", name: "samedi" },
    { initial: "d", name: "dimanche" },
  ],
] as const;

/** Sans année, le calendrier prend une année bissextile pour dessiner les semaines : le 29 février existe (§ 4.1). */
export const REFERENCE_YEAR = 2024;

/** Le mois de fin le plus lointain qu'on atteint avec la flèche du calendrier : onze mois après le mois de début. */
export const MAX_OFFSET = 11;

const DAYS_PER_WEEK = 7;

type Dated = Pick<Agenda12EventItem, "day" | "month" | "year" | "end">;

/** Le jour de la semaine du 1er du mois, de 0 (lundi) à 6 (dimanche). */
function firstWeekday(year: number, month: number): number {
  const first = new Date(0);
  first.setUTCFullYear(year, month - 1, 1);
  return (first.getUTCDay() + 6) % DAYS_PER_WEEK;
}

/** Les semaines du mois, lundi en premier : sept cases par ligne, `null` hors du mois, six lignes au plus. */
export function monthWeeks(year: number | null, month: number): (number | null)[][] {
  const calendarYear = year ?? REFERENCE_YEAR;
  const cells: (number | null)[] = Array.from(
    { length: firstWeekday(calendarYear, month) },
    () => null,
  );
  for (let day = 1; day <= daysInMonth(month, year); day += 1) cells.push(day);
  while (cells.length % DAYS_PER_WEEK !== 0) cells.push(null);
  return Array.from({ length: cells.length / DAYS_PER_WEEK }, (_, row) =>
    cells.slice(row * DAYS_PER_WEEK, (row + 1) * DAYS_PER_WEEK),
  );
}

/** Le mois montré `offset` mois après le mois de début (de décembre, on passe à janvier). */
export const viewMonth = (startMonth: number, offset: number): number =>
  ((startMonth - 1 + offset) % 12) + 1;

/** L'année du mois montré : celle du début, ou la suivante après décembre ; `null` sans année. */
export function viewYear(
  startYear: number | null,
  startMonth: number,
  offset: number,
): number | null {
  if (startYear === null) return null;
  return startYear + (startMonth - 1 + offset >= 12 ? 1 : 0);
}

/** Le mois de fin, à combien de mois du mois de début : 0 le même mois ; un mois antérieur tombe l'année suivante. */
export function endOffset({ month, end }: Pick<Agenda12EventItem, "month" | "end">): number | null {
  return end === null ? null : (end.month - month + 12) % 12;
}

/** L'année après un clic sur une flèche ; sans année, la flèche part de l'année en cours. */
export function stepYear(year: number | null, current: number, delta: -1 | 1): number {
  if (year === null) return current;
  return Math.min(MAX_YEAR, Math.max(MIN_YEAR, year + delta));
}

/** Ce que le jour d'un mois montré est dans la plage : son début, sa fin, un jour entre les deux, ou rien. */
export type DayMark = "plain" | "start" | "end" | "between";

/** La plage va du jour de début à `end`, `last` mois plus loin : ce jour du mois montré est après le début et avant la fin. */
function insideRange(
  start: number,
  end: { day: number },
  last: number,
  offset: number,
  day: number,
): boolean {
  const afterStart = offset > 0 || day > start;
  const beforeEnd = offset < last || day < end.day;
  return afterStart && beforeEnd;
}

/** La marque du jour `day` du mois montré `offset` mois après le mois de début. */
export function dayMark(event: Dated, offset: number, day: number): DayMark {
  if (event.day === null) return "plain";
  if (offset === 0 && day === event.day) return "start";
  const last = endOffset(event);
  if (last === null || event.end === null || offset > last) return "plain";
  if (offset === last && day === event.end.day) return "end";
  return insideRange(event.day, event.end, last, offset, day) ? "between" : "plain";
}

/** Les jours d'un mois montré se choisissent : ceux du mois de début toujours, ceux des mois suivants avec un jour de début. */
export const dayEnabled = (event: Dated, offset: number): boolean =>
  offset === 0 || event.day !== null;
