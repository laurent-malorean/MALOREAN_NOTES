// Cahiers de recherche (fiches 0041 et 0095) : en créer un, copier la référence d'une entrée,
// et y ajouter une entrée par la zone de saisie
// en bas de sa page. Rust écrit l'entrée ; les colonnes qui
// montrent le cahier relisent sa nouvelle version et montrent l'entrée ajoutée.
import type * as Bridge from "../bridge";
import { askName } from "../screens/name-prompt";
import { lineStart } from "../state/research-notebook";
import { currentFolder } from "../state/screen";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { Messages } from "./messages";
import type { Workspace } from "./workspace";

export interface ResearchNotebooksDeps extends Pick<Messages, "show" | "error"> {
  readonly backend: Pick<typeof Bridge, "addEntry" | "copyPlainText" | "createResearchNotebook">;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "current" | "panes" | "activePane" | "openNote">;
  readonly workspace: Pick<Workspace, "refreshList">;
  /** La fenêtre où s'ouvre la demande du titre d'un nouveau cahier : celle des confirmations. */
  readonly dialog: HTMLDialogElement;
}

export interface ResearchNotebooks {
  /** Fait choisir le titre d'un nouveau cahier, le crée dans `folder` (le dossier affiché par défaut) et l'ouvre. */
  create(folder?: string): Promise<void>;
  /** Ajoute `text` au cahier `path` (sa zone de saisie) ; dit si c'est fait, l'erreur étant alors affichée. */
  add(path: string, text: string): Promise<boolean>;
  /** Copie en texte brut la référence d'une entrée (`Levures · 0007`) et le dit ; l'erreur est affichée. */
  copyReference(reference: string): Promise<void>;
}

export const NEW_NOTEBOOK = {
  question: "Titre du nouveau cahier de recherche",
  initial: "Cahier de recherche",
  confirm: "Créer",
};

async function create(deps: ResearchNotebooksDeps, folder?: string) {
  if (deps.screen.get().kind !== "workspace") return;
  const title = await askName(deps.dialog, NEW_NOTEBOOK);
  if (title === null) return;
  const created = await deps.backend.createResearchNotebook(
    folder ?? currentFolder(deps.screen.get()),
    title,
  );
  await deps.workspace.refreshList();
  await deps.columns.openNote(created.path);
}

async function add(deps: ResearchNotebooksDeps, path: string, text: string): Promise<boolean> {
  if (deps.screen.get().kind !== "workspace") return false;
  try {
    const entry = await deps.backend.addEntry(path, text);
    await deps.workspace.refreshList();
    for (const pane of deps.columns.panes().values())
      if (pane.note() === path) await pane.followDisk();
    const active = deps.columns.activePane();
    if (active.note() === path) {
      const at = lineStart(active.editor.content(), entry.line);
      active.editor.restore({ anchor: at, head: at, top: at, offset: 0 });
    }
    deps.show("Entrée ajoutée au cahier");
    return true;
  } catch (error) {
    deps.error(error);
    return false;
  }
}

async function copyReference(deps: ResearchNotebooksDeps, reference: string): Promise<void> {
  try {
    await deps.backend.copyPlainText(reference);
    deps.show("Référence copiée");
  } catch (error) {
    deps.error(error);
  }
}

export function createResearchNotebooks(deps: ResearchNotebooksDeps): ResearchNotebooks {
  return {
    create: (folder) => create(deps, folder),
    add: (path, text) => add(deps, path, text),
    copyReference: (reference) => copyReference(deps, reference),
  };
}
