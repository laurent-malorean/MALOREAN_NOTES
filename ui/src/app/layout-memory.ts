// Disposition gardée : les colonnes de chaque bibliothèque, gardées à chaque changement et
// retrouvées à sa réouverture.
import type * as Bridge from "../bridge";
import type { Columns } from "../state/columns";
import type { PreferenceStorage } from "../state/focus-preference";
import { loadLayout, saveLayout } from "../state/saved-layout";

export interface LayoutMemoryDeps {
  readonly backend: Pick<typeof Bridge, "listAllNotes">;
  readonly storage: PreferenceStorage;
}

export interface LayoutMemory {
  /**
   * Cette bibliothèque s'ouvre : rend ses colonnes gardées, retrouvées parmi ses notes, ou rien.
   * Les colonnes sont ensuite gardées pour elle.
   */
  restore(library: string): Promise<Columns | null>;
  /** Garde les colonnes pour la bibliothèque ouverte ; rien avant qu'il y en ait une. */
  save(columns: Columns): void;
}

export function createLayoutMemory(deps: LayoutMemoryDeps): LayoutMemory {
  let library: string | null = null;
  return {
    restore: async (path) => {
      const notes = await deps.backend.listAllNotes();
      library = path;
      return loadLayout(deps.storage, path, notes);
    },
    save: (columns) => {
      if (library !== null) saveLayout(deps.storage, library, columns);
    },
  };
}
