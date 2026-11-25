// Un CRM lu, pour les tests d'écran et de logique du CRM (fiche 0060) : les colonnes et la semaine
// sont calculées ici très simplement ; les vraies règles sont testées côté Rust.
import type { ColumnItem, CrmActionItem, CrmItem, WeekItem } from "../src/bridge";

export const TODAY = "2026-11-25";
export const MONDAY = "2026-11-23";

/** Une action ouverte, sans rien de plus ; `over` change ce qu'on veut. */
export function action(name: string, over: Partial<CrmActionItem> = {}): CrmActionItem {
  return {
    ...{ name, title: name, people: [], companies: [], status: "TODO", open: true },
    ...{ date: null, urgency: null, channel: null, project: null, color: null, tags: [] },
    ...{ linkedNotes: [], rank: null, description: "", checklists: [], comments: [] },
    ...over,
  };
}

const CLOSED = ["Done", "Cancel"];

/** Les colonnes : « TODO », les étapes, « Done », « Cancel », les cartes dans l'ordre donné. */
function columnsOf(actions: readonly CrmActionItem[], stages: readonly string[]): ColumnItem[] {
  return ["TODO", ...stages, ...CLOSED].map((status) => {
    const cards = actions.filter((a) => a.status === status);
    return {
      status,
      closed: CLOSED.includes(status),
      count: cards.length,
      late: cards.filter((a) => a.urgency?.kind === "late").length,
      cards: cards.map((a) => a.name),
    };
  });
}

/** Ma semaine : les actions ouvertes de chaque jour, et celles d'avant le lundi. */
function weekOf(actions: readonly CrmActionItem[]): WeekItem {
  const open = actions.filter((a) => a.open);
  const days = Array.from({ length: 7 }, (_, index) => `2026-11-${String(23 + index)}`);
  return {
    monday: MONDAY,
    sunday: "2026-11-29",
    late: open.filter((a) => a.date !== null && a.date < MONDAY).map((a) => a.name),
    days: days.map((day) => ({
      day,
      cards: open.filter((a) => a.date === day).map((a) => a.name),
    })),
  };
}

const NO_TALLY = { open: 0, late: 0, today: 0 };

/** Un CRM lu : ses fiches données, le reste calculé. */
export function crm(over: Partial<CrmItem> = {}): CrmItem {
  const actions = over.actions ?? [];
  const stages = over.stages ?? ["Progress", "WaitingFor"];
  return {
    ...{ title: "Clients", stages, today: TODAY, closedPage: 10 },
    ...{ nodata: { people: [], tally: NO_TALLY }, companies: [], people: [], projects: [] },
    ...{ actions, columns: columnsOf(actions, stages), week: weekOf(actions) },
    ...{ tags: [], unreadable: [] },
    ...over,
  };
}

/** Une entreprise. */
export const company = (name: string, title: string): CrmItem["companies"][number] => ({
  ...{ name, title, site: null, sector: null, address: null, phone: null, notes: "" },
  people: [],
  tally: NO_TALLY,
});

/** Une personne, dans l'entreprise `of` (NODATA sans). */
export const person = (
  name: string,
  title: string,
  of: string | null = null,
): CrmItem["people"][number] => ({
  ...{ name, title, role: null, company: of, career: [], email: null, phone: null },
  ...{ linkedin: null, notes: "", openActions: [], closedActions: [], tally: NO_TALLY },
});

/** Un projet. */
export const project = (
  name: string,
  title: string,
  color = "bleu",
): CrmItem["projects"][number] => ({
  ...{ name, title, color, tags: [], openActions: [], tally: NO_TALLY },
});

/** Un CRM d'exemple, avec une carte dans chaque colonne et de quoi remplir une carte. */
export function sample(): CrmItem {
  return crm({
    companies: [company("acme", "Acme")],
    people: [person("jean-dupont", "Jean Dupont", "acme"), person("marie-durand", "Marie Durand")],
    projects: [project("refonte", "Refonte du site", "bleu")],
    tags: ["salon", "urgent"],
    actions: [
      action("devis", {
        ...{ title: "Demande de devis", date: "2026-11-22", urgency: { kind: "late", days: 3 } },
        ...{ project: "refonte", color: "violet", tags: ["urgent", "salon"] },
        people: [{ person: "jean-dupont", company: "acme" }],
        description: "Pour 3 postes",
        checklists: [
          {
            name: "Préparation",
            done: 1,
            items: [
              { done: true, text: "Relire" },
              { done: false, text: "Chiffrer" },
            ],
          },
        ],
        comments: [{ at: "2026-11-24 10:32", text: "Rappelé" }],
        linkedNotes: ["Cahier des charges"],
      }),
      action("appel", {
        ...{ title: "Appeler Marie", status: "Progress", date: TODAY },
        urgency: { kind: "today" },
        people: [{ person: "marie-durand", company: null }],
      }),
      action("relance", { title: "Relancer", status: "WaitingFor", date: "2026-11-27" }),
      action("fini", { title: "Contrat signé", status: "Done", open: false, date: "2026-11-20" }),
    ],
  });
}
