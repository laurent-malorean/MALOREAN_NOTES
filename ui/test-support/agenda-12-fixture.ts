// Un agenda 12 pour les tests d'écran (fiche 0104) : ce que Rust rend de `read_agenda_12` et `read_agenda_12_event`.
import type {
  Agenda12EventDetailItem,
  Agenda12EventItem,
  Agenda12Item,
  CountryItem,
} from "../src/bridge";

export const GERMANY: CountryItem = { code: "DE", name: "Allemagne", flag: "🇩🇪" };
export const FRANCE: CountryItem = { code: "FR", name: "France", flag: "🇫🇷" };
export const COUNTRIES: CountryItem[] = [
  GERMANY,
  FRANCE,
  { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮" },
];

const MONTH_NAMES = [
  ...["janvier", "février", "mars", "avril", "mai", "juin"],
  ...["juillet", "août", "septembre", "octobre", "novembre", "décembre"],
];

/** Un événement ; ce que `overrides` change est repris dans sa ligne. */
export function eventItem(overrides: Partial<Agenda12EventItem> = {}): Agenda12EventItem {
  const base: Agenda12EventItem = {
    path: "pro/salons/embedded.md",
    title: "Salon Embedded World",
    month: 2,
    day: 10,
    year: 2027,
    end: { day: 13, month: 2 },
    country: GERMANY,
    city: "Nuremberg",
    tags: ["salon"],
    closedOn: null,
    line: {
      date: "10–13/02",
      year: 2027,
      yearTone: "next",
      flag: "🇩🇪",
      city: "Nuremberg",
      title: "Salon Embedded World",
      text: "10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World",
    },
  };
  return { ...base, ...overrides };
}

/** Un événement sans jour, année, pays ni ville : sa ligne est son titre seul. */
export function plainEvent(path: string, title: string, month: number): Agenda12EventItem {
  return eventItem({
    ...{ path, title, month, day: null, year: null, end: null, country: null, city: null },
    tags: [],
    line: { date: null, year: null, yearTone: null, flag: null, city: null, title, text: title },
  });
}

/** Un agenda 12 : douze cases, les événements rangés dans celle de leur mois. */
export function agendaItem(
  events: Agenda12EventItem[] = [],
  overrides: Partial<Agenda12Item> = {},
): Agenda12Item {
  const base: Agenda12Item = {
    title: "Salons",
    columns: 4,
    tags: ["salon"],
    cells: MONTH_NAMES.map((name, index) => ({
      month: index + 1,
      name,
      events: events.filter((event) => event.month === index + 1),
    })),
    archives: [],
    unreadable: [],
  };
  return { ...base, ...overrides };
}

/** L'événement d'une note, avec son agenda 12. */
export function detailOf(
  event: Agenda12EventItem = eventItem(),
  closed = false,
): Agenda12EventDetailItem {
  return { agenda: "pro/salons.md", agendaTitle: "Salons", closed, event };
}
