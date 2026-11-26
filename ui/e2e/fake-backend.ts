// Partie Rust simulée pour les parcours de test : un espace de travail en mémoire.
// Doublure volontairement simple ; les vraies règles sont testées côté Rust.
import { emit } from "@tauri-apps/api/event";
import { mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { type FakeClaude, fakeClaude, fakeClaudeState } from "./fake-claude";
import { type AttachArgs, type ExportImageArgs, attachFile, keepImage } from "./fake-attachments";
import {
  type FakeConnection,
  fakeConnectionCommands,
  fakeConnectionState,
} from "./fake-connection";
import { type FakeExports, fakeExport } from "./fake-export";
import { type FakeHistory, fakeHistory, keepFakeVersion, moveFakeVersions } from "./fake-history";
import { type FakeMenu, fakeMenu, fakeMenuState } from "./fake-menu";
import { type FakeMeaning, fakeMeaning, fakeMeaningState } from "./fake-meaning";
import { fakeCanvases } from "./fake-canvas";
import { fakeLinks } from "./fake-links";
import { fakeCrms } from "./fake-crm";
import { fakeContentType, fakeMindMaps, fakeNodeResults } from "./fake-mind-map";
import { fakeEntryResults, fakeNotebook } from "./fake-notebook";
import { fakeRenaming } from "./fake-rename";
import { fakeTags } from "./fake-tags";
import { FIRST, fakeWorkspaces } from "./fake-workspaces";
import { type FakeWriting, fakeWriting, fakeWritingState } from "./fake-writing";

interface FakeNote {
  content: string;
  modified: number;
}

export interface FakeBackend
  extends FakeExports, FakeMenu, FakeHistory, FakeWriting, FakeClaude, FakeMeaning, FakeConnection {
  notes: Record<string, FakeNote>;
  folders: string[];
  /** La corbeille : les notes et les dossiers à leur chemin d'origine. */
  trash: { notes: Record<string, FakeNote>; folders: string[] };
  rememberedWorkspace: boolean;
  /** Le dossier que rendra le prochain choix de dossier ; `null` : l'utilisateur annule. */
  nextFolder: string | null;
  failNextSave: boolean;
  calls: string[];
  fullScreen: boolean;
  /** Les pièces jointes écrites, par chemin (`voyage.assets/vue.png`), avec leur taille. */
  attachments: Record<string, number>;
  /** Les cibles de liens dont l'ouverture a été demandée. */
  opened: string[];
  /** Durée d'une recherche en millisecondes, pour simuler un gros espace de travail. */
  searchDuration: number;
  /** Durée de la lecture d'une note en millisecondes (lecture ralentie, voir `doc/code.md`). */
  readDelay: number;
  /** Le plein écran demandé par le Mac lui-même (bouton vert, menu). */
  enterFullScreenFromTheSystem: () => Promise<void>;
  /** Une note modifiée (ou supprimée, avec `null`) hors de l'application, puis annoncée. */
  changeOutside: (path: string, content: string | null) => Promise<void>;
  /** Une note renommée (et peut-être réécrite) hors de l'application, puis annoncée. */
  renameOutside: (from: string, to: string, content: string) => Promise<void>;
}

declare global {
  interface Window {
    backend: FakeBackend;
  }
}

const params = new URLSearchParams(location.search);
const backend: FakeBackend = {
  notes: JSON.parse(params.get("notes") ?? "{}") as Record<string, FakeNote>,
  folders: JSON.parse(params.get("folders") ?? "[]") as string[],
  trash: { notes: {}, folders: [] },
  rememberedWorkspace: params.get("remembered") === "1",
  nextFolder: FIRST.path,
  failNextSave: false,
  calls: [],
  fullScreen: false,
  attachments: {},
  opened: [],
  saveDialogs: [],
  exported: {},
  exportedImages: {},
  printed: [],
  copied: [],
  copiedMarkdown: [],
  versions: {},
  ...fakeMenuState(),
  ...fakeWritingState(params),
  ...fakeClaudeState(params),
  ...fakeMeaningState(params),
  ...fakeConnectionState(params),
  searchDuration: 0,
  // Lecture ralentie : paramètre `readDelay` de l'adresse, ou `VITE_READ_DELAY` pour tous les parcours.
  readDelay: Number(params.get("readDelay") ?? import.meta.env.VITE_READ_DELAY ?? 0),
  enterFullScreenFromTheSystem: async () => {
    backend.fullScreen = true;
    await emit("tauri://resize", { width: 1440, height: 900 });
  },
  changeOutside: async (path, content) => {
    // Comme Rust : le texte que l'application connaissait est gardé en version.
    const known = backend.notes[path]?.content;
    if (known !== undefined && known !== content) keepFakeVersion(backend, path, known);
    if (content === null) Reflect.deleteProperty(backend.notes, path);
    else backend.notes[path] = { content, modified: (clock += 1) };
    await emit("workspace-changed", { notes: [path] });
  },
  renameOutside: async (from, to, content) => {
    const known = backend.notes[from]?.content;
    if (known !== undefined) keepFakeVersion(backend, from, known);
    Reflect.deleteProperty(backend.notes, from);
    backend.notes[to] = { content, modified: (clock += 1) };
    await emit("workspace-changed", { notes: [from, to] });
  },
};
window.backend = backend;
let clock = 1_000;

const workspace = FIRST;

// La note du jour au lancement n'est voulue que par les parcours du journal (`journal=1`) : les
// autres commencent sur la note choisie, comme avant le journal. Un choix déjà gardé reste.
const JOURNAL_KEY = `malorean.journal:${workspace.path}`;
if (params.get("journal") !== "1" && localStorage.getItem(JOURNAL_KEY) === null)
  localStorage.setItem(JOURNAL_KEY, JSON.stringify({ folder: "Journal", atLaunch: false }));

const titleOf = (content: string) => /^# (.+)$/m.exec(content)?.[1]?.trim() ?? null;
const slug = (title: string | null) =>
  (title ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "sans-titre";

const folderOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), 0));
const inFolder = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

