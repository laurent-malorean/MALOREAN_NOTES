// Partie Rust simulée pour les parcours de test : une bibliothèque en mémoire.
// Doublure volontairement simple ; les vraies règles sont testées côté Rust.
import { emit } from "@tauri-apps/api/event";
import { mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";

interface FakeNote {
  content: string;
  modified: number;
}

export interface FakeBackend {
  notes: Record<string, FakeNote>;
  folders: string[];
  rememberedLibrary: boolean;
  failNextSave: boolean;
  calls: string[];
  fullScreen: boolean;
  /** Le plein écran demandé par le Mac lui-même (bouton vert, menu). */
  enterFullScreenFromTheSystem: () => Promise<void>;
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
  rememberedLibrary: params.get("remembered") === "1",
  failNextSave: false,
  calls: [],
  fullScreen: false,
  enterFullScreenFromTheSystem: async () => {
    backend.fullScreen = true;
    await emit("tauri://resize", { width: 1440, height: 900 });
  },
};
window.backend = backend;
let clock = 1_000;

const library = { name: "Notes", path: "/Users/moi/Notes" };

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

function save(path: string, content: string) {
  if (backend.failNextSave) {
    backend.failNextSave = false;
    throw { message: "stockage indisponible : disque plein" };
  }
  const target = freeName(folderOf(path), slug(titleOf(content)), path);
  Reflect.deleteProperty(backend.notes, path);
  backend.notes[target] = { content, modified: (clock += 1) };
  return { path: target };
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

/** Recherche simplifiée : toutes les notes qui contiennent tous les mots ; l'extrait est la note entière. */
function searchNotes(query: string) {
  const words = folded(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return Object.entries(backend.notes)
    .filter(([, note]) => words.every((word) => folded(note.content).includes(word)))
    .sort(([, a], [, b]) => b.modified - a.modified)
    .map(([path, note]) => {
      const line = note.content.replace(/\s+/g, " ");
      const parts = line.split(new RegExp(`(${words.join("|")})`, "i")).filter(Boolean);
      return {
        path,
        title: titleOf(note.content) ?? "Sans titre",
        folder: folderOf(path),
        modified: note.modified,
        excerpt: parts.map((text) => ({ text, matched: words.includes(folded(text)) })),
      };
    });
}

/** Doublure de l'en-tête d'une note épinglée : les vraies règles sont testées côté Rust. */
const PIN_HEADER = "---\npinned: true\n---\n";

function rewritePin(path: string, change: (content: string) => string) {
  const note = backend.notes[path];
  if (!note) throw { message: `la note « ${path} » n'existe pas` };
  note.content = change(note.content);
  return { path, content: note.content };
}

const commands: Record<string, (args: Record<string, string>) => unknown> = {
  search_notes: ({ query = "" }) => searchNotes(query),
  reopen_last_library: () => (backend.rememberedLibrary ? library : null),
  choose_library: () => library,
  list_notes: ({ folder = "" }) =>
    Object.entries(backend.notes)
      .filter(([path]) => folderOf(path) === folder)
      .map(([path, n]) => ({
        path,
        title: titleOf(n.content) ?? "Sans titre",
        modified: n.modified,
        pinned: n.content.startsWith(PIN_HEADER),
      }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.modified - a.modified),
  // Épingler ne change pas la date de la note.
  pin_note: ({ path = "" }) =>
    rewritePin(path, (c) => (c.startsWith(PIN_HEADER) ? c : PIN_HEADER + c)),
  unpin_note: ({ path = "" }) => rewritePin(path, (c) => c.replace(PIN_HEADER, "")),
  read_note: ({ path = "" }) => {
    const note = backend.notes[path];
    if (!note) throw { message: `la note « ${path} » n'existe pas` };
    return { path, content: note.content };
  },
  save_note: ({ path = "", content = "" }) => save(path, content),
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
  create_note: ({ folder = "" }) => {
    const path = freeName(folder, "sans-titre");
    backend.notes[path] = { content: "", modified: (clock += 1) };
    return { path };
  },
};

const windowCommands: Record<string, (args: Record<string, unknown>) => unknown> = {
  "plugin:window|set_fullscreen": ({ value }) => void (backend.fullScreen = value === true),
  "plugin:window|is_fullscreen": () => backend.fullScreen,
};

mockWindows("main");
mockIPC(
  (command, args) => {
    backend.calls.push(command);
    const windowCommand = windowCommands[command];
    if (windowCommand) return windowCommand((args ?? {}) as Record<string, unknown>);
    const handler = commands[command];
    if (!handler) throw { message: `commande inconnue : ${command}` };
    return handler((args ?? {}) as Record<string, string>);
  },
  { shouldMockEvents: true },
);

mockConvertFileSrc("macos");
