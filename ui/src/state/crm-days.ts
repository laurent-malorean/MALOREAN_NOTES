// Les jours du CRM à l'écran (fiche 0060) : Rust donne des jours écrits `2026-11-24` ; l'écran les
// montre en français et passe d'une semaine à l'autre. « Aujourd'hui » vient toujours de Rust.

/** Les mois abrégés, écrits ici plutôt que demandés à `Intl`, dont le texte varie d'un moteur à l'autre. */
const MONTHS = [
  ...["janv.", "févr.", "mars", "avr.", "mai", "juin"],
  ...["juil.", "août", "sept.", "oct.", "nov.", "déc."],
];

/** Les jours de la semaine, du lundi au dimanche. */
const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const MS_PER_DAY = 86_400_000;

/** L'année, le mois (1 à 12) et le jour du mois d'un jour `2026-11-24`. */
function parts(day: string): { year: number; month: number; date: number } {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return { year, month, date };
}

/** Le jour de la semaine `index` (0 le lundi) : « Lundi ». */
export const weekdayName = (index: number): string => WEEKDAYS[index] ?? "";

/** Le jour du mois d'un jour : `24`. */
export const dayOfMonth = (day: string): number => parts(day).date;

/** Un jour, court : « 24 nov. » ; l'année suit quand ce n'est pas celle d'aujourd'hui (« 24 nov. 2025 »). */
export function shortDay(day: string, today: string): string {
  const { year, month, date } = parts(day);
  const text = `${date} ${MONTHS[month - 1] as string}`;
  return year === parts(today).year ? text : `${text} ${year}`;
}

/** Le jour `delta` jours plus tard (plus tôt si négatif). */
export function addDays(day: string, delta: number): string {
  const { year, month, date } = parts(day);
  const moved = new Date(Date.UTC(year, month - 1, date) + delta * MS_PER_DAY);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${moved.getUTCFullYear()}-${two(moved.getUTCMonth() + 1)}-${two(moved.getUTCDate())}`;
}

/** Le titre de Ma semaine : « Semaine du 23 nov. au 29 nov. ». */
export function weekTitle(monday: string, sunday: string, today: string): string {
  return `Semaine du ${shortDay(monday, today)} au ${shortDay(sunday, today)}`;
}

/** Le lundi de la semaine précédente (`-1`) ou suivante (`1`). */
export const weekAround = (monday: string, direction: -1 | 1): string =>
  addDays(monday, direction * 7);
