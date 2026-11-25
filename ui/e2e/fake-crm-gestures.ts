// Les gestes d'un CRM simulé (fiche 0060) : créer une action, changer sa date, la déplacer, changer
// les étapes. Le faux ne connaît que ce que les parcours demandent.
import type { CrmItem } from "../src/bridge";
import {
  type Args,
  CLOSED,
  type CrmHelpers,
  type FakeNotes,
  FAKE_TODAY,
  actionPath,
  stagesOf,
  withKey,
} from "./fake-crm-files";

type Handler = (args: Record<string, string>) => unknown;
interface StageChange {
  kind: string;
  name?: string;
  from?: string;
  to?: string | number;
}

/** Les étapes que donne un changement ; refuse un nom de colonne fixe ou vide. */
function nextStages(stages: string[], change: StageChange): string[] {
  const name = String(change.name ?? change.to ?? "").trim();
  const fixed = ["todo", ...CLOSED.map((s) => s.toLowerCase())];
  if (change.kind !== "move" && (name === "" || fixed.includes(name.toLowerCase())))
    throw { message: `« ${name} » ne peut pas être le nom d'une étape.` };
  if (change.kind === "add") return [...stages, name];
  if (change.kind === "remove") return stages.filter((s) => s !== name);
  if (change.kind === "rename") return stages.map((s) => (s === change.from ? name : s));
  const moved = stages.filter((s) => s !== change.name);
  moved.splice(Number(change.to), 0, String(change.name));
  return moved;
}

type Write = (path: string, change: (content: string) => string) => void;

/** Met l'action dans la colonne, à sa place : le rang de chaque carte d'une colonne ouverte est réécrit. */
function moved(
  { crm, action, status, placement }: Args,
  write: Write,
  read: (p: string) => CrmItem,
) {
  const p = placement as { kind: string; card?: string | null };
  write(actionPath(crm as string, action as string), (t) =>
    withKey(withKey(t, "statut", status as string), "rang", null),
  );
  if (CLOSED.includes(status as string) || p.kind !== "before") return null;
  const column = read(crm as string).columns.find((c) => c.status === status);
  const others = (column?.cards ?? []).filter((n) => n !== action);
  const at = p.card === null || p.card === undefined ? others.length : others.indexOf(p.card);
  others.splice(at, 0, action as string);
  others.forEach((n, i) =>
    write(actionPath(crm as string, n), (t) => withKey(t, "rang", String(i + 1))),
  );
  return null;
}

export function fakeCrmGestures(
  state: FakeNotes,
  helpers: CrmHelpers,
  read: (path: string) => CrmItem,
): Record<string, Handler> {
  const write = (path: string, change: (content: string) => string) => {
    const note = state.notes[path];
    if (!note) throw { message: "Cette fiche n'existe plus." };
    note.content = change(note.content);
    note.modified = helpers.tick();
  };
  /** Les actions d'une étape renommée ou retirée suivent : elles changent de statut (et de rang). */
  const followStage = (crm: string, change: StageChange) => {
    const removed = change.kind === "remove";
    if (!removed && change.kind !== "rename") return;
    const from = removed ? (change.name as string) : (change.from as string);
    const to = removed ? "TODO" : String(change.to).trim();
    for (const a of read(crm).actions.filter((action) => action.status === from))
      write(actionPath(crm, a.name), (t) =>
        withKey(
          withKey(t, "statut", to),
          "rang",
          removed || a.rank === null ? null : String(a.rank),
        ),
      );
  };
  return {
    create_crm_action: ({ crm, draft }: Args) => {
      const d = draft as { title: string; status: string | null; date: string | null };
      const base = `${FAKE_TODAY}-${helpers.slug(d.title)}`;
      let name = base;
      for (let n = 2; actionPath(crm as string, name) in state.notes; n++)
        name = `${base}-${String(n)}`;
      const lines = ["type: crm-action", `statut: ${d.status ?? "TODO"}`];
      lines.push(`date: '${d.date ?? FAKE_TODAY}'`);
      state.notes[actionPath(crm as string, name)] = {
        content: `---\n${lines.join("\n")}\n---\n# ${d.title}\n`,
        modified: helpers.tick(),
      };
      return name;
    },
    change_crm_action: ({ crm, action, change }: Args) => {
      const c = change as { kind: string; date?: string };
      if (c.kind !== "date") throw { message: "geste non simulé" };
      write(actionPath(crm as string, action as string), (t) => withKey(t, "date", `'${c.date}'`));
      return null;
    },
    move_crm_action: (args: Args) => moved(args, write, read),
    change_crm_stages: ({ crm, change }: Args) => {
      const path = crm as string;
      const next = nextStages(stagesOf(state.notes[path]?.content ?? ""), change as StageChange);
      followStage(path, change as StageChange);
      write(path, (c) => withKey(c, "etapes", `[${next.join(", ")}]`));
      return next;
    },
  };
}
