// Journal : la note du jour, ouverte (et créée au besoin par Rust) sur demande ou au lancement,
// et ses réglages, gardés pour chaque bibliothèque.
import type * as Bridge from "../bridge";
import { journalGroup } from "../screens/journal-setting";
import { noteOpened } from "../state/columns";
import type { PreferenceStorage } from "../state/focus-preference";
import { journalTemplate, loadJournal, saveJournal } from "../state/journal";
import { loadTemplatesFolder } from "../state/templates-folder";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { Library } from "./library";

export interface JournalDeps {
  readonly backend: Pick<typeof Bridge, "listAllNotes" | "createDailyNote">;
  /** Où les réglages du journal et le dossier des modèles de chaque bibliothèque sont gardés. */
  readonly storage: PreferenceStorage;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "flushedPath" | "update" | "activePane">;
  readonly library: Pick<Library, "path" | "refreshFolders" | "refreshList">;
}

export interface Journal {
  /** Ouvre la note du jour, créée au besoin, dans un nouvel onglet de la colonne active ou dans son onglet. */
  open(): Promise<void>;
  /** Fait de même au lancement, si les réglages le demandent. */
  atLaunch(): Promise<void>;
  /** La partie des réglages du journal ; rien sans bibliothèque ouverte. */
  settingsGroups(): HTMLElement[];
}

/** Le modèle du journal, enregistré d'abord s'il est ouvert et modifié ; rien s'il n'y en a pas. */
async function template(deps: JournalDeps, library: string): Promise<string | null> {
  const folder = loadTemplatesFolder(deps.storage, library);
  const found = folder && journalTemplate(await deps.backend.listAllNotes(), folder);
  return found ? deps.columns.flushedPath(found) : null;
}

async function open(deps: JournalDeps) {
  if (deps.screen.get().kind !== "library") return;
  const library = deps.library.path();
  const { folder } = loadJournal(deps.storage, library);
  const created = await deps.backend.createDailyNote(folder, await template(deps, library));
  // Le journal vient peut-être d'être créé.
  await deps.library.refreshFolders();
  await deps.library.refreshList();
  await deps.columns.update((now) => noteOpened(now, created.path));
  deps.columns.activePane().editor.focus();
}

export function createJournal(deps: JournalDeps): Journal {
  return {
    open: () => open(deps),
    atLaunch: async () => {
      if (loadJournal(deps.storage, deps.library.path()).atLaunch) await open(deps);
    },
    settingsGroups: () => {
      if (deps.screen.get().kind !== "library") return [];
      const library = deps.library.path();
      return [
        journalGroup(loadJournal(deps.storage, library), (next) =>
          saveJournal(deps.storage, library, next),
        ),
      ];
    },
  };
}