function freeName(folder: string, wanted: string, current?: string): string {
  let path = inFolder(folder, `${wanted}.md`);
  for (let n = 2; path !== current && path in backend.notes; n++) {
    path = inFolder(folder, `${wanted}-${n}.md`);
  }
  return path;
}

/** Empreinte d'un contenu : l'interface la renvoie telle quelle, sa forme ne compte pas. */
const fingerprintOf = (content: string) =>
  [...content].reduce((hash, c) => (hash * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16);

const displayedTitle = (content: string) => titleOf(content) ?? "Sans titre";

/** Les étiquettes d'un en-tête, seulement sous la forme `tags: [a, b]` (Rust lit toutes les formes). */
const tagsOf = (content: string) =>
  (/^---\n(?:.*\n)*?tags: \[(.*)\]\n(?:.*\n)*?---\n/.exec(content)?.[1] ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");

const listItem = ([path, note]: [string, FakeNote]) => ({
  path,
  title: path.endsWith(".canvas")
    ? path.replace(/^.*\//, "").replace(/\.canvas$/, "")
    : (titleOf(note.content) ?? "Sans titre"),
  modified: note.modified,
  pinned: note.content.startsWith(PIN_HEADER),
  tags: tagsOf(note.content),
});

type Listed = ReturnType<typeof listItem>;

/** Le tri de la liste, comme Rust : épinglées d'abord, puis par date de modification ou par titre. */
const listOrder =
  (order = "modified") =>
  (a: Listed, b: Listed) =>
    Number(b.pinned) - Number(a.pinned) ||
    (order === "title"
      ? a.title.localeCompare(b.title, "fr", { sensitivity: "base" })
      : b.modified - a.modified);

function listTags() {
  const counts = new Map<string, number>();
  Object.values(backend.notes).forEach((note) =>
    tagsOf(note.content).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)),
  );
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b, "fr"))
    .map(([name, count]) => ({ name, count }));
}

