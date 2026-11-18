// Historique d'une note : la fenêtre qui liste ses versions, montre les différences de celle qu'on
// choisit avec la note actuelle, et y revient (Rust garde d'abord le texte actuel en version).
import type * as Bridge from "../bridge";
import { showHistory } from "../screens/history-view";
import { tabLabel } from "../screens/tabs-view";
import { activeNote, type Columns } from "../state/columns";
import { nameOf } from "../state/folders";
import type { Layout } from "../screens/layout";
import type { OpenColumns } from "./columns";

export interface HistoryDeps {
  readonly backend: Pick<typeof Bridge, "listVersions" | "compareVersion" | "restoreVersion">;
  readonly columns: Pick<OpenColumns, "current" | "flushedPath" | "panes">;
  /** La fenêtre qui montre l'historique : celle des confirmations. */
  readonly layout: Pick<Layout, "confirmation">;
  /** Montre un message quelques secondes. */
  show(message: string): void;
  error(error: unknown): void;
  run(action: Promise<unknown>): void;
}

export interface NoteHistory {
  /** Ouvre l'historique de la note ; sans chemin, celui de la note de la colonne active. */
  show(path?: string): void;
}

export const RESTORED = "Version restaurée";

/** Le titre de la note tel qu'un onglet le montre, sinon son nom de fichier. */
function titleOf(columns: Columns, path: string): string {
  const tab = columns.list.flatMap((column) => column.tabs).find((t) => t.note === path);
  return tab ? tabLabel(tab) : nameOf(path).replace(/\.md$/, "");
}

/** Revient à la version ; les colonnes qui montrent la note relisent son nouveau texte. */
async function restore(deps: HistoryDeps, path: string, version: string) {
  await deps.backend.restoreVersion(path, version);
  const showing = [...deps.columns.panes().values()].find((pane) => pane.note() === path);
  await showing?.followDisk();
  deps.show(RESTORED);
}

async function open(deps: HistoryDeps, path: string) {
  const note = await deps.columns.flushedPath(path);
  const versions = await deps.backend.listVersions(note);
  showHistory(deps.layout.confirmation, {
    title: titleOf(deps.columns.current(), note),
    versions,
    compare: (version) => deps.backend.compareVersion(note, version),
    restore: (version) => deps.run(restore(deps, note, version)),
    error: deps.error,
  });
}

export function createHistory(deps: HistoryDeps): NoteHistory {
  return {
    show: (path) => {
      const note = path ?? activeNote(deps.columns.current());
      if (note !== null) deps.run(open(deps, note));
    },
  };
}
