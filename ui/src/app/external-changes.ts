// Modifications extérieures : l'espace de travail a changé hors de l'application.
import type * as Bridge from "../bridge";
import type { WorkspaceChanged } from "../bridge";
import { notesChangedOutside } from "../state/columns";
import { touchesNote } from "../state/external-change";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { Messages } from "./messages";

export interface ExternalChangesDeps {
  readonly backend: Pick<typeof Bridge, "onWorkspaceChanged" | "listAllNotes">;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "current" | "change" | "panes">;
  readonly workspace: {
    refreshFolders(): Promise<void>;
    refreshList(): Promise<void>;
  };
  readonly messages: Pick<Messages, "run" | "error">;
}

/** Dossiers, liste, onglets et notes des colonnes suivent ce qui a changé. */
async function followWorkspaceChange(deps: ExternalChangesDeps, change: WorkspaceChanged) {
  if (deps.screen.get().kind !== "workspace") return;
  await deps.workspace.refreshFolders();
  await deps.workspace.refreshList();
  // Avant de relire les notes des colonnes : une note renommée ailleurs n'y passe pas pour supprimée.
  const columns = deps.columns.current();
  const workspace = await deps.backend.listAllNotes();
  await deps.columns.change(notesChangedOutside(columns, change.notes, workspace));
  for (const pane of deps.columns.panes().values()) {
    await pane.showBacklinks();
    await pane.showRelated();
    // La note des favoris a pu changer à la main : l'étoile de chaque colonne se relit.
    await pane.showStar();
    if (touchesNote(change.notes, pane.note())) await pane.followDisk();
    else await pane.followCrm(change.notes);
  }
}

/** Écoute les modifications faites hors de l'application. */
export function connectExternalChanges(deps: ExternalChangesDeps): void {
  void deps.backend
    .onWorkspaceChanged((change) => deps.messages.run(followWorkspaceChange(deps, change)))
    .catch(deps.messages.error);
}
