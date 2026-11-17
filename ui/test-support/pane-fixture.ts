// Une colonne et ses voisines pour les tests d'écran : bibliothèque en mémoire, minuteur manuel.
import { EditorView } from "@codemirror/view";
import type { AttachmentOrigin } from "../src/bridge";
import type { LinkingNoteItem } from "../src/bridge/generated/LinkingNoteItem";
import type { SaveResult } from "../src/bridge/generated/SaveResult";
import type { Scheduler } from "../src/state/autosave";
import type { ColumnParts } from "../src/screens/columns-view";
import { createPane, type Pane, type PaneBackend } from "../src/screens/note-pane";
import {
  createSharedNotes,
  type SharedNotes,
  type SharedNotesBackend as SharedBackend,
} from "../src/screens/shared-notes";

/** Une bibliothèque en mémoire : chaque note, son contenu ; l'empreinte est le contenu même. */
export function fakeBackend(notes: Record<string, string>) {
  const calls: string[] = [];
  const backlinks: Record<string, LinkingNoteItem[]> = {};
  /** Une réponse retenue jusqu'à ce que sa porte s'ouvre : « lire a.md », « liens a.md ». */
  const gates: Record<string, Promise<void>> = {};
  const backend: PaneBackend & SharedBackend & { fail: boolean } = {
    fail: false,
    readNote: async (path) => {
      calls.push(`lire ${path}`);
      await gates[`lire ${path}`];
      const content = notes[path];
      if (content === undefined) throw new Error(`${path} absente`);
      return { path, content, title: `titre de ${content}`, fingerprint: content };
    },
    saveNote: (path, content, fingerprint) => {
      calls.push(`enregistrer ${path} ${fingerprint}`);
      if (backend.fail) return Promise.reject(new Error("disque plein"));
      const renamed = content.startsWith("# Nouveau") ? "nouveau.md" : path;
      Reflect.deleteProperty(notes, path);
      notes[renamed] = content;
      const result: SaveResult = {
        path: renamed,
        title: content,
        fingerprint: content,
        conflictCopy: null,
      };
      return Promise.resolve(result);
    },
    listBacklinks: async (path) => {
      calls.push(`liens ${path}`);
      await gates[`liens ${path}`];
      return backlinks[path] ?? [];
    },
    attachFile: (path: string, file: File, origin: AttachmentOrigin) => {
      calls.push(`joindre ${path} ${file.name} ${origin.kind}`);
      if (backend.fail) return Promise.reject(new Error("refusé"));
      return Promise.resolve({ markdown: `![](${file.name})` });
    },
    openAttachment: (path, target) => {
      calls.push(`ouvrir ${path} ${target}`);
      return backend.fail ? Promise.reject(new Error("introuvable")) : Promise.resolve(null);
    },
  };
  /** Retient la réponse `call` ; rend de quoi la laisser passer. */
  const hold = (call: string) => {
    let open = () => {};
    gates[call] = new Promise((resolve) => (open = resolve));
    return open;
  };
  return { backend, calls, notes, backlinks, hold };
}

/** Un minuteur qu'on déclenche à la main. */
export function manualScheduler() {
  let pending: (() => void) | null = null;
  const scheduler: Scheduler = {
    schedule: (run) => {
      pending = run;
      return () => (pending = null);
    },
  };
  return { scheduler, fire: () => pending?.() };
}

/** Ce que l'on observe d'une colonne posée : son élément, ses événements, son éditeur. */
function column(shared: SharedNotes, backend: PaneBackend, events: string[], errors: string[]) {
  const element = document.createElement("section");
  const backlinks = document.createElement("nav");
  element.append(backlinks);
  document.body.append(element);
  const parts: ColumnParts = { element, backlinks };
  const images: string[] = [];
  const pane: Pane = createPane(parts, {
    backend,
    shared,
    events: {
      openNote: (path) => events.push(`ouvrir ${path}`),
      openLink: (title) => events.push(`lien ${title}`),
      error: (error) => errors.push((error as Error).message),
    },
    resolveImage: (src, note) => {
      images.push(`${note ?? "aucune"} ${src}`);
      return src;
    },
  });
  const view = () => EditorView.findFromDOM(element.querySelector(".cm-editor") as HTMLElement);
  /** Tape `text` à la fin de la note. */
  const type = (text: string) => {
    const editor = view() as EditorView;
    editor.dispatch({ changes: { from: editor.state.doc.length, insert: text } });
  };
  const text = () => view()?.state.doc.toString();
  return { pane, parts, images, view, type, text };
}

/**
 * Des colonnes qui partagent les notes qu'elles montrent, sur une bibliothèque en mémoire ;
 * `columns[0]` est aussi à plat, pour les tests d'une seule colonne.
 */
export function mountColumns(
  notes: Record<string, string> = { "a.md": "# A", "b.md": "# B" },
  count = 1,
) {
  document.body.replaceChildren();
  const fake = fakeBackend(notes);
  const timer = manualScheduler();
  const events: string[] = [];
  const titles: string[] = [];
  const errors: string[] = [];
  const shared = createSharedNotes({
    backend: fake.backend,
    scheduler: timer.scheduler,
    events: {
      saved: (from, result) => events.push(`enregistrée ${from} → ${result.path}`),
      titled: (path, title) => titles.push(`${path} : ${title}`),
      deleted: () => events.push("supprimée"),
      error: (error) => errors.push((error as Error).message),
    },
  });
  const columns = Array.from({ length: count }, () => column(shared, fake.backend, events, errors));
  const first = columns[0] as ReturnType<typeof column>;
  return { ...first, columns, shared, ...fake, ...timer, events, titles, errors };
}
