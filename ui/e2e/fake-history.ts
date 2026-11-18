// Historique simulé pour les parcours : les versions de chaque note en mémoire, toutes au moment
// figé de la doublure (16 novembre 2026 à 18:30), départagées par leur rang. Les vraies règles
// (conservation, différences minimales, dossier `.history/`) sont testées côté Rust.

type Handler = (args: Record<string, string>) => unknown;

/** Une version : son identifiant et son texte. */
interface FakeVersion {
  id: string;
  content: string;
}

/** La partie de la doublure qui garde l'historique. */
export interface FakeHistory {
  notes: Record<string, { content: string }>;
  /** Les versions de chaque note, de la plus ancienne à la plus récente. */
  versions: Record<string, FakeVersion[]>;
}

const MOMENT = "2026-11-16 18h30";
const LABEL = "16 novembre 2026 à 18:30";
const rank = (id: string) => /\((\d+)\)$/.exec(id)?.[1];

/** Comme Rust : une version du texte, sauf s'il est déjà celui de la plus récente. */
export function keepFakeVersion(history: FakeHistory, path: string, content: string): void {
  const list = (history.versions[path] ??= []);
  if (list.at(-1)?.content === content) return;
  list.push({ id: list.length === 0 ? MOMENT : `${MOMENT} (${list.length + 1})`, content });
}

/** Comme Rust : les versions suivent la note renommée ou déplacée. */
export function moveFakeVersions(history: FakeHistory, from: string, to: string): void {
  const moved = history.versions[from];
  if (from === to || !moved) return;
  Reflect.deleteProperty(history.versions, from);
  history.versions[to] = [...(history.versions[to] ?? []), ...moved];
}

/** Comparaison simplifiée : les lignes de la note absentes de la version, puis celles de la version. */
function compare(current: string, version: string) {
  const now = current.split("\n");
  const kept = version.split("\n");
  return [
    ...now.filter((line) => !kept.includes(line)).map((text) => ({ kind: "removed", text })),
    ...kept.map((text) => ({ kind: now.includes(text) ? "same" : "added", text })),
  ];
}

export function fakeHistory(
  history: FakeHistory,
  noteContent: (path: string, content: string) => unknown,
): Record<string, Handler> {
  const find = (path: string, id: string) => {
    const version = history.versions[path]?.find((v) => v.id === id);
    if (!version) throw { message: "la version n'existe plus" };
    return version;
  };
  const current = (path: string) => history.notes[path]?.content ?? "";
  return {
    list_versions: ({ path = "" }) =>
      [...(history.versions[path] ?? [])].reverse().map(({ id }) => {
        const n = rank(id);
        return { id, label: n === undefined ? LABEL : `${LABEL} (${n})` };
      }),
    compare_version: ({ path = "", version = "" }) =>
      compare(current(path), find(path, version).content),
    keep_version: ({ path = "" }) => {
      keepFakeVersion(history, path, current(path));
      return null;
    },
    restore_version: ({ path = "", version = "" }) => {
      const restored = find(path, version).content;
      keepFakeVersion(history, path, current(path));
      const note = history.notes[path];
      if (note) note.content = restored;
      return noteContent(path, restored);
    },
  };
}
