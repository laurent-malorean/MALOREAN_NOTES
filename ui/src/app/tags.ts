// Étiquettes : filtrer la liste des notes par une étiquette, et retirer ce filtre.
import type * as Bridge from "../bridge";
import { activeTag, currentFolder, selectedNote, tagCleared, tagSelected } from "../state/screen";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";

export interface TagsDeps {
  readonly backend: Pick<typeof Bridge, "listTaggedNotes" | "listNotes">;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "activePane" | "showNote">;
  run(action: Promise<unknown>): void;
}

export interface Tags {
  /**
   * Montre les notes de toute la bibliothèque qui portent cette étiquette, ce qui est tapé étant
   * enregistré d'abord ; la colonne active montre la première. Rechoisir celle du filtre ne
   * relit rien.
   */
  select(tag: string): Promise<void>;
  /** Retire le filtre : la liste montre de nouveau le dossier. Faux s'il n'y avait pas de filtre. */
  clear(): boolean;
}

async function selectTag(deps: TagsDeps, tag: string) {
  if (activeTag(deps.screen.get()) === tag) return;
  await deps.columns.activePane().flush();
  await deps.screen.answer(deps.backend.listTaggedNotes(tag), (now, notes) =>
    tagSelected(now, tag, notes),
  );
  await deps.columns.showNote(selectedNote(deps.screen.get()));
}

export function createTags(deps: TagsDeps): Tags {
  return {
    select: (tag) => selectTag(deps, tag),
    clear: () => {
      const screen = deps.screen.get();
      if (activeTag(screen) === null) return false;
      deps.run(deps.screen.answer(deps.backend.listNotes(currentFolder(screen)), tagCleared));
      return true;
    },
  };
}
