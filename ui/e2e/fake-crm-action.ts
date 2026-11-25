// Ce que la fenêtre d'une action demande au CRM simulé (fiche 0062) : les fiches des personnes, des
// entreprises et des projets, les champs et le texte d'une action (description, listes à cocher,
// commentaires), tous les gestes d'une action, sa création complète, sa suppression. Les vraies règles
// sont testées côté Rust : le faux écrit ce que les parcours relisent dans le fichier.
import type {
  CrmActionChangeItem,
  CrmActionDraftItem,
  CrmActionItem,
  CrmItem,
} from "../src/bridge";
import type { BodyChangeItem } from "../src/bridge/generated/BodyChangeItem";
import { listsOf } from "./fake-crm-lists";
import {
  type Args,
  type CrmHelpers,
  type FakeNotes,
  FAKE_TODAY,
  actionOf,
  actionPath,
  stagesOf,
  value,
  withKey,
} from "./fake-crm-files";

type Handler = (args: Record<string, string>) => unknown;
type Trash = { notes: Record<string, { content: string; modified: number }> };

interface Body {
  description: string;
  lists: { name: string; items: { done: boolean; text: string }[] }[];
  comments: { at: string; text: string }[];
}

const LIST_HEADING = "#### Liste à cocher : ";
const COMMENTS_HEADING = "#### Commentaires";

const header = (content: string) => /^---\n([\s\S]*?)\n---\n/.exec(content)?.[0] ?? "";
const afterHeader = (content: string) => content.slice(header(content).length);
const folderOf = (crm: string, kind: string) => `${crm.replace(/\.md$/, "")}/${kind}/`;
const references = (raw: string | null) => [...(raw ?? "").matchAll(/\[\[([^\]]+)\]\]/g)];
const quoted = (list: string[]) => `[${list.map((item) => `'${item}'`).join(", ")}]`;

type Lines = { part: "description" | "list" | "comments"; description: string[] };

/** Une ligne d'élément à cocher ; dit si elle en est une. */
function readItem(body: Body, line: string): boolean {
  const list = body.lists[body.lists.length - 1];
  if (!list || !/^- \[[ x]\] /.test(line)) return false;
  list.items.push({ done: line[3] === "x", text: line.slice(6) });
  return true;
}

/** Une ligne de commentaire, ou la suite en retrait du précédent ; dit si elle en est une. */
function readComment(body: Body, line: string): boolean {
  const last = body.comments[body.comments.length - 1];
  if (/^- \d{4}-\d\d-\d\d \d\d:\d\d · /.test(line))
    return body.comments.push({ at: line.slice(2, 18), text: line.slice(21) }) > 0;
  if (!last || !line.startsWith("  ")) return false;
  last.text += `\n${line.slice(2)}`;
  return true;
}

/** Une ligne du texte d'une action : elle ouvre une partie, ou s'ajoute à celle qui est ouverte. */
function readLine(body: Body, state: Lines, line: string): void {
  if (line.startsWith(LIST_HEADING)) {
    body.lists.push({ name: line.slice(LIST_HEADING.length), items: [] });
    state.part = "list";
  } else if (line === COMMENTS_HEADING) state.part = "comments";
  else if (state.part === "list") readItem(body, line);
  else if (state.part === "comments") readComment(body, line);
  else state.description.push(line);
}

/** Le texte d'une action sous son titre : description, listes à cocher, commentaires. */
export function parseBody(content: string): Body {
  const body: Body = { description: "", lists: [], comments: [] };
  const state: Lines = { part: "description", description: [] };
  for (const line of afterHeader(content).split("\n").slice(1)) readLine(body, state, line);
  body.description = state.description.join("\n").trim();
  return body;
}

