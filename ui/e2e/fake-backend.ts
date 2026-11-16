// Partie Rust simulée pour les parcours de test : une bibliothèque en mémoire.
// Doublure volontairement simple ; les vraies règles sont testées côté Rust.
import { mockIPC } from "@tauri-apps/api/mocks";

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

function freeName(wanted: string, current?: string): string {
  let name = `${wanted}.md`;
  for (let n = 2; name !== current && name in backend.notes; n++) name = `${wanted}-${n}.md`;
  return name;
}

function save(fileName: string, content: string) {
  if (backend.failNextSave) {
    backend.failNextSave = false;
    throw { message: "stockage indisponible : disque plein" };
  }
  const target = freeName(slug(titleOf(content)), fileName);
  Reflect.deleteProperty(backend.notes, fileName);
  backend.notes[target] = { content, modified: (clock += 1) };
  return { fileName: target };
}

const commands: Record<string, (args: Record<string, string>) => unknown> = {
  reopen_last_library: () => (backend.rememberedLibrary ? library : null),
  choose_library: () => library,
  list_notes: () =>
    Object.entries(backend.notes)
      .map(([fileName, n]) => ({
        fileName,
        title: titleOf(n.content) ?? "Sans titre",
        modified: n.modified,
      }))
      .sort((a, b) => b.modified - a.modified),
  read_note: ({ fileName = "" }) => {
    const note = backend.notes[fileName];
    if (!note) throw { message: `la note « ${fileName} » n'existe pas` };
    return { fileName, content: note.content };
  },
  save_note: ({ fileName = "", content = "" }) => save(fileName, content),
  create_note: () => {
    const fileName = freeName("sans-titre");
    backend.notes[fileName] = { content: "", modified: (clock += 1) };
    return { fileName };
  },
};

mockIPC((command, args) => {
  backend.calls.push(command);
  const handler = commands[command];
  if (!handler) throw { message: `commande inconnue : ${command}` };
  return handler((args ?? {}) as Record<string, string>);
});
