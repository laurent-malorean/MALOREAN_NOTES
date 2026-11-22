// Cahiers de recherche (fiche 0041) : en créer un, et y ajouter une entrée par la fenêtre de
// saisie, depuis le « + » d'un cahier ou sans en ouvrir. Rust écrit l'entrée ; les colonnes qui
// montrent le cahier relisent sa nouvelle version et montrent l'entrée ajoutée.
import type * as Bridge from "../bridge";
import type { WorkspaceNoteItem } from "../bridge";
import { askEntry } from "../screens/entry-window";
import { askName } from "../screens/name-prompt";
import { activeNote } from "../state/columns";
import { lineStart } from "../state/research-notebook";
import { currentFolder } from "../state/screen";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { Messages } from "./messages";
import type { Workspace } from "./workspace";

export interface ResearchNotebooksDeps extends Pick<Messages, "show" | "error"> {
  readonly backend: Pick<
    typeof Bridge,
    "listResearchNotebooks" | "listEntries" | "addEntry" | "createResearchNotebook"
  >;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "current" | "panes" | "activePane" | "openNote">;
  readonly workspace: Pick<Workspace, "refreshList">;
  /** La fenêtre où s'ouvrent la fenêtre de saisie et la demande du titre d'un nouveau cahier : celle des confirmations. */
  readonly dialog: HTMLDialogElement;
}

export interface ResearchNotebooks {
  /** Fait choisir le titre d'un nouveau cahier, le crée dans le dossier affiché et l'ouvre. */
  create(): Promise<void>;
  /** Ouvre la fenêtre de saisie : pour le cahier `path` (son « + »), sinon pour un cahier à choisir. */
  add(path?: string): Promise<void>;
}

export const NO_NOTEBOOK =
  "Aucun cahier de recherche dans cet espace de travail : « Nouveau cahier de recherche » en crée un.";
export const NEW_NOTEBOOK = {
  question: "Titre du nouveau cahier de recherche",
  initial: "Cahier de recherche",
  confirm: "Créer",
};

async function create(deps: ResearchNotebooksDeps) {
  if (deps.screen.get().kind !== "workspace") return;
  const title = await askName(deps.dialog, NEW_NOTEBOOK);
  if (title === null) return;
  const created = await deps.backend.createResearchNotebook(
    currentFolder(deps.screen.get()),
    title,
  );
  await deps.workspace.refreshList();
  await deps.columns.openNote(created.path);
}

/**
 * Les cahiers proposés et celui choisi d'abord : le cahier du « + », sans choix (`null`), sinon
 * tous, celui de la colonne active d'abord.
 */
function choices(notebooks: WorkspaceNoteItem[], path: string | undefined, active: string | null) {
  if (path !== undefined) return { offered: null, chosen: path };
  const chosen = notebooks.find((n) => n.path === active) ?? notebooks[0];
  return chosen === undefined ? null : { offered: notebooks, chosen: chosen.path };
}

async function add(deps: ResearchNotebooksDeps, path: string | undefined) {
  if (deps.screen.get().kind !== "workspace") return;
  const notebooks = await deps.backend.listResearchNotebooks();
  const offer = choices(notebooks, path, activeNote(deps.columns.current()));
  if (offer === null) return deps.show(NO_NOTEBOOK, "info");
  const input = await askEntry(deps.dialog, {
    notebooks: offer.offered,
    chosen: offer.chosen,
    entriesOf: deps.backend.listEntries,
    error: deps.error,
  });
  if (input === null) return;
  const entry = await deps.backend.addEntry(input.notebook, input.text, input.corrected);
  await deps.workspace.refreshList();
  for (const pane of deps.columns.panes().values())
    if (pane.note() === input.notebook) await pane.followDisk();
  const active = deps.columns.activePane();
  if (active.note() === input.notebook) {
    const at = lineStart(active.editor.content(), entry.line);
    active.editor.restore({ anchor: at, head: at, top: at, offset: 0 });
  }
  const title = notebooks.find((n) => n.path === input.notebook)?.title ?? input.notebook;
  deps.show(`Entrée ajoutée à « ${title} »`);
}

export function createResearchNotebooks(deps: ResearchNotebooksDeps): ResearchNotebooks {
  return { create: () => create(deps), add: (path) => add(deps, path) };
}
