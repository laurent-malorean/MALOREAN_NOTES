// Modifications extérieures : la bibliothèque a changé hors de l'application.
import type * as Bridge from "../bridge";
import type { LibraryChanged } from "../bridge";
import { notesChangedOutside } from "../state/columns";
import { touchesNote } from "../state/external-change";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { Messages } from "./messages";

export interface ExternalChangesDeps {
  readonly backend: Pick<typeof Bridge, "onLibraryChanged" | "listAllNotes">;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "current" | "change" | "panes">;
  readonly library: {
    refreshFolders(): Promise<void>;
    refreshList(): Promise<void>;
  };
  readonly messages: Pick<Messages, "run" | "error">;
}

/** Dossiers, liste, onglets et notes des colonnes suivent ce qui a changé. */
async function followLibraryChange(deps: ExternalChangesDeps, change: LibraryChanged) {
  if (deps.screen.get().kind !== "library") return;
  await deps.library.refreshFolders();
  await deps.library.refreshList();
  // Avant de relire les notes des colonnes : une note renommée ailleurs n'y passe pas pour supprimée.
  const columns = deps.columns.current();
  const library = await deps.backend.listAllNotes();
  await deps.columns.change(notesChangedOutside(columns, change.notes, library));
  for (const pane of deps.columns.panes().values()) {
    await pane.showBacklinks();
    if (touchesNote(change.notes, pane.note())) await pane.followDisk();
  }
}

/** Écoute les modifications faites hors de l'application. */
export function connectExternalChanges(deps: ExternalChangesDeps): void {
  void deps.backend
    .onLibraryChanged((change) => deps.messages.run(followLibraryChange(deps, change)))
    .catch(deps.messages.error);
}
