// Journal : la note du jour, ouverte (et créée au besoin par Rust) sur demande ou au lancement,
// et ses réglages, gardés pour chaque espace de travail.
import type * as Bridge from "../bridge";
import { journalGroup } from "../screens/journal-setting";
import { noteOpened } from "../state/columns";
import type { PreferenceStorage } from "../state/focus-preference";
import { journalTemplate, loadJournal, saveJournal } from "../state/journal";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { Workspace } from "./workspace";

export interface JournalDeps {
  readonly backend: Pick<typeof Bridge, "listAllNotes" | "createDailyNote" | "templatesFolder">;
  /** Où les réglages du journal de chaque espace de travail sont gardés. */
  readonly storage: PreferenceStorage;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "flushedPath" | "update" | "activePane">;
  readonly workspace: Pick<Workspace, "path" | "refreshFolders" | "refreshList">;
}

export interface Journal {
  /** Ouvre la note du jour, créée au besoin, dans un nouvel onglet de la colonne active ou dans son onglet. */
  open(): Promise<void>;
  /** Fait de même au lancement, si les réglages le demandent. */
  atLaunch(): Promise<void>;
  /** La partie des réglages du journal ; rien sans espace de travail ouvert. */
  settingsGroups(): HTMLElement[];
}

/** Le modèle du journal, enregistré d'abord s'il est ouvert et modifié ; rien s'il n'y en a pas. */
async function template(deps: JournalDeps): Promise<string | null> {
  const folder = await deps.backend.templatesFolder();
  const found = folder && journalTemplate(await deps.backend.listAllNotes(), folder);
  return found ? deps.columns.flushedPath(found) : null;
}

async function open(deps: JournalDeps) {
  if (deps.screen.get().kind !== "workspace") return;
  const workspace = deps.workspace.path();
  const { folder } = loadJournal(deps.storage, workspace);
  const created = await deps.backend.createDailyNote(folder, await template(deps));
  // Le journal vient peut-être d'être créé.
  await deps.workspace.refreshFolders();
  await deps.workspace.refreshList();
  await deps.columns.update((now) => noteOpened(now, created.path));
  deps.columns.activePane().editor.focus();
}

export function createJournal(deps: JournalDeps): Journal {
  return {
    open: () => open(deps),
    atLaunch: async () => {
      if (loadJournal(deps.storage, deps.workspace.path()).atLaunch) await open(deps);
    },
    settingsGroups: () => {
      const screen = deps.screen.get();
      if (screen.kind !== "workspace") return [];
      const workspace = deps.workspace.path();
      return [
        journalGroup(screen.folders, loadJournal(deps.storage, workspace), (next) =>
          saveJournal(deps.storage, workspace, next),
        ),
      ];
    },
  };
}