function serializeBody(title: string, body: Body): string {
  const parts = [`# ${title}`];
  if (body.description !== "") parts.push(body.description);
  for (const list of body.lists) {
    const items = list.items.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`);
    parts.push([`${LIST_HEADING}${list.name}`, ...items].join("\n"));
  }
  const comments = body.comments.map((c) => `- ${c.at} · ${c.text.replace(/\n/g, "\n  ")}`);
  if (comments.length > 0) parts.push([COMMENTS_HEADING, ...comments].join("\n"));
  return `${parts.join("\n\n")}\n`;
}

const titleOf = (content: string) => /^# (.+)$/m.exec(afterHeader(content))?.[1] ?? "";

type Operation<K extends BodyChangeItem["kind"]> = (
  body: Body,
  change: Extract<BodyChangeItem, { kind: K }>,
  now: string,
) => void;

/** Ce que fait chaque geste sur le texte d'une action. */
const OPERATIONS: { [K in BodyChangeItem["kind"]]: Operation<K> } = {
  description: (body, c) => void (body.description = c.text),
  addChecklist: (body, c) => void body.lists.push({ name: c.name, items: [] }),
  renameChecklist: (body, c) => void ((body.lists[c.list] as { name: string }).name = c.name),
  removeChecklist: (body, c) => void body.lists.splice(c.list, 1),
  addItem: (body, c) => void body.lists[c.list]?.items.push({ done: false, text: c.text }),
  editItem: (body, c) =>
    void ((body.lists[c.list]?.items[c.item] as { text: string }).text = c.text),
  checkItem: (body, c) =>
    void ((body.lists[c.list]?.items[c.item] as { done: boolean }).done = c.done),
  removeItem: (body, c) => void body.lists[c.list]?.items.splice(c.item, 1),
  addComment: (body, c, now) => void body.comments.push({ at: now, text: c.text }),
  editComment: (body, c) => void ((body.comments[c.comment] as { text: string }).text = c.text),
  removeComment: (body, c) => void body.comments.splice(c.comment, 1),
};

/** Le texte d'une action après un geste sur sa description, ses listes ou ses commentaires. */
export function withBody(content: string, change: BodyChangeItem, now: string): string {
  const body = parseBody(content);
  const operate = OPERATIONS[change.kind] as (b: Body, c: BodyChangeItem, n: string) => void;
  operate(body, change, now);
  return `${header(content)}${serializeBody(titleOf(content), body)}`;
}

/** Une action lue dans son fichier, avec tous ses champs. */
function richAction(path: string, content: string, stages: string[]): CrmActionItem {
  const base = actionOf(path, content, stages);
  const body = parseBody(content);
  const raw = (key: string) =>
    new RegExp(`^${key}:\\s*(.*)$`, "m").exec(header(content))?.[1] ?? null;
  const people = [
    ...(raw("personnes") ?? "").matchAll(/'\[\[([^\]]+)\]\](?: · \[\[([^\]]+)\]\])?'/g),
  ];
  const tags = (/\[(.*)\]/.exec(raw("tags") ?? "")?.[1] ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
  return {
    ...base,
    people: people.map((m) => ({ person: m[1] as string, company: m[2] ?? null })),
    companies: people.map((m) => m[2] ?? null),
    channel: value(content, "canal"),
    project: references(raw("projet"))[0]?.[1] ?? null,
    tags,
    linkedNotes: references(raw("notes")).map((m) => m[1] as string),
    description: body.description,
    checklists: body.lists.map((l) => ({ ...l, done: l.items.filter((i) => i.done).length })),
    comments: body.comments,
  };
}

const filesOf = (state: FakeNotes, crm: string, kind: string) =>
  Object.entries(state.notes).filter(([p]) => p.startsWith(folderOf(crm, kind)));

/** La vue du CRM avec les fiches et les champs complets des actions, lus dans les fichiers. */
export function withActionData(view: CrmItem, state: FakeNotes, crm: string): CrmItem {
  const stages = stagesOf(state.notes[crm]?.content ?? "");
  const actions = filesOf(state, crm, "actions").map(([p, n]) => richAction(p, n.content, stages));
  const tags = [...new Set(actions.flatMap((a) => a.tags))].sort();
  return { ...view, ...listsOf(state, crm, actions), actions, tags };
}

type Writer<K extends CrmActionChangeItem["kind"]> = (
  content: string,
  change: Extract<CrmActionChangeItem, { kind: K }>,
  at: { now: string; company: (person: string) => string | null },
) => string;

const listOrNothing = (items: string[], text: (items: string[]) => string) =>
  items.length === 0 ? null : text(items);

/** Les personnes d'une action après qu'on en a donné ou retiré une. */
function withPeople(content: string, people: { person: string; company: string | null }[]) {
  const items = people.map(
    (p) => `[[${p.person}]]${p.company === null ? "" : ` · [[${p.company}]]`}`,
  );
  return withKey(content, "personnes", listOrNothing(items, quoted));
}

/** Ce qu'écrit chaque geste dans le fichier d'une action. */
const WRITERS: { [K in CrmActionChangeItem["kind"]]: Writer<K> } = {
  title: (t, c) => t.replace(/^# .*$/m, `# ${c.title}`),
  status: (t, c) => withKey(withKey(t, "statut", c.status), "rang", null),
  date: (t, c) => withKey(t, "date", `'${c.date}'`),
  channel: (t, c) => withKey(t, "canal", c.channel),
  project: (t, c) => withKey(t, "projet", c.project && `'[[${c.project}]]'`),
  color: (t, c) => withKey(t, "couleur", c.color),
  tags: (t, c) =>
    withKey(
      t,
      "tags",
      listOrNothing(c.tags, (l) => `[${l.join(", ")}]`),
    ),
  linkedNotes: (t, c) =>
    withKey(
      t,
      "notes",
      listOrNothing(c.notes, (l) => quoted(l.map((n) => `[[${n}]]`))),
    ),
  addPerson: (t, c, at) => {
    const people = richAction("a.md", t, []).people;
    if (people.some((p) => p.person === c.person)) return t;
    return withPeople(t, [...people, { person: c.person, company: at.company(c.person) }]);
  },
  removePerson: (t, c) =>
    withPeople(
      t,
      richAction("a.md", t, []).people.filter((p) => p.person !== c.person),
    ),
  body: (t, c, at) => withBody(t, c.change, at.now),
};

/** Le fichier d'une action après le geste. */
function written(content: string, change: CrmActionChangeItem, at: Parameters<Writer<"title">>[2]) {
  const write = WRITERS[change.kind] as (c: string, g: CrmActionChangeItem, a: typeof at) => string;
  return write(content, change, at);
}

/** Les champs d'un brouillon, un geste chacun, appliqués à l'action qui vient d'être écrite. */
const gesturesOf = (d: CrmActionDraftItem): CrmActionChangeItem[] => [
  ...d.people.map((person) => ({ kind: "addPerson", person }) as const),
  { kind: "channel", channel: d.channel },
  { kind: "project", project: d.project },
  { kind: "color", color: d.color },
  { kind: "tags", tags: d.tags },
  { kind: "linkedNotes", notes: d.linkedNotes },
  { kind: "body", change: { kind: "description", text: d.description } },
];

/** Les gestes d'une action : tous ceux de Rust (`change_crm_action`), sa création complète, sa suppression. */
export function fakeCrmActionGestures(
  state: FakeNotes,
  helpers: CrmHelpers,
  trash: Trash,
  now: () => string,
): Record<string, Handler> {
  const write = (crm: string, path: string, change: CrmActionChangeItem) => {
    const note = state.notes[path];
    if (!note) throw { message: "Cette fiche n'existe plus." };
    const company = (person: string) =>
      references(
        value(
          state.notes[`${folderOf(crm, "personnes")}${person}.md`]?.content ?? "",
          "entreprise",
        ),
      )[0]?.[1] ?? null;
    note.content = written(note.content, change, { now: now(), company });
    note.modified = helpers.tick();
  };
  return {
    change_crm_action: ({ crm, action, change }: Args) => {
      write(
        crm as string,
        actionPath(crm as string, action as string),
        change as CrmActionChangeItem,
      );
      return null;
    },
    create_crm_action: ({ crm, draft }: Args) => {
      const d = draft as CrmActionDraftItem;
      if (d.title.trim() === "") throw { message: "Le titre d'une action ne peut pas être vide." };
      const base = `${FAKE_TODAY}-${helpers.slug(d.title)}`;
      let name = base;
      for (let n = 2; actionPath(crm as string, name) in state.notes; n++)
        name = `${base}-${String(n)}`;
      const path = actionPath(crm as string, name);
      state.notes[path] = {
        content: `---\ntype: crm-action\nstatut: ${d.status ?? "TODO"}\ndate: '${d.date ?? FAKE_TODAY}'\n---\n# ${d.title}\n`,
        modified: helpers.tick(),
      };
      for (const change of gesturesOf(d)) write(crm as string, path, change);
      return name;
    },
    delete_crm_action: ({ crm, action }: Args) => {
      const path = actionPath(crm as string, action as string);
      const note = state.notes[path];
      if (!note) throw { message: "Cette fiche n'existe plus." };
      Reflect.deleteProperty(state.notes, path);
      trash.notes[path] = note;
      return null;
    },
  };
}
