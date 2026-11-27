// Ce que l'agenda 12 d'une colonne demande à l'application (fiche 0104) : le pont vers Rust, la fenêtre qui
// demande comment clore, la corbeille, et l'ouverture d'une note dans la colonne active.
import type * as Bridge from "../bridge";
import type { Agenda12Deps } from "../screens/agenda-12-pane";
import { askClosing } from "../screens/confirmation";
import type { OpenColumns } from "./columns";
import type { Trash } from "./trash";

/** Ce que l'agenda 12 d'une colonne demande à Rust. */
export type Agenda12HostBackend = Pick<
  typeof Bridge,
  | "readAgenda12"
  | "changeAgenda12Columns"
  | "createAgenda12Event"
  | "readAgenda12Event"
  | "changeAgenda12Event"
  | "closeAgenda12Event"
  | "reopenAgenda12Event"
  | "listCountries"
  | "errorMessage"
>;

const BACKEND_KEYS = [
  "readAgenda12",
  "changeAgenda12Columns",
  "createAgenda12Event",
  "readAgenda12Event",
  "changeAgenda12Event",
  "closeAgenda12Event",
  "reopenAgenda12Event",
  "listCountries",
  "errorMessage",
] as const;

/** Le pont a tout ce qu'il faut pour montrer des agendas 12 (ce que n'ont pas les faux ponts de certains tests). */
export const hasAgenda12Backend = (
  backend: Partial<Agenda12HostBackend>,
): backend is Agenda12HostBackend => BACKEND_KEYS.every((key) => backend[key] !== undefined);

export interface Agenda12HostDeps {
  readonly backend: Agenda12HostBackend;
  /** La fenêtre de confirmation. */
  readonly dialog: HTMLDialogElement;
  readonly columns: Pick<OpenColumns, "openNote" | "activePane">;
  readonly trash: Pick<Trash, "trashEvent">;
}

export function createAgenda12Host({
  backend,
  dialog,
  columns,
  trash,
}: Agenda12HostDeps): Agenda12Deps {
  return {
    backend,
    errorText: backend.errorMessage,
    askClosing: (title) => askClosing(dialog, title),
    trashEvent: trash.trashEvent,
    open: async (path, focusTitle) => {
      await columns.openNote(path);
      if (focusTitle) columns.activePane().focusEventTitle();
    },
  };
}