const noteContent = (path: string, content: string) => ({
  path,
  content,
  // Un canvas n'a pas de titre à lui : son titre est son nom de fichier.
  title: path.endsWith(".canvas")
    ? path.replace(/^.*\//, "").replace(/\.canvas$/, "")
    : displayedTitle(content),
  fingerprint: fingerprintOf(content),
});

/** Comme Rust : la version changée ailleurs est gardée dans une copie de conflit (moment figé). */
function keepChangedVersion(path: string, content: string, fingerprint: string) {
  const disk = backend.notes[path];
  if (!disk || fingerprintOf(disk.content) === fingerprint || disk.content === content) return null;
  const stem = path.replace(/^.*\//, "").replace(/\.md$/, "");
  const copy = inFolder(folderOf(path), `${stem} (conflit 2026-11-16 18h30).md`);
  backend.notes[copy] = { content: disk.content, modified: (clock += 1) };
  return copy;
}

/** La note du jour simulée : celle du 16 novembre 2026, le jour de l'horloge figée. */
const DAILY_NAME = "2026-11-16";
const DAILY_TITLE = "16 novembre 2026";

/** Comme Rust : une note du jour dont le titre est encore sa date garde son nom daté. */
const wantedName = (path: string, content: string) =>
  path.endsWith(`${DAILY_NAME}.md`) && titleOf(content) === DAILY_TITLE
    ? DAILY_NAME
    : slug(titleOf(content));

function createDailyNote(journal: string, template: string | null) {
  const path = inFolder(journal, `${DAILY_NAME}.md`);
  addFolders(backend.folders, journal);
  if (path in backend.notes) return { path };
  const model = template === null ? null : backend.notes[template];
  if (model === undefined) throw { message: `la note « ${template} » n'existe pas` };
  const content = model
    ? model.content
        .replace(/^# .*$/m, `# ${DAILY_TITLE}`)
        .replaceAll("{{title}}", DAILY_TITLE)
        .replaceAll("{{date}}", DAILY_TITLE)
        .replaceAll("{{time}}", "18:30")
    : `# ${DAILY_TITLE}\n`;
  backend.notes[path] = { content, modified: (clock += 1) };
  return { path };
}

function save(path: string, content: string, fingerprint: string) {
  if (backend.failNextSave) {
    backend.failNextSave = false;
    throw { message: "stockage indisponible : disque plein" };
  }
  const conflictCopy = keepChangedVersion(path, content, fingerprint);
  const tagsChanged = tagsOf(backend.notes[path]?.content ?? "").join() !== tagsOf(content).join();
  const target = freeName(folderOf(path), wantedName(path, content), path);
  Reflect.deleteProperty(backend.notes, path);
  backend.notes[target] = { content, modified: (clock += 1) };
  moveFakeVersions(backend, path, target);
  return {
    path: target,
    title: displayedTitle(content),
    fingerprint: fingerprintOf(content),
    conflictCopy,
    tagsChanged,
  };
}

const moved = (path: string, from: string, to: string) =>
  path === from || path.startsWith(`${from}/`) ? to + path.slice(from.length) : path;

function moveFolder(from: string, to: string) {
  if (backend.folders.includes(to)) throw { message: `un dossier « ${to} » existe déjà` };
  backend.folders = backend.folders.map((f) => moved(f, from, to));
  backend.notes = Object.fromEntries(
    Object.entries(backend.notes).map(([path, note]) => [moved(path, from, to), note]),
  );
  return to;
}

const treeOrder = (a: string, b: string) =>
  a
    .toLowerCase()
    .split("/")
    .join("\u0000")
    .localeCompare(b.toLowerCase().split("/").join("\u0000"));

/** Sans majuscule ni accent, comme la vraie recherche. */
const folded = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Recherche simplifiée : toutes les notes qui contiennent tous les mots, chacune suivie des entrées
 * de cahier qui les ont aussi ; l'extrait est le texte entier.
 */
function searchNotes(query: string, order?: string) {
  const words = folded(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const has = (text: string) => words.every((word) => folded(text).includes(word));
  const excerpt = (text: string) =>
    text
      .replace(/\s+/g, " ")
      .split(new RegExp(`(${words.join("|")})`, "i"))
      .filter(Boolean)
      .map((part) => ({ text: part, matched: words.includes(folded(part)) }));
  const sort = listOrder(order);
  return Object.entries(backend.notes)
    .filter(([, note]) => has(note.content))
    .sort((a, b) => sort(listItem(a), listItem(b)))
    .flatMap(([path, note]) => {
      const found = {
        path,
        folder: folderOf(path),
        modified: note.modified,
        container: null,
        node: null,
      };
      return [
        {
          ...found,
          title: titleOf(note.content) ?? "Sans titre",
          contentType: fakeContentType(note.content),
          containerTitle: null,
          excerpt: excerpt(note.content),
        },
        ...fakeEntryResults(path, note.content, has).map((entry) => ({
          ...found,
          title: entry.title,
          contentType: "entry" as const,
          container: path,
          containerTitle: entry.containerTitle,
          excerpt: excerpt(entry.text),
        })),
        ...fakeNodeResults(path, note.content, has).map((node) => ({
          ...{ ...found, ...node, contentType: "node" as const, container: path },
          excerpt: excerpt(node.text),
        })),
      ];
    });
}

/** Liens entre notes simplifiés : `[[titre]]`, majuscules et accents ignorés. */
const linkedTitles = (content: string) =>
  [...content.matchAll(/\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g)].map((m) =>
    folded(m[1]?.trim() ?? ""),
  );

function listBacklinks(path: string) {
  const title = folded(titleOf(backend.notes[path]?.content ?? "") ?? "");
  return Object.entries(backend.notes)
    .filter(([other, note]) => other !== path && linkedTitles(note.content).includes(title))
    .sort(([, a], [, b]) => b.modified - a.modified)
    .map(([other, note]) => ({
      path: other,
      title: titleOf(note.content) ?? "Sans titre",
      folder: folderOf(other),
    }));
}

/** Doublure de l'en-tête d'une note épinglée : les vraies règles sont testées côté Rust. */
const PIN_HEADER = "---\npinned: true\n---\n";

function rewritePin(path: string, change: (content: string) => string) {
  const note = backend.notes[path];
  if (!note) throw { message: `la note « ${path} » n'existe pas` };
  note.content = change(note.content);
  return noteContent(path, note.content);
}

const within = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);

/** Le dossier et ses parents, de la racine vers lui. */
const withParents = (folder: string) =>
  folder ? folder.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/")) : [];

function addFolders(target: string[], folder: string) {
  for (const f of withParents(folder)) if (!target.includes(f)) target.push(f);
}

/** Retire de la corbeille les dossiers vidés, en remontant depuis `folder`. */
function pruneTrash(folder: string) {
  for (const f of withParents(folder).reverse()) {
    const used =
      Object.keys(backend.trash.notes).some((n) => within(folderOf(n), f)) ||
      backend.trash.folders.some((other) => other !== f && within(other, f));
    if (used) return;
    backend.trash.folders = backend.trash.folders.filter((other) => other !== f);
  }
}

/** Doublure simple de la corbeille : les vraies règles (suffixes, pièces jointes) sont testées côté Rust. */
const trashCommands: Record<string, (args: Record<string, string>) => unknown> = {
  trash_note: ({ path = "" }) => {
    const note = backend.notes[path];
    if (!note) throw { message: `la note « ${path} » n'existe pas` };
    Reflect.deleteProperty(backend.notes, path);
    backend.trash.notes[path] = note;
    addFolders(backend.trash.folders, folderOf(path));
    return path;
  },
  // Les fiches d'un CRM sont comptées côté Rust : la doublure n'en connaît pas.
  crm_fiches_in_trash: () => 0,
  trash_folder: ({ path = "" }) => {
    addFolders(backend.trash.folders, path);
    for (const f of backend.folders.filter((f) => within(f, path))) {
      addFolders(backend.trash.folders, f);
    }
    backend.folders = backend.folders.filter((f) => !within(f, path));
    for (const [notePath, note] of Object.entries(backend.notes)) {
      if (!within(folderOf(notePath), path)) continue;
      Reflect.deleteProperty(backend.notes, notePath);
      backend.trash.notes[notePath] = note;
    }
    return path;
  },
  list_trash: () => ({
    folders: [...backend.trash.folders].sort(treeOrder),
    notes: Object.entries(backend.trash.notes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, n]) => ({ path, title: titleOf(n.content) ?? "Sans titre" })),
  }),
  restore_note: ({ path = "" }) => {
    const note = backend.trash.notes[path];
    if (!note) throw { message: `la note « ${path} » n'existe pas` };
    const target = freeName(folderOf(path), (path.split("/").at(-1) ?? "").replace(/\.md$/, ""));
    Reflect.deleteProperty(backend.trash.notes, path);
    backend.notes[target] = note;
    addFolders(backend.folders, folderOf(path));
    pruneTrash(folderOf(path));
    return { path: target };
  },
  restore_folder: ({ path = "" }) => {
    for (const f of backend.trash.folders.filter((f) => within(f, path))) {
      addFolders(backend.folders, f);
    }
    for (const notePath of Object.keys(backend.trash.notes)) {
      if (within(folderOf(notePath), path)) trashCommands.restore_note?.({ path: notePath });
    }
    backend.trash.folders = backend.trash.folders.filter((f) => !within(f, path));
    pruneTrash(folderOf(path));
    return path;
  },
  empty_trash: () => {
    backend.trash = { notes: {}, folders: [] };
    return null;
  },
};

/** La dernière reconstruction de l'index : le faux ne la date que par une heure fixe. */
let indexRebuilt: string | null = null;

const commands: Record<string, (args: Record<string, string>) => unknown> = {
  ...trashCommands,
  ...fakeNotebook(backend, { freeName, slug, tick: () => (clock += 1) }),
  ...fakeMindMaps(backend, { freeName, slug, tick: () => (clock += 1) }),
  ...fakeCanvases(backend, { freeName, slug, tick: () => (clock += 1) }),
  ...fakeCrms(backend, { freeName, slug, tick: () => (clock += 1) }),
  ...fakeTags(backend, { tagsOf, tick: () => (clock += 1) }),
  ...fakeRenaming(backend, {
    ...{ titleOf, slug, fingerprint: fingerprintOf, tick: () => (clock += 1) },
  }),
  ...fakeMeaning(backend, {
    ...{ notes: () => backend.notes, listItem, folded },
    folderOf,
  }),
  search_notes: ({ query = "", order }) =>
    new Promise((resolve) =>
      setTimeout(() => resolve(searchNotes(query, order)), backend.searchDuration),
    ),
  ...fakeLinks({ notes: () => backend.notes, titleOf, folded, folderOf }),
  list_all_notes: () =>
    Object.entries(backend.notes)
      .sort(([, a], [, b]) => b.modified - a.modified)
      .map(([path, note]) => ({
        path,
        title: titleOf(note.content) ?? "Sans titre",
        folder: folderOf(path),
      })),
  list_backlinks: ({ path = "" }) => listBacklinks(path),
  ...fakeWorkspaces(params, backend, backend.rememberedWorkspace),
  ...fakeExport(backend),
  ...fakeHistory(backend, noteContent),
  list_notes: ({ folder = "", order }) =>
    Object.entries(backend.notes)
      .filter(([path]) => folderOf(path) === folder)
      .map(listItem)
      .sort(listOrder(order)),
  list_tagged_notes: ({ tag = "", order }) =>
    Object.entries(backend.notes)
      .map(listItem)
      .filter((note) => note.tags.includes(tag))
      .sort(listOrder(order)),
  list_tags: () => listTags(),
  // Le faux n'a pas d'index : la liste et la recherche relisent toujours les notes.
  rebuild_index: () => ((indexRebuilt = "23 novembre 2026 à 14:30"), null),
  index_overview: () => ({
    notes: Object.keys(backend.notes).length,
    total: Object.keys(backend.notes).length,
    rebuilt: indexRebuilt,
  }),
  list_recent_notes: (args) =>
    (args.paths as unknown as string[]).flatMap((path) => {
      const note = backend.notes[path];
      return note ? [listItem([path, note])] : [];
    }),
  // Épingler ne change pas la date de la note.
  pin_note: ({ path = "" }) =>
    rewritePin(path, (c) => (c.startsWith(PIN_HEADER) ? c : PIN_HEADER + c)),
  unpin_note: ({ path = "" }) => rewritePin(path, (c) => c.replace(PIN_HEADER, "")),
  read_note: ({ path = "" }) => {
    const note = backend.notes[path];
    if (!note) throw { message: `la note « ${path} » n'existe pas` };
    const read = noteContent(path, note.content);
    return backend.readDelay > 0
      ? new Promise((resolve) => setTimeout(() => resolve(read), backend.readDelay))
      : read;
  },
  save_note: ({ path = "", content = "", fingerprint = "" }) => save(path, content, fingerprint),
  list_folders: () => [...backend.folders].sort(treeOrder),
  create_folder: ({ parent = "", name = "" }) => {
    const path = inFolder(parent, name);
    if (backend.folders.includes(path)) throw { message: `un dossier « ${path} » existe déjà` };
    backend.folders.push(path);
    return path;
  },
  rename_folder: ({ path = "", name = "" }) => moveFolder(path, inFolder(folderOf(path), name)),
  move_folder: ({ path = "", into = "" }) =>
    moveFolder(path, inFolder(into, path.split("/").at(-1) ?? "")),
  move_note: ({ path = "", into = "" }) => {
    const note = backend.notes[path];
    if (!note) throw { message: `la note « ${path} » n'existe pas` };
    if (folderOf(path) === into) return { path };
    const target = freeName(into, (path.split("/").at(-1) ?? "").replace(/\.md$/, ""));
    Reflect.deleteProperty(backend.notes, path);
    backend.notes[target] = note;
    return { path: target };
  },
  create_note_from_template: ({ template = "", folder = "" }) => {
    const model = backend.notes[template];
    if (!model) throw { message: `la note « ${template} » n'existe pas` };
    const content = model.content
      .replace(/^pinned: .*\r?\n/m, "")
      .replaceAll("{{title}}", displayedTitle(model.content))
      .replaceAll("{{date}}", "16 novembre 2026")
      .replaceAll("{{time}}", "18:30");
    const path = freeName(folder, slug(titleOf(content)));
    backend.notes[path] = { content, modified: (clock += 1) };
    return { path };
  },
  create_daily_note: ({ journal = "", template }) =>
    createDailyNote(journal, (template as string | null | undefined) ?? null),
  create_note: ({ folder = "" }) => {
    const path = freeName(folder, "sans-titre");
    backend.notes[path] = { content: "", modified: (clock += 1) };
    return { path };
  },
};

const windowCommands: Record<string, (args: Record<string, unknown>) => unknown> = {
  "plugin:window|set_fullscreen": ({ value }) => void (backend.fullScreen = value === true),
  "plugin:window|is_fullscreen": () => backend.fullScreen,
  ...fakeMenu(backend),
  ...fakeWriting(backend),
  ...fakeConnectionCommands(backend),
  ...fakeClaude(backend, (path, content) => backend.changeOutside(path, content)),
};

commands.open_link_target = ({ target = "" }) => void backend.opened.push(target);
commands.open_web_address = ({ address = "" }) => void backend.opened.push(address);

mockWindows("main");
mockIPC(
  (command, args) => {
    backend.calls.push(command);
    const windowCommand = windowCommands[command];
    if (windowCommand) return windowCommand((args ?? {}) as Record<string, unknown>);
    if (command === "attach_file") return attachFile(backend, args as unknown as AttachArgs);
    if (command === "export_image") return keepImage(backend, args as unknown as ExportImageArgs);
    const handler = commands[command];
    if (!handler) throw { message: `commande inconnue : ${command}` };
    return handler((args ?? {}) as Record<string, string>);
  },
  { shouldMockEvents: true },
);

mockConvertFileSrc("macos");

/**
 * Parcours des images : l'adresse d'un fichier de l'espace de travail devient celle d'une vraie
 * image servie par le serveur des parcours (`1` : 64 × 40, `tall` : 300 × 600), pour vérifier l'affichage.
 */
const served = { "1": "served-image.png", tall: "served-tall.png" }[
  params.get("servedImages") ?? ""
];
if (served !== undefined)
  (
    window as unknown as { __TAURI_INTERNALS__: { convertFileSrc: (path: string) => string } }
  ).__TAURI_INTERNALS__.convertFileSrc = (path) =>
    `/e2e/${served}?path=${encodeURIComponent(path)}`;
