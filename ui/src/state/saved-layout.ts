// Disposition gardée : les colonnes d'une bibliothèque, retrouvées au relancement (fiche 0017).
import type { LibraryNoteItem } from "../bridge/generated/LibraryNoteItem";
import {
  activeNote,
  type Column,
  columnClosed,
  type Columns,
  MAX_COLUMNS,
  type Tab,
  tabClosed,
} from "./columns";
import type { PreferenceStorage } from "./focus-preference";

const KEY = "malorean.layout:";
/** Une disposition d'une autre version est ignorée : on repart des colonnes du lancement. */
const VERSION = 1;

/** Une colonne gardée : sa largeur, les chemins de ses notes dans l'ordre, la place de l'onglet actif. */
interface SavedColumn {
  readonly width: number;
  readonly tabs: readonly string[];
  readonly activeTab: number | null;
}

/** La disposition gardée : ses colonnes de gauche à droite et la place de la colonne active. */
interface SavedLayout {
  readonly version: typeof VERSION;
  readonly columns: readonly SavedColumn[];
  readonly active: number;
}

type LibraryNote = Pick<LibraryNoteItem, "path" | "title">;

/** Les colonnes, mises en texte pour être gardées ; les identifiants et les titres n'en font pas partie. */
export function savedLayout(columns: Columns): string {
  const layout: SavedLayout = {
    version: VERSION,
    active: columns.list.findIndex((column) => column.id === columns.active),
    columns: columns.list.map((column) => ({
      width: column.width,
      tabs: column.tabs.map((tab) => tab.note),
      activeTab:
        column.activeTab === null ? null : column.tabs.findIndex((t) => t.id === column.activeTab),
    })),
  };
  return JSON.stringify(layout);
}

const isIndex = (value: unknown, length: number): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;

/** Les champs d'une valeur lue ; aucun pour `null` (une autre valeur n'a pas les champs attendus). */
const fields = (value: unknown) => (value ?? {}) as Record<string, unknown>;

function readColumn(value: unknown): SavedColumn | null {
  const { width, tabs, activeTab } = fields(value);
  if (!Number.isFinite(width) || !((width as number) > 0)) return null;
  if (!Array.isArray(tabs) || !tabs.every((tab) => typeof tab === "string")) return null;
  const active = tabs.length === 0 ? activeTab === null : isIndex(activeTab, tabs.length);
  return active
    ? { width: width as number, tabs: tabs as string[], activeTab: activeTab as number | null }
    : null;
}

/** La disposition gardée, si elle est lisible et de cette version. */
function readLayout(stored: string | null): SavedLayout | null {
  let value: unknown = null;
  try {
    // Rien de gardé : `JSON.parse(null)` donne `null`.
    value = JSON.parse(stored as string);
  } catch {
    // Valeur abîmée : comme si rien n'était gardé.
  }
  const { version, columns, active } = fields(value);
  if (version !== VERSION || !Array.isArray(columns) || columns.length > MAX_COLUMNS) return null;
  if (!isIndex(active, columns.length)) return null;
  const read = columns.map(readColumn);
  return read.every((column) => column !== null)
    ? { version: VERSION, columns: read, active }
    : null;
}

/** Les colonnes telles que gardées, chaque note gardée prenant son titre dans la bibliothèque. */
function rebuilt(layout: SavedLayout, titles: ReadonlyMap<string, string>): Columns {
  const total = layout.columns.reduce((sum, column) => sum + column.width, 0);
  let nextId = 0;
  const list = layout.columns.map((saved): Column => {
    const id = nextId++;
    const tabs = saved.tabs.map((note): Tab => ({
      id: nextId++,
      note,
      title: titles.get(note) ?? null,
    }));
    const active = saved.activeTab === null ? null : (tabs[saved.activeTab] as Tab).id;
    return { id, tabs, activeTab: active, width: saved.width / total };
  });
  return { list, active: (list[layout.active] as Column).id, nextId };
}

/**
 * Les colonnes gardées, retrouvées dans la bibliothèque telle qu'elle est : une note disparue
 * est oubliée, une colonne restée sans onglet se ferme. Rien s'il ne reste aucune note, ou si la
 * disposition est absente, illisible ou d'une autre version.
 */
export function layoutRestored(
  stored: string | null,
  library: readonly LibraryNote[],
): Columns | null {
  const layout = readLayout(stored);
  if (layout === null) return null;
  const titles = new Map(library.map((note) => [note.path, note.title]));
  const columns = rebuilt(layout, titles);
  const gone = columns.list.flatMap((column) => column.tabs).filter((tab) => !titles.has(tab.note));
  const kept = gone.reduce((next, tab) => tabClosed(next, tab.id), columns);
  const closed = kept.list
    .filter((column) => column.tabs.length === 0)
    .reduce((next, column) => (next.list.length > 1 ? columnClosed(next, column.id) : next), kept);
  return activeNote(closed) === null ? null : closed;
}

/** Les colonnes gardées pour cette bibliothèque ; rien si le stockage est refusé. */
export function loadLayout(
  storage: PreferenceStorage,
  library: string,
  notes: readonly LibraryNote[],
): Columns | null {
  let stored: string | null = null;
  try {
    stored = storage.getItem(KEY + library);
  } catch {
    // Stockage refusé : comme si rien n'était gardé.
  }
  return layoutRestored(stored, notes);
}

/** Garde les colonnes de cette bibliothèque ; sans effet si le stockage est refusé. */
export function saveLayout(storage: PreferenceStorage, library: string, columns: Columns): void {
  try {
    storage.setItem(KEY + library, savedLayout(columns));
  } catch {
    // Confort : la perdre fait seulement repartir des colonnes du lancement.
  }
}
