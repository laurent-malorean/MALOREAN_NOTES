// Une colonne et ses voisines pour les tests d'écran : espace de travail en mémoire, minuteur manuel.
import { EditorView } from "@codemirror/view";
import type { AttachmentOrigin } from "../src/bridge";
import type { NoteListItem } from "../src/bridge";
import type { LinkingNoteItem } from "../src/bridge/generated/LinkingNoteItem";
import type { SaveResult } from "../src/bridge/generated/SaveResult";
import type { Scheduler } from "../src/state/autosave";
import type { ColumnParts } from "../src/screens/columns-view";
import type { StarState } from "../src/screens/favorite-star";
import {
  createPane,
  type Pane,
  type PaneBackend,
  type PaneFavorites,
  type PaneTags,
} from "../src/screens/note-pane";
import {
  createSharedNotes,
  type SharedNotes,
  type SharedNotesBackend as SharedBackend,
} from "../src/screens/shared-notes";

/** Le pont d'une colonne ; `relatedNotes` rend les notes proches posées dans `related`. */
type FakePaneBackend = PaneBackend &
  SharedBackend & {
    fail: boolean;
    failVersion: boolean;
    relatedNotes: (path: string) => Promise<NoteListItem[]>;
  };

/** Ce que la fausse application garde pour les colonnes : les notes proches demandées, les étiquettes de chaque contenu (celles du fichier, que les gestes du champ changent). */
function fakeColumnState() {
  const tags: Record<string, string[]> = {};
  const tagCalls: string[] = [];
  const tagsChanged = { count: 0 };
  const paneTags: PaneTags = {
    read: (path) => (tagCalls.push(`lire ${path}`), Promise.resolve(tags[path] ?? [])),
    change: (path, changed) => {
      tagCalls.push(`changer ${path} ${changed.join(",")}`);
      tags[path] = [...changed];
      return Promise.resolve([...changed]);
    },
    suggestions: () =>
      Promise.resolve([
        { name: "perso", count: 4 },
        { name: "voyage", count: 1 },
      ]),
    changed: () => void (tagsChanged.count += 1),
  };
  // L'étoile de chaque contenu, creuse tant qu'on n'a rien dit ; les appels de la colonne y sont notés.
  const stars: Record<string, StarState> = {};
  const starCalls: string[] = [];
  const starFails = { on: false };
  const paneFavorites: PaneFavorites = {
    state: (path) => {
      starCalls.push(`état ${path}`);
      return starFails.on
        ? Promise.reject(new Error("préférences illisibles"))
        : Promise.resolve(stars[path] ?? "empty");
    },
    toggle: (path, state) => (starCalls.push(`basculer ${path} ${state}`), Promise.resolve()),
  };
  return {
    ...{ tags, tagCalls, tagsChanged, paneTags, relatedShown: { on: false } },
    ...{ stars, starCalls, starFails, paneFavorites },
  };
}

/** Un espace de travail en mémoire : chaque note, son contenu ; l'empreinte est le contenu même. */
export function fakeBackend(notes: Record<string, string>) {
  const calls: string[] = [];
  const backlinks: Record<string, LinkingNoteItem[]> = {};
  const related: Record<string, NoteListItem[]> = {};
  const gates: Record<string, Promise<void>> = {};
  const backend: FakePaneBackend = {
    fail: false,
    failVersion: false,
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
        tagsChanged: false,
      };
      return Promise.resolve(result);
    },
    keepVersion: (path) => {
      calls.push(`version ${path}`);
      return backend.failVersion
        ? Promise.reject(new Error("historique plein"))
        : Promise.resolve(null);
    },
    listBacklinks: (path) => answered("liens", path, backlinks),
    relatedNotes: (path) => answered("proches", path, related),
    attachFile: (path: string, file: File, origin: AttachmentOrigin) => {
      calls.push(`joindre ${path} ${file.name} ${origin.kind}`);
      if (backend.fail) return Promise.reject(new Error("refusé"));
      return Promise.resolve({ markdown: `![](${file.name})` });
    },
    openLinkTarget: (path, target) => {
      calls.push(`ouvrir ${path} ${target}`);
      return backend.fail ? Promise.reject(new Error("introuvable")) : Promise.resolve(null);
    },
  };
  /** Note l'appel, attend sa porte, rend la liste de `path`. */
  const answered = async <T>(call: string, path: string, lists: Record<string, T[]>) => {
    calls.push(`${call} ${path}`);
    await gates[`${call} ${path}`];
    return lists[path] ?? [];
  };
  /** Retient la réponse `call` (« lire a.md », « liens a.md ») jusqu'à ce que sa porte s'ouvre ; rend de quoi la laisser passer. */
  const hold = (call: string) => {
    let open = () => {};
    gates[call] = new Promise((resolve) => (open = resolve));
    return open;
  };
  return { backend, calls, notes, backlinks, related, hold, ...fakeColumnState() };
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
function column(
  shared: SharedNotes,
  fake: ReturnType<typeof fakeBackend>,
  events: string[],
  errors: string[],
) {
  const { backend } = fake;
  const element = document.createElement("section");
  const tags = document.createElement("div");
  const backlinks = document.createElement("nav");
  const related = document.createElement("nav");
  const star = document.createElement("button");
  element.append(tags, star, backlinks, related);
  document.body.append(element);
  const parts: ColumnParts = { element, tags, star, backlinks, related };
  const images: string[] = [];
  const pane: Pane = createPane(parts, {
    backend,
    shared,
    events: {
      openNote: (path) => events.push(`ouvrir ${path}`),
      openLink: (title) => events.push(`lien ${title}`),
      error: (error) => errors.push((error as Error).message),
    },
    related: { enabled: () => fake.relatedShown.on, notes: backend.relatedNotes },
    tags: fake.paneTags,
    favorites: fake.paneFavorites,
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
 * Des colonnes qui partagent les notes qu'elles montrent, sur un espace de travail en mémoire ;
 * `columns[0]` est aussi à plat, pour les tests d'une seule colonne.
 */
export function mountColumns(
  notes: Record<string, string> = { "a.md": "# A", "b.md": "# B" },
  count = 1,
) {
  document.body.replaceChildren();
  const fake = fakeBackend(notes);
  const timer = manualScheduler();
  const versionTimer = manualScheduler();
  const events: string[] = [];
  const titles: string[] = [];
  const errors: string[] = [];
  const shared = createSharedNotes({
    backend: fake.backend,
    scheduler: timer.scheduler,
    versionScheduler: versionTimer.scheduler,
    events: {
      saved: (from, result) => events.push(`enregistrée ${from} → ${result.path}`),
      titled: (path, title) => titles.push(`${path} : ${title}`),
      deleted: () => events.push("supprimée"),
      error: (error) => errors.push((error as Error).message),
    },
  });
  const columns = Array.from({ length: count }, () => column(shared, fake, events, errors));
  const first = columns[0] as ReturnType<typeof column>;
  const fireVersion = versionTimer.fire;
  return { ...first, columns, shared, ...fake, ...timer, fireVersion, events, titles, errors };
}
