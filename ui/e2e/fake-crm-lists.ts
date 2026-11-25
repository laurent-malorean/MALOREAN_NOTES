// Les personnes, entreprises et projets d'un CRM simulé (fiche 0063) : lus dans leurs fichiers, créés,
// changés et supprimés comme Rust le fait. Les vraies règles (compteurs, ordre, nom unique, corbeille)
// sont testées côté Rust : le faux ne sait que ce que les parcours en demandent.
import type { CrmActionItem, CrmItem } from "../src/bridge";
import { PALETTE } from "../src/state/palette";
import { type Args, type CrmHelpers, type FakeNotes, value, withKey } from "./fake-crm-files";

type Change = { kind: string; [key: string]: unknown };
type Handler = (args: Record<string, string>) => unknown;
type Tally = CrmItem["nodata"]["tally"];

const title = (content: string) => /^# (.+)$/m.exec(content)?.[1] ?? "";
const reference = (text: string | null) => /\[\[(.+?)\]\]/.exec(text ?? "")?.[1] ?? null;
/** Le texte sous le titre : les notes libres. */
const notesOf = (content: string) => content.replace(/^[\s\S]*?^# .*$\n?/m, "").trim();
/** Les étiquettes d'une fiche, sous la forme `tags: [a, b]`. */
const tagsOf = (content: string) =>
  (/^\[(.*)\]$/.exec(value(content, "tags") ?? "")?.[1] ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Le dossier d'une sorte de fiche d'un CRM : `clients.md` + `personnes` : `clients/personnes/`. */
const folderOf = (crm: string, kind: string) => `${crm.replace(/\.md$/, "")}/${kind}/`;
export const fichePath = (crm: string, kind: string, name: string) =>
  `${folderOf(crm, kind)}${name}.md`;

/** Les fiches d'une sorte : leur référence et leur texte. */
function filesOf(state: FakeNotes, crm: string, kind: string) {
  const folder = folderOf(crm, kind);
  return Object.entries(state.notes)
    .filter(([path]) => path.startsWith(folder))
    .map(([path, note]) => ({
      ...{ path, name: path.slice(folder.length).replace(/\.md$/, ""), content: note.content },
    }))
    .sort((a, b) => title(a.content).localeCompare(title(b.content), "fr"));
}

function tallyOf(actions: readonly CrmActionItem[]): Tally {
  const open = actions.filter((a) => a.open);
  return {
    open: open.length,
    late: open.filter((a) => a.urgency?.kind === "late").length,
    today: open.filter((a) => a.urgency?.kind === "today").length,
  };
}

const byDate = (a: CrmActionItem, b: CrmActionItem) => (a.date ?? "").localeCompare(b.date ?? "");

/** Les entreprises, personnes et projets du CRM `crm`, avec leurs compteurs. */
export function listsOf(state: FakeNotes, crm: string, actions: CrmActionItem[]) {
  const people = filesOf(state, crm, "personnes").map(({ name, content }) => {
    const mine = actions.filter((a) => a.people.some((p) => p.person === name));
    const company = reference(value(content, "entreprise"));
    return {
      ...{ name, title: title(content), role: value(content, "fonction"), company },
      ...{ career: [], email: value(content, "email"), phone: value(content, "telephone") },
      ...{ linkedin: value(content, "linkedin"), notes: notesOf(content) },
      openActions: mine
        .filter((a) => a.open)
        .sort(byDate)
        .map((a) => a.name),
      closedActions: mine
        .filter((a) => !a.open)
        .sort(byDate)
        .reverse()
        .map((a) => a.name),
      tally: tallyOf(mine),
    };
  });
  const companies = filesOf(state, crm, "entreprises").map(({ name, content }) => ({
    ...{ name, title: title(content), site: value(content, "site"), notes: notesOf(content) },
    ...{ sector: value(content, "secteur"), address: value(content, "adresse") },
    phone: value(content, "telephone"),
    people: people.filter((p) => p.company === name).map((p) => p.name),
    tally: tallyOf(actions.filter((a) => a.companies.includes(name))),
  }));
  const projects = filesOf(state, crm, "projets").map(({ name, content }) => {
    const mine = actions.filter((a) => a.project === name);
    return {
      ...{ name, title: title(content), color: value(content, "couleur") ?? PALETTE[0] },
      tags: tagsOf(content),
      openActions: mine
        .filter((a) => a.open)
        .sort(byDate)
        .map((a) => a.name),
      tally: tallyOf(mine),
    };
  });
  const loose = actions.filter((a) => a.companies.length === 0 || a.companies.includes(null));
  const nodata = {
    people: people.filter((p) => p.company === null).map((p) => p.name),
    tally: tallyOf(loose),
  };
  return { people, companies, projects, nodata };
}

/** La couleur la moins utilisée des projets du CRM (la première de la palette en cas d'égalité). */
function leastUsed(state: FakeNotes, crm: string): string {
  const used = filesOf(state, crm, "projets").map((f) => value(f.content, "couleur") ?? PALETTE[0]);
  const count = (color: string) => used.filter((u) => u === color).length;
  return [...PALETTE].sort((a, b) => count(a) - count(b))[0] as string;
}

/** Réécrit une fiche qui existe ; sinon, le message d'une fiche disparue. */
function writer(state: FakeNotes, helpers: CrmHelpers) {
  return (path: string, change: (content: string) => string) => {
    const note = state.notes[path];
    if (!note) throw { message: "Cette fiche n'existe plus." };
    note.content = change(note.content);
    note.modified = helpers.tick();
  };
}

export function fakeCrmLists(state: FakeNotes, helpers: CrmHelpers): Record<string, Handler> {
  const write = writer(state, helpers);
  const create = (crm: string, kind: string, name: string, header: string[]) => {
    const wanted = name.trim();
    if (filesOf(state, crm, kind).some((f) => same(title(f.content), wanted)))
      throw { message: `« ${wanted} » existe déjà dans ce CRM.` };
    const path = helpers.freeName(folderOf(crm, kind).replace(/\/$/, ""), helpers.slug(wanted));
    const type = {
      personnes: "crm-personne",
      entreprises: "crm-entreprise",
      projets: "crm-projet",
    }[kind];
    const lines = [`type: ${type as string}`, ...header];
    state.notes[path] = {
      content: `---\n${lines.join("\n")}\n---\n# ${wanted}\n`,
      modified: helpers.tick(),
    };
    return path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  };
  return {
    create_crm_person: ({ crm, name, company }: Args) =>
      create(
        crm as string,
        "personnes",
        name as string,
        company ? [`entreprise: '[[${company as string}]]'`] : [],
      ),
    create_crm_company: ({ crm, name }: Args) =>
      create(crm as string, "entreprises", name as string, []),
    create_crm_project: ({ crm, name }: Args) =>
      create(crm as string, "projets", name as string, [
        `couleur: ${leastUsed(state, crm as string)}`,
      ]),
    change_crm_project: ({ crm, project, change }: Args) => {
      const c = change as { kind: string; name?: string; color?: string; tags?: string[] };
      write(fichePath(crm as string, "projets", project as string), (t) => {
        if (c.kind === "color") return withKey(t, "couleur", c.color as string);
        if (c.kind === "tags")
          return withKey(t, "tags", c.tags?.length ? `[${c.tags.join(", ")}]` : null);
        return t.replace(/^# .*$/m, `# ${(c.name as string).trim()}`);
      });
      return null;
    },
    delete_crm_project: ({ crm, project }: Args) => {
      Reflect.deleteProperty(state.notes, fichePath(crm as string, "projets", project as string));
      for (const f of filesOf(state, crm as string, "actions"))
        if (reference(value(f.content, "projet")) === project)
          write(f.path, (t) => withKey(t, "projet", null));
      return null;
    },
    ...fakeCrmFiches(state, write),
  };
}

/** Un geste sur une personne ou une entreprise : renommer, un champ, les notes, l'entreprise. */
function changed(write: Write, path: string, c: Change) {
  write(path, (t) => {
    if (c.kind === "rename") return t.replace(/^# .*$/m, `# ${(c.name as string).trim()}`);
    if (c.kind === "notes")
      return `${t.replace(/^# .*$[\s\S]*/m, `# ${title(t)}`)}\n${c.notes as string}\n`;
    if (c.kind === "company")
      return withKey(t, "entreprise", c.company ? `'[[${c.company as string}]]'` : null);
    const key = FILE_KEYS[c.field as string] ?? (c.field as string);
    return withKey(t, key, (c.value as string) === "" ? null : (c.value as string));
  });
  return null;
}

/** Le nom d'un champ dans la commande de Rust, et sa propriété dans le fichier. */
const FILE_KEYS: Record<string, string> = {
  role: "fonction",
  phone: "telephone",
  sector: "secteur",
  address: "adresse",
};

type Write = ReturnType<typeof writer>;

/** Les gestes des fiches d'entreprise et de personne. */
function fakeCrmFiches(state: FakeNotes, write: Write): Record<string, Handler> {
  const drop = (crm: string, kind: string, name: string) =>
    Reflect.deleteProperty(state.notes, fichePath(crm, kind, name));
  return {
    change_crm_person: ({ crm, person, change }: Args) =>
      changed(write, fichePath(crm as string, "personnes", person as string), change as Change),
    change_crm_company: ({ crm, company, change }: Args) =>
      changed(write, fichePath(crm as string, "entreprises", company as string), change as Change),
    delete_crm_person: ({ crm, person }: Args) => {
      drop(crm as string, "personnes", person as string);
      const entry = new RegExp(`'\\[\\[${person as string}\\]\\][^']*',? ?`);
      for (const f of filesOf(state, crm as string, "actions"))
        write(f.path, (t) => t.replace(entry, ""));
      return null;
    },
    delete_crm_company: ({ crm, company }: Args) => {
      drop(crm as string, "entreprises", company as string);
      for (const f of filesOf(state, crm as string, "personnes"))
        if (reference(value(f.content, "entreprise")) === company)
          write(f.path, (t) => withKey(t, "entreprise", null));
      return null;
    },
    crm_email_is_known: ({ crm, email, except }: Args) =>
      filesOf(state, crm as string, "personnes").some(
        (f) => f.name !== except && value(f.content, "email") === email,
      ),
  };
}
