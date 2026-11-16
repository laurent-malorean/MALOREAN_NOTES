// Partie Rust simulée pour les parcours de test : une bibliothèque en mémoire.
// Doublure volontairement simple ; les vraies règles sont testées côté Rust.
import { mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";

interface FakeNote {
  content: string;
  modified: number;
}

export interface FakeBackend {
  notes: Record<string, FakeNote>;
  rememberedLibrary: boolean;
  failNextSave: boolean;
  calls: string[];
}

declare global {
  interface Window {
    backend: FakeBackend;
  }
}

const params = new URLSearchParams(location.search);
const backend: FakeBackend = {
  notes: JSON.parse(params.get("notes") ?? "{}") as Record<string, FakeNote>,
  rememberedLibrary: params.get("remembered") === "1",
  failNextSave: false,
  calls: [],
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

const commands: Record<string, (args: Record<string, string>) => unknown> = {
  reopen_last_library: () => (backend.rememberedLibrary ? library : null),
  choose_library: () => library,
  list_notes: ({ folder = "" }) =>
    Object.entries(backend.notes)
      .filter(([path]) => folderOf(path) === folder)
      .map(([path, n]) => ({
        path,
        title: titleOf(n.content) ?? "Sans titre",
        modified: n.modified,
      }))
      .sort((a, b) => b.modified - a.modified),
  read_note: ({ path = "" }) => {
    const note = backend.notes[path];
    if (!note) throw { message: `la note « ${path} » n'existe pas` };
    return { path, content: note.content };
  },
  save_note: ({ path = "", content = "" }) => save(path, content),
  create_note: ({ folder = "" }) => {
    const path = freeName(folder, "sans-titre");
    backend.notes[path] = { content: "", modified: (clock += 1) };
    return { path };
  },
};

mockIPC((command, args) => {
  backend.calls.push(command);
  const handler = commands[command];
  if (!handler) throw { message: `commande inconnue : ${command}` };
  return handler((args ?? {}) as Record<string, string>);
});

mockConvertFileSrc("macos");
