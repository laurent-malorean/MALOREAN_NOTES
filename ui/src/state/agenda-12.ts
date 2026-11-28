// L'agenda 12 à l'écran (fiche 0104) : ce que l'interface sait d'un agenda 12 et d'un événement sans écran.
// Les règles (ordre d'une case, ligne, validité des dates) sont calculées par Rust ; ici, seulement ce
// qui se lit, se filtre et se formate pour l'affichage.
import type { Agenda12EventItem, CountryItem } from "../bridge";
import { declaredType } from "./declared-type";
import { formatDate, MONTHS } from "./date-picker";

/** Les valeurs de `type:` d'un agenda 12 et d'un événement, comme Rust les écrit. */
const AGENDA_TYPE = "agenda-12";
const EVENT_TYPE = "agenda-12-evenement";

/** La note est un agenda 12 : son en-tête le déclare, comme Rust le lit. */
export const isAgenda12Content = (content: string): boolean =>
  declaredType(content) === AGENDA_TYPE;

/** La note est un événement d'un agenda 12. */
export const isAgenda12EventContent = (content: string): boolean =>
  declaredType(content) === EVENT_TYPE;

/** Les nombres de colonnes de la grille (spécification § 5.1). */
export const COLUMN_CHOICES = [3, 4, 6] as const;

/** Les deux vues d'un agenda 12 : la grille et la liste (spécification § 5.5). */
export const LAYOUT_CHOICES = ["grid", "list"] as const;

/** Le dossier des événements d'un agenda 12 : celui qui porte son nom de fichier (`pro/salons.md` : `pro/salons/`). */
export const agenda12Folder = (path: string): string => `${path.replace(/\.md$/i, "")}/`;

/** Un des fichiers annoncés est l'agenda 12 `path` ou l'un de ses événements (archives comprises). */
export function touchesAgenda12(path: string, changed: readonly string[]): boolean {
  const folder = agenda12Folder(path);
  return changed.some((file) => file === path || file.startsWith(folder));
}

/** Le nom d'un mois (1 à 12), avec sa majuscule : « Février ». */
export function monthName(month: number): string {
  const name = MONTHS[month - 1] ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Sans majuscule ni accent, pour chercher en tapant. */
const folded = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Les pays dont le nom contient ce qui est tapé (ou dont le code est exactement cela), dans l'ordre de la liste. */
export function matchingCountries(countries: readonly CountryItem[], query: string): CountryItem[] {
  const wanted = folded(query.trim());
  if (wanted === "") return [...countries];
  return countries.filter(
    (country) => folded(country.name).includes(wanted) || country.code.toLowerCase() === wanted,
  );
}

/** Le pays tel que le champ le montre : « 🇩🇪 Allemagne ». */
export const countryText = (country: CountryItem): string => `${country.flag} ${country.name}`;

/** Le jour de clôture tel qu'on le lit : `27/11/2026`. */
export const closedDay = (closedOn: string): string => formatDate(closedOn);

/** Un jour du mois comme on le dit : « 1er », puis « 2 », « 3 »… */
const dayText = (day: number): string => (day === 1 ? "1er" : String(day));

const lowerMonth = (month: number): string => monthName(month).toLowerCase();

/** La date de l'événement en toutes lettres : « 5 – 11 octobre 2026 », « 30 janvier – 2 février 2027 », « octobre 2026 ». */
export function summaryDate({ month, day, year, end }: Agenda12EventItem): string {
  let date = lowerMonth(month);
  if (day !== null) {
    if (end === null) date = `${dayText(day)} ${date}`;
    else if (end.month === month) date = `${dayText(day)} – ${dayText(end.day)} ${date}`;
    else if (year !== null && end.month < month)
      // Une fin dans un mois antérieur tombe l'année suivante : les deux années se disent.
      return `${dayText(day)} ${date} ${year} – ${dayText(end.day)} ${lowerMonth(end.month)} ${year + 1}`;
    else date = `${dayText(day)} ${date} – ${dayText(end.day)} ${lowerMonth(end.month)}`;
  }
  return year === null ? date : `${date} ${year}`;
}

/** Le résumé d'un événement : sa date puis son lieu (« Lisbonne, Portugal »), séparés par « · ». */
export function eventSummary(event: Agenda12EventItem): string {
  const place = [event.city, event.country?.name].filter((part) => part != null && part !== "");
  return [summaryDate(event), place.join(", ")].filter((part) => part !== "").join(" · ");
}
