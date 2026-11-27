// Agendas 12 simulés pour les parcours (fiche 0104) : le fichier de l'agenda 12, ses événements ouverts
// et clos, comme Rust les écrit. Doublure simple : les vraies règles (ordre complet, calcul de la ligne et
// de la couleur de l'année, validité des dates, noms de fichier) sont testées côté Rust ; le faux ne sait
// que ce que les parcours en demandent.
import type {
  Agenda12CellItem,
  Agenda12EventItem,
  Agenda12Item,
  CountryItem,
  YearToneItem,
} from "../src/bridge";
import { FAKE_TODAY, type CrmHelpers, type FakeNotes, value, withKey } from "./fake-crm-files";

type Args = Record<string, unknown>;
type Handler = (args: Record<string, string>) => unknown;

const COUNTRIES: CountryItem[] = [
  { code: "DE", name: "Allemagne", flag: "🇩🇪" },
  { code: "BE", name: "Belgique", flag: "🇧🇪" },
  { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮" },
  { code: "ES", name: "Espagne", flag: "🇪🇸" },
  { code: "FR", name: "France", flag: "🇫🇷" },
];
const MONTHS = [
  ...["janvier", "février", "mars", "avril", "mai", "juin"],
  ...["juillet", "août", "septembre", "octobre", "novembre", "décembre"],
];
const THIS_YEAR = Number(FAKE_TODAY.slice(0, 4));
const pad = (n: number) => String(n).padStart(2, "0");
const refuse = (message: string): never => {
  throw { message };
};

const folderOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), 0));
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
/** Le dossier des événements d'un agenda 12 : `pro/salons.md` : `pro/salons`. */
const eventsFolder = (agenda: string) => agenda.replace(/\.md$/, "");
const folded = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const numberOf = (content: string, key: string): number | null => {
  const text = value(content, key);
  return text === null || text === "" ? null : Number(text);
};
const tagsIn = (content: string): string[] =>
  (/^tags: \[(.*)\]$/m.exec(content)?.[1] ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");

function toneOf(year: number | null): YearToneItem | null {
  if (year === null) return null;
  if (year === THIS_YEAR) return "current";
  if (year === THIS_YEAR + 1) return "next";
  return year > THIS_YEAR ? "later" : "past";
}

/** Le jour et le mois, ou l'intervalle : `12/02`, `10–13/02`, `30/01 → 02/02` ; rien sans jour. */
function dateOf({ day, month, end }: Omit<Agenda12EventItem, "line">): string | null {
  if (day === null) return null;
  if (end === null) return `${pad(day)}/${pad(month)}`;
  if (end.month === month) return `${pad(day)}–${pad(end.day)}/${pad(month)}`;
  return `${pad(day)}/${pad(month)} → ${pad(end.day)}/${pad(end.month)}`;
}

/** La ligne d'un événement : `date [année] – drapeau (ville) – titre`, chaque partie absente disparaissant. */
function lineOf(event: Omit<Agenda12EventItem, "line">): Agenda12EventItem["line"] {
  const { year, country, city, title } = event;
  const date = dateOf(event);
  const when = [date, year === null ? null : `[${year}]`].filter((part) => part !== null);
  const where = [country?.flag ?? null, city === null ? null : `(${city})`].filter(
    (p) => p !== null,
  );
  const parts = [when.join(" "), where.join(" "), title].filter((part) => part !== "");
  return {
    ...{ date, year, yearTone: toneOf(year), flag: country?.flag ?? null, city, title },
    text: parts.join(" – "),
  };
}

function eventOf(path: string, content: string): Agenda12EventItem {
  const code = value(content, "pays")?.toUpperCase();
  const dayEnd = numberOf(content, "jour-fin");
  const month = numberOf(content, "mois") as number;
  const closedOn = value(content, "clos-le");
  const base = {
    ...{ path, title: /^# (.+)$/m.exec(content)?.[1] ?? "", month },
    ...{ day: numberOf(content, "jour"), year: numberOf(content, "annee") },
    end: dayEnd === null ? null : { day: dayEnd, month: numberOf(content, "mois-fin") ?? month },
    country: COUNTRIES.find((c) => c.code === code) ?? null,
    city: value(content, "ville") || null,
    tags: tagsIn(content),
    closedOn: closedOn === "" ? null : closedOn,
  };
  return { ...base, line: lineOf(base) };
}

/** L'ordre d'une case : année, jour (ceux sans jour après), titre ; sans année en dernier. */
function inCellOrder(a: Agenda12EventItem, b: Agenda12EventItem): number {
  const rank = (x: number | null) => x ?? Number.MAX_SAFE_INTEGER;
  return (
    rank(a.year) - rank(b.year) ||
    rank(a.day) - rank(b.day) ||
    folded(a.title).localeCompare(folded(b.title))
  );
}

/** Les événements (ouverts, ou clos) d'un agenda 12, lus dans ses fichiers. */
function eventsOf(state: FakeNotes, agenda: string, closed: boolean): Agenda12EventItem[] {
  const folder = closed ? `${eventsFolder(agenda)}/archives` : eventsFolder(agenda);
  return Object.entries(state.notes)
    .filter(
      ([path, note]) =>
        folderOf(path) === folder && value(note.content, "type") === "agenda-12-evenement",
    )
    .map(([path, note]) => eventOf(path, note.content));
}

function agendaOf(state: FakeNotes, path: string, tag: string | null): Agenda12Item {
  const note = state.notes[path];
  if (note === undefined || value(note.content, "type") !== "agenda-12")
    return refuse("cette note n'est pas un agenda 12");
  const all = eventsOf(state, path, false);
  const shown = tag === null ? all : all.filter((event) => event.tags.includes(tag));
  const cells: Agenda12CellItem[] = MONTHS.map((name, index) => ({
    ...{ month: index + 1, name },
    events: shown.filter((event) => event.month === index + 1).sort(inCellOrder),
  }));
  const archives = eventsOf(state, path, true).sort((a, b) =>
    (b.closedOn ?? "").localeCompare(a.closedOn ?? ""),
  );
  return {
    title: /^# (.+)$/m.exec(note.content)?.[1] ?? "Sans titre",
    columns: numberOf(note.content, "colonnes") ?? 4,
    tags: [...new Set(all.flatMap((event) => event.tags))].sort(),
    ...{ cells, archives, unreadable: [] },
  };
}

/** L'agenda 12 d'un événement, déduit de son chemin. */
function agendaOfEvent(path: string): string {
  const folder = folderOf(path);
  return `${folder.endsWith("/archives") ? folder.slice(0, -"/archives".length) : folder}.md`;
}

function noteOfEvent(state: FakeNotes, path: string) {
  const note = state.notes[path];
  if (note === undefined) return refuse("Cet événement n'existe plus.");
  if (value(note.content, "type") !== "agenda-12-evenement")
    return refuse("cette note n'est pas un événement d'un agenda 12");
  return note;
}

const lastDay = (month: number, year: number | null) =>
  [
    31,
    year !== null && new Date(year, 1, 29).getDate() === 29 ? 29 : year === null ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1] ?? 31;

type Gesture = (content: string, change: Args) => string;

const text = (x: unknown): string | null => (x === null ? null : String(x));

/** Refuse la date qui n'existe pas, ou une fin sans jour de début ou avant le début. */
function checked(next: string): string {
  const [month, day, year] = [
    numberOf(next, "mois") as number,
    numberOf(next, "jour"),
    numberOf(next, "annee"),
  ];
  const endDay = numberOf(next, "jour-fin");
  if (endDay !== null && day === null) refuse("La fin exige un jour de début.");
  if (day !== null && day > lastDay(month, year)) refuse("Ce jour n'existe pas dans ce mois.");
  const endMonth = numberOf(next, "mois-fin") ?? month;
  if (endDay !== null && day !== null && endMonth * 100 + endDay < month * 100 + day)
    refuse("La fin est avant le début.");
  return next;
}

/** La fin : sans jour, ou le jour du début, elle est effacée ; le mois de fin n'est écrit que s'il diffère. */
function withEnd(content: string, end: { day: number; month: number } | null): string {
  const month = numberOf(content, "mois");
  const without = withKey(withKey(content, "jour-fin", null), "mois-fin", null);
  if (end === null || (end.month === month && end.day === numberOf(content, "jour")))
    return without;
  const withDay = withKey(without, "jour-fin", String(end.day));
  return checked(end.month === month ? withDay : withKey(withDay, "mois-fin", String(end.month)));
}

/** Chaque geste de la bande : le contenu après lui, ou le refus de Rust (messages de la spécification § 13). */
const GESTURES: Record<string, Gesture> = {
  title: (content, { title }) => {
    if (String(title).trim() === "") return refuse("Le titre est vide.");
    return content.replace(/^# .*$/m, `# ${String(title).trim()}`);
  },
  month: (content, { month }) => checked(withKey(content, "mois", text(month))),
  day: (content, { day }) => checked(withKey(content, "jour", text(day))),
  year: (content, { year }) => checked(withKey(content, "annee", text(year))),
  end: (content, { end }) => withEnd(content, end as { day: number; month: number } | null),
  country: (content, { country }) => withKey(content, "pays", text(country)),
  city: (content, { city }) => withKey(content, "ville", text(city)),
};

type Fake = FakeNotes & { trash: { notes: FakeNotes["notes"] } };
type Writer = (path: string, content: string) => void;

/** Les entrées de l'agenda 12 lui-même : sa création, sa lecture, ses colonnes. */
function agendaHandlers(state: Fake, helpers: CrmHelpers, write: Writer): Record<string, Handler> {
  return {
    create_agenda_12: ({ folder = "", title = "" }) => {
      if (title.trim() === "") return refuse("Le titre est vide.");
      const path = helpers.freeName(folder, helpers.slug(title));
      write(path, `---\ntype: agenda-12\n---\n# ${title.trim()}\n`);
      return { path };
    },
    read_agenda_12: ({ path = "", tag }) => agendaOf(state, path, (tag as string | null) ?? null),
    change_agenda_12_columns: ({ path = "", columns }) => {
      const note = state.notes[path];
      if (note === undefined || value(note.content, "type") !== "agenda-12")
        return refuse("cette note n'est pas un agenda 12");
      if (![3, 4, 6].includes(Number(columns)))
        return refuse(`« ${String(columns)} » colonnes : la grille a 3, 4 ou 6 colonnes.`);
      write(path, withKey(note.content, "colonnes", String(columns)));
      return null;
    },
    list_countries: () => COUNTRIES,
  };
}

/** Ce que la copie d'un événement clos reprend : le mois, le pays, la ville, les étiquettes. */
function successorHeader(event: Agenda12EventItem): string[] {
  const keys = [
    `mois: ${event.month}`,
    event.country && `pays: ${event.country.code}`,
    event.city && `ville: ${event.city}`,
    event.tags.length === 0 ? null : `tags: [${event.tags.join(", ")}]`,
  ];
  return keys.filter((key): key is string => key !== null && key !== "");
}

/** Lire, changer et mettre à la corbeille un événement, ouvert ou clos. */
function eventHandlers(
  state: Fake,
  write: Writer,
  archived: (path: string) => boolean,
): Record<string, Handler> {
  return {
    read_agenda_12_event: ({ path = "" }) => {
      const note = noteOfEvent(state, path);
      const agenda = agendaOfEvent(path);
      return {
        ...{ agenda, closed: archived(path) },
        agendaTitle: /^# (.+)$/m.exec(state.notes[agenda]?.content ?? "")?.[1] ?? "Sans titre",
        event: eventOf(path, note.content),
      };
    },
    change_agenda_12_event: ({ path = "", change }: Record<string, string>) => {
      const note = noteOfEvent(state, path);
      const gesture = GESTURES[(change as unknown as Args).kind as string];
      write(
        path,
        gesture === undefined ? note.content : gesture(note.content, change as unknown as Args),
      );
      return null;
    },
    delete_agenda_12_event: ({ path = "" }) => {
      const note = noteOfEvent(state, path);
      Reflect.deleteProperty(state.notes, path);
      state.trash.notes[path] = note;
      return path;
    },
  };
}

export function fakeAgenda12(state: Fake, helpers: CrmHelpers): Record<string, Handler> {
  const write: Writer = (path, content) =>
    void (state.notes[path] = { content, modified: helpers.tick() });
  const make = (folder: string, title: string, header: string[]) => {
    const path = helpers.freeName(folder, helpers.slug(title));
    write(path, `---\ntype: agenda-12-evenement\n${header.join("\n")}\n---\n# ${title}\n`);
    return path;
  };
  const archived = (path: string) => folderOf(path).endsWith("/archives");
  const moved = (path: string, folder: string, key: string | null) => {
    const note = noteOfEvent(state, path);
    const target = helpers.freeName(folder, nameOf(path).replace(/\.md$/, ""));
    Reflect.deleteProperty(state.notes, path);
    write(target, withKey(note.content, "clos-le", key));
    return target;
  };
  return {
    ...agendaHandlers(state, helpers, write),
    ...eventHandlers(state, write, archived),
    create_agenda_12_event: ({ agenda = "", month }) => {
      agendaOf(state, agenda, null);
      if (!(Number(month) >= 1 && Number(month) <= 12))
        return refuse(
          `« ${String(month)} » n'est pas un mois : un nombre de 1 (janvier) à 12 (décembre) est attendu.`,
        );
      return { path: make(eventsFolder(agenda), "Sans titre", [`mois: ${String(month)}`]) };
    },
    close_agenda_12_event: ({ path = "", closing }) => {
      const note = noteOfEvent(state, path);
      if (archived(path)) return refuse("Cet événement est déjà clos.");
      const agenda = agendaOfEvent(path);
      const target = moved(path, `${eventsFolder(agenda)}/archives`, FAKE_TODAY);
      if (closing !== "withSuccessor") return { closed: target, successor: null };
      const event = eventOf(path, note.content);
      return {
        closed: target,
        successor: make(eventsFolder(agenda), event.title, successorHeader(event)),
      };
    },
    reopen_agenda_12_event: ({ path = "" }) => {
      noteOfEvent(state, path);
      if (!archived(path)) return refuse("Cet événement n'est pas clos.");
      return { path: moved(path, eventsFolder(agendaOfEvent(path)), null) };
    },
  };
}
