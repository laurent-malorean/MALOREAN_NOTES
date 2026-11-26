// Renommer un contenu depuis son menu (fiche 0090) : une note, un canvas, une carte mentale, un
// cahier de recherche ou un CRM prend un nouveau titre, et son fichier le suit. Rust applique les
// règles (nom de fichier en kebab-case, jamais d'écrasement, dossier des fiches d'un CRM) ; ici, la
// fenêtre du titre, puis les onglets, les récentes et les listes qui suivent.
import type * as Bridge from "../bridge";
import type { SaveResult } from "../bridge";
import { askName } from "../screens/name-prompt";
import type { NoteRenaming } from "../screens/note-menu";
import { notesMoved, noteTitled } from "../state/columns";
import { declaredType } from "../state/declared-type";
import { movedPath } from "../state/folders";
import type { OpenColumns } from "./columns";
import type { RecentNotes } from "./recent-notes";

export interface RenamingDeps {
  readonly backend: Pick<typeof Bridge, "readNote" | "renameNote" | "errorMessage">;
  readonly columns: Pick<OpenColumns, "flushedPath" | "update" | "panes">;
  /** Les notes récentes, qui suivent le contenu renommé. */
  readonly recent: Pick<RecentNotes, "moved">;
  readonly workspace: {
    refreshList(): Promise<void>;
    refreshFolders(): Promise<void>;
  };
  /** La fenêtre où se demande le titre : celle des confirmations. */
  readonly dialog: HTMLDialogElement;
  run(action: Promise<unknown>): void;
}

const QUESTION = "Nouveau titre";
const CONFIRM = "Renommer";
const CANVAS_EXTENSION = /\.canvas$/i;
const NOTE_EXTENSION = /\.md$/i;
const CRM_FICHE = /^crm-/;
const CRM = "crm";

/** « le titre est vide » devient « Le titre est vide. », comme une phrase de la fenêtre. */
function sentence(message: string): string {
  const text = message.trim();
  const capital = text.charAt(0).toLocaleUpperCase("fr") + text.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

async function available(deps: RenamingDeps, path: string): Promise<boolean> {
  if (CANVAS_EXTENSION.test(path)) return true;
  try {
    const type = declaredType((await deps.backend.readNote(path)).content);
    return type === null || !CRM_FICHE.test(type);
  } catch {
    return false;
  }
}

/** Les onglets, les récentes et les listes prennent le nouveau chemin et le nouveau titre. */
async function follow(deps: RenamingDeps, from: string, isCrm: boolean, renamed: SaveResult) {
  const folder = (path: string) => path.replace(NOTE_EXTENSION, "");
  // Les fiches d'un CRM sont dans le dossier qui porte son nom : elles suivent le CRM.
  const moved = (path: string) =>
    path === from
      ? renamed.path
      : isCrm
        ? movedPath(path, folder(from), folder(renamed.path))
        : path;
  deps.recent.moved(moved);
  await deps.columns.update((now) =>
    noteTitled(notesMoved(now, moved), renamed.path, renamed.title),
  );
  // Même chemin, titre changé (majuscules) : la colonne n'a pas rechargé la note, elle la relit.
  for (const pane of deps.columns.panes().values())
    if (pane.note() === renamed.path) await pane.followDisk();
  if (isCrm) await deps.workspace.refreshFolders();
  await deps.workspace.refreshList();
}

async function start(deps: RenamingDeps, requested: string) {
  const path = await deps.columns.flushedPath(requested);
  const read = await deps.backend.readNote(path);
  let renamed: SaveResult | null = null;
  const title = await askName(deps.dialog, {
    question: QUESTION,
    initial: read.title,
    confirm: CONFIRM,
    // Rust renomme tout de suite : un refus (titre vide, déjà pris) se lit dans la fenêtre, restée ouverte.
    refuse: async (typed) => {
      try {
        renamed = await deps.backend.renameNote(path, typed);
        return null;
      } catch (error) {
        return sentence(deps.backend.errorMessage(error));
      }
    },
  });
  if (title === null || renamed === null) return;
  const result: SaveResult = renamed;
  if (result.path === path && result.title === read.title) return;
  await follow(deps, path, declaredType(read.content) === CRM, result);
}

export function createNoteRenaming(deps: RenamingDeps): NoteRenaming {
  return {
    available: (path) => available(deps, path),
    start: (path) => deps.run(start(deps, path)),
  };
}
