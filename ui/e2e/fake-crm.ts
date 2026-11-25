// CRM simulés pour les parcours (fiche 0060) : le fichier du CRM et ses actions, comme Rust les
// écrit. Les vraies règles (ordre complet, filtres, retard, gestes sur le texte) sont testées côté
// Rust : le faux ne sait que ce que les parcours en demandent (recherche par titre, rang, statut,
// date, étapes).
import type { ColumnItem, CrmActionItem, CrmItem } from "../src/bridge";
import { addDays } from "../src/state/crm-days";
import { fakeCrmGestures } from "./fake-crm-gestures";
import { fakeCrmLists, listsOf, withLinks } from "./fake-crm-lists";
import {
  type Args,
  CLOSED,
  type CrmHelpers,
  type FakeNotes,
  FAKE_TODAY,
  actionOf,
  stagesOf,
  value,
} from "./fake-crm-files";

type Handler = (args: Record<string, string>) => unknown;

/** Le lundi de la semaine qui contient `day`. */
const mondayOf = (day: string) =>
  addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));

/** L'ordre d'une colonne ouverte : classées d'abord, puis par date ; terminée : la plus récente d'abord. */
function ordered(cards: CrmActionItem[], closed: boolean): CrmActionItem[] {
  const byDate = (a: CrmActionItem, b: CrmActionItem) => (a.date ?? "").localeCompare(b.date ?? "");
  if (closed) return [...cards].sort((a, b) => byDate(b, a));
  const ranked = cards.filter((c) => c.rank !== null).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  return [...ranked, ...cards.filter((c) => c.rank === null).sort(byDate)];
}

function columnsOf(actions: CrmActionItem[], shown: CrmActionItem[], stages: string[]) {
  return ["TODO", ...stages, ...CLOSED].map((status): ColumnItem => {
    const all = actions.filter((a) => a.status === status);
    const closed = CLOSED.includes(status);
    return {
      ...{ status, closed, count: all.length },
      late: all.filter((a) => a.urgency?.kind === "late").length,
      cards: ordered(
        shown.filter((a) => a.status === status),
        closed,
      ).map((a) => a.name),
    };
  });
}

/** Les actions d'un CRM, lues dans ses fichiers. */
export function actionsOf(state: FakeNotes, path: string): CrmActionItem[] {
  const stages = stagesOf(state.notes[path]?.content ?? "");
  const folder = `${path.replace(/\.md$/, "")}/actions/`;
  return Object.entries(state.notes)
    .filter(([p]) => p.startsWith(folder))
    .map(([p, n]) => withLinks(actionOf(p, n.content, stages), n.content));
}

function view(state: FakeNotes, path: string, filters: Args, weekDay: string | null): CrmItem {
  const note = state.notes[path];
  if (!note || value(note.content, "type") !== "crm")
    throw { message: "cette note n'est pas un CRM" };
  const stages = stagesOf(note.content);
  const actions = actionsOf(state, path);
  const search = String(filters.search ?? "")
    .trim()
    .toLowerCase();
  const shown = actions.filter((a) => a.title.toLowerCase().includes(search));
  const monday = mondayOf(weekDay ?? FAKE_TODAY);
  const open = shown.filter((a) => a.open);
  return {
    ...{ title: /^# (.+)$/m.exec(note.content)?.[1] ?? "", stages, today: FAKE_TODAY },
    ...{ closedPage: 10, actions, tags: [], unreadable: [] },
    ...listsOf(state, path, actions),
    columns: columnsOf(actions, shown, stages),
    week: {
      ...{ monday, sunday: addDays(monday, 6) },
      late: open.filter((a) => a.date !== null && a.date < monday).map((a) => a.name),
      days: Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((day) => ({
        day,
        cards: open.filter((a) => a.date === day).map((a) => a.name),
      })),
    },
  };
}

export type { CrmHelpers };

export function fakeCrms(state: FakeNotes, helpers: CrmHelpers): Record<string, Handler> {
  return {
    create_crm: ({ folder = "", title = "" }) => {
      const path = helpers.freeName(folder, helpers.slug(title));
      state.notes[path] = {
        content: `---\ntype: crm\n---\n# ${title.trim()}\n`,
        modified: helpers.tick(),
      };
      return { path };
    },
    read_crm: ({ path, filters, weekDay }: Args) =>
      view(state, path as string, filters as Args, (weekDay as string | null) ?? null),
    ...fakeCrmGestures(state, helpers, (path) => view(state, path, {}, null)),
    ...fakeCrmLists(state, helpers),
  };
}
