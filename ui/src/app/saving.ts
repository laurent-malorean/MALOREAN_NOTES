// Enregistrement : ce que les notes partagées annoncent après une lecture ou un enregistrement.
import type { SaveResult } from "../bridge";
import type { SharedNotesEvents } from "../screens/shared-notes";
import { notesMoved, noteTitled } from "../state/columns";
import type { OpenColumns } from "./columns";
import type { Messages } from "./messages";
import type { RecentNotes } from "./recent-notes";

export interface SavingDeps {
  readonly columns: Pick<OpenColumns, "update">;
  readonly messages: Messages;
  readonly library: {
    refreshFolders(): Promise<void>;
    refreshList(): Promise<void>;
    refreshTags(): Promise<void>;
  };
  /** Les notes récentes, qui suivent une note renommée par son titre. */
  readonly recent: Pick<RecentNotes, "moved">;
}

/** Ce qui est tapé dans une colonne est enregistré : la note a peut-être changé de nom. */
function noteSaved(deps: SavingDeps, from: string, saved: SaveResult) {
  const { run } = deps.messages;
  if (saved.path !== from) deps.recent.moved((path) => (path === from ? saved.path : path));
  run(
    deps.columns.update((now) =>
      noteTitled(
        notesMoved(now, (path) => (path === from ? saved.path : path)),
        saved.path,
        saved.title,
      ),
    ),
  );
  if (saved.conflictCopy !== null) {
    deps.messages.show(
      `Cette note a aussi changé hors de l'application : l'autre version est gardée dans « ${saved.conflictCopy} ».`,
    );
    run(deps.library.refreshFolders());
  } else if (saved.tagsChanged) {
    run(deps.library.refreshTags());
  }
  run(deps.library.refreshList());
}

/** Les colonnes, la liste et les messages suivent ce que font les notes partagées. */
export function savingEvents(deps: SavingDeps): SharedNotesEvents {
  return {
    saved: (from, saved) => noteSaved(deps, from, saved),
    titled: (path, title) =>
      deps.messages.run(deps.columns.update((now) => noteTitled(now, path, title))),
    deleted: () =>
      deps.messages.show(
        "Cette note a été supprimée hors de l'application : son texte reste ici, et elle sera recréée à la prochaine modification.",
      ),
    error: (error) => deps.messages.error(error),
  };
}
