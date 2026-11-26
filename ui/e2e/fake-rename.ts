// Renommer un contenu simulé pour les parcours (fiche 0090) : un nouveau titre, le nom du fichier le suit
// (en kebab-case, jamais d'écrasement), un CRM emmène le dossier de ses fiches, une fiche est refusée.
// Doublure simple ; les vraies règles sont testées côté Rust.
import { keepFakeVersion, moveFakeVersions, type FakeHistory } from "./fake-history";

type Handler = (args: Record<string, string>) => unknown;

interface FakeNotes extends FakeHistory {
  notes: Record<string, { content: string; modified: number }>;
  folders: string[];
}

interface Rules {
  readonly titleOf: (content: string) => string | null;
  readonly slug: (title: string | null) => string;
  readonly tick: () => number;
  readonly fingerprint: (content: string) => string;
}

const TAKEN = { message: "une note de ce dossier porte déjà ce titre" };
const EXTENSION = /\.(md|canvas)$/;
const folderOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), 0));
const inFolder = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
const stemOf = (path: string) => path.replace(/^.*\//, "").replace(EXTENSION, "");
const under = (path: string, folder: string) => path.startsWith(`${folder}/`);
const movedUnder = (path: string, from: string, to: string) =>
  path === from || under(path, from) ? to + path.slice(from.length) : path;

/** Le titre d'une note : sa première ligne `# titre` ; celui d'un canvas est le nom de son fichier. */
const shownTitle = (rules: Rules, path: string, content: string) =>
  path.endsWith(".canvas") ? stemOf(path) : (rules.titleOf(content) ?? "Sans titre");

const retitled = (rules: Rules, content: string, title: string) =>
  rules.titleOf(content) === null
    ? `# ${title}\n${content}`
    : content.replace(/^# .+$/m, `# ${title}`);

/** Le dossier des fiches d'un CRM suit son fichier : celui qui porte son nouveau nom doit être libre. */
function moveFiches(backend: FakeNotes, from: string, to: string) {
  const free = ![...backend.folders, ...Object.keys(backend.notes)].some((p) => under(p, to));
  if (!free) throw TAKEN;
  backend.folders = backend.folders.map((f) => movedUnder(f, from, to));
  backend.notes = Object.fromEntries(
    Object.entries(backend.notes).map(([p, n]) => [movedUnder(p, from, to), n]),
  );
}

/** Le titre tapé, sans blancs superflus ; refusé s'il est vide, ou si la note n'existe pas ou est une fiche. */
function checked(backend: FakeNotes, path: string, typed: string) {
  const title = typed.split(/\s+/).filter(Boolean).join(" ");
  if (title === "") throw { message: "le titre est vide" };
  const note = backend.notes[path];
  if (!note) throw { message: `la note « ${path} » n'existe pas` };
  const type = /^type: (\S+)$/m.exec(note.content)?.[1] ?? "";
  if (type.startsWith("crm-"))
    throw { message: "le nom d'une fiche de CRM se change dans son écran" };
  return { title, note, type };
}

/** Ce que devient le contenu : son texte (un canvas n'en a pas à changer) et son chemin, tiré du titre. */
function planned(rules: Rules, path: string, content: string, title: string) {
  const canvas = path.endsWith(".canvas");
  const name = `${rules.slug(title)}${canvas ? ".canvas" : ".md"}`;
  return {
    canvas,
    content: canvas ? content : retitled(rules, content, title),
    wanted: inFolder(folderOf(path), name),
  };
}

export function fakeRenaming(backend: FakeNotes, rules: Rules): Record<string, Handler> {
  const result = (path: string, content: string) => ({
    path,
    title: shownTitle(rules, path, content),
    fingerprint: rules.fingerprint(content),
    conflictCopy: null,
    tagsChanged: false,
  });
  return {
    rename_note: (args) => {
      const { path, title: typed } = args as { path: string; title: string };
      const { title, note, type } = checked(backend, path, typed);
      const { canvas, content, wanted } = planned(rules, path, note.content, title);
      const same = wanted === path;
      if (same && content === note.content) return result(path, content);
      if (!same && wanted in backend.notes) throw TAKEN;
      if (type === "crm" && !same)
        moveFiches(backend, path.replace(EXTENSION, ""), wanted.replace(EXTENSION, ""));
      // Un canvas garde sa date et n'a pas de texte à mettre en version.
      if (!canvas) keepFakeVersion(backend, path, note.content);
      Reflect.deleteProperty(backend.notes, path);
      backend.notes[wanted] = { content, modified: canvas ? note.modified : rules.tick() };
      moveFakeVersions(backend, path, wanted);
      return result(wanted, content);
    },
  };
}
