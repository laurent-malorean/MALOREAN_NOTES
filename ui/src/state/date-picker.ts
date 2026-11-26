// Le sélecteur de date de l'application, sans écran (décision 0084) : le calendrier d'un mois en français,
// la semaine commençant le lundi, les dates écrites « JJ/MM/AAAA », les déplacements au clavier. Une date
// se garde et se passe à Rust sous la forme `AAAA-MM-JJ` ; `""` est « pas de date ».

/** Les mois, en lettres. */
export const MONTHS = [
  ...["janvier", "février", "mars", "avril", "mai", "juin"],
  ...["juillet", "août", "septembre", "octobre", "novembre", "décembre"],
] as const;

/** Les jours de la semaine à partir du lundi : leur initiale et leur nom entier (lu par les lecteurs d'écran). */
export const WEEKDAYS = [
  ...[
    { initial: "L", name: "lundi" },
    { initial: "M", name: "mardi" },
  ],
  ...[
    { initial: "M", name: "mercredi" },
    { initial: "J", name: "jeudi" },
  ],
  ...[
    { initial: "V", name: "vendredi" },
    { initial: "S", name: "samedi" },
  ],
  { initial: "D", name: "dimanche" },
] as const;

/** Un jour du calendrier : sa date, son numéro, et s'il est du mois montré. */
export interface CalendarDay {
  readonly iso: string;
  readonly day: number;
  readonly inMonth: boolean;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const WRITTEN = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const DAY_MS = 86_400_000;
/** Six semaines : tout mois y tient, la grille garde toujours la même hauteur. */
const WEEKS = 6;

const pad = (value: number, width = 2): string => String(value).padStart(width, "0");

const isoOf = (time: number): string => {
  const date = new Date(time);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

/** La date `AAAA-MM-JJ` existe-t-elle au calendrier ? Rend sa date, ou `null`. */
function valid(year: number, month: number, day: number): string | null {
  const time = Date.UTC(year, month - 1, day);
  const iso = isoOf(time);
  return iso === `${pad(year, 4)}-${pad(month)}-${pad(day)}` ? iso : null;
}

/** Lit une date écrite à la main (« 25/11/2026 », « 5.1.2027 », « 2026-11-25 ») ; `null` si ce n'est pas une date du calendrier. */
export function parseDate(text: string): string | null {
  const value = text.trim();
  const iso = ISO.exec(value);
  if (iso !== null) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const written = WRITTEN.exec(value);
  if (written === null) return null;
  return valid(Number(written[3]), Number(written[2]), Number(written[1]));
}

/** La date telle qu'on l'écrit en France : « 25/11/2026 » ; rien pour « pas de date ». */
export function formatDate(iso: string): string {
  const match = ISO.exec(iso);
  return match === null ? "" : `${match[3] ?? ""}/${match[2] ?? ""}/${match[1] ?? ""}`;
}

/** La date en toutes lettres, pour le nom d'un jour : « mercredi 25 novembre 2026 ». */
export function longDate(iso: string): string {
  const [year, month, day] = split(iso);
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  const name = WEEKDAYS[weekday]?.name ?? "";
  return `${name} ${String(day === 1 ? "1er" : day)} ${MONTHS[month - 1] ?? ""} ${String(year)}`;
}

/** L'année, le mois (1 à 12) et le jour d'une date `AAAA-MM-JJ` qui existe. */
function split(iso: string): [number, number, number] {
  const match = ISO.exec(iso) as RegExpExecArray;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** « novembre 2026 ». */
export function monthLabel(iso: string): string {
  const [year, month] = split(iso);
  return `${MONTHS[month - 1] ?? ""} ${String(year)}`;
}

/** La date `days` jours plus tard (ou plus tôt si négatif). */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = split(iso);
  return isoOf(Date.UTC(year, month - 1, day) + days * DAY_MS);
}

/** La date `months` mois plus tard ; le jour est ramené au dernier du mois s'il n'y est pas (31 janvier + 1 mois = 28 février). */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = split(iso);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return isoOf(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last)));
}

/** Le premier jour du mois de `iso`. */
export const firstOfMonth = (iso: string): string => `${iso.slice(0, 8)}01`;

/** Les 42 jours du calendrier du mois de `iso`, du lundi de la semaine du 1er au dimanche de six semaines plus tard. */
export function monthGrid(iso: string): CalendarDay[] {
  const first = firstOfMonth(iso);
  const [year, month, day] = split(first);
  const offset = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: WEEKS * 7 }, (_, index) => {
    const date = addDays(start, index);
    return { iso: date, day: Number(date.slice(8)), inMonth: date.slice(0, 7) === iso.slice(0, 7) };
  });
}

/** Où va la date `iso` quand on appuie sur cette touche ; `null` si la touche ne déplace pas. */
export function movedBy(iso: string, key: string): string | null {
  const moves: Record<string, () => string> = {
    ArrowLeft: () => addDays(iso, -1),
    ArrowRight: () => addDays(iso, 1),
    ArrowUp: () => addDays(iso, -7),
    ArrowDown: () => addDays(iso, 7),
    PageUp: () => addMonths(iso, -1),
    PageDown: () => addMonths(iso, 1),
  };
  return moves[key]?.() ?? null;
}
