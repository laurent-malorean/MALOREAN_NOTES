// Les espaces de travail : en ajouter un, passer de l'un à l'autre, en renommer, en retirer.
// Rust garde la liste et ses règles ; chaque espace y est désigné par son nom (fiche 0024).
import type * as Bridge from "../bridge";
import type { WorkspaceItem } from "../bridge";
import type { MenuEntry } from "../screens/context-menu";
import type { NamePromptOptions } from "../screens/name-prompt";
import { openPicker } from "../screens/picker";
import { matching } from "../state/quick-open";
import { workspaceRenamed } from "../state/screen";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { Workspace } from "./workspace";

export interface WorkspacesDeps {
  readonly backend: Pick<
    typeof Bridge,
    | "listWorkspaces"
    | "chooseWorkspaceFolder"
    | "addWorkspace"
    | "openWorkspace"
    | "renameWorkspace"
    | "removeWorkspace"
  >;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "flushAll">;
  readonly workspace: Pick<Workspace, "open">;
  /** La fenêtre de choix au clavier. */
  readonly picker: HTMLDialogElement;
  /** Demande un nom, déjà rempli de `initial` ; `null` si l'utilisateur annule. */
  askName(options: NamePromptOptions): Promise<string | null>;
  /** Demande avant de retirer l'espace de travail `name` de la liste. */
  askRemoval(name: string): Promise<boolean>;
  run(action: Promise<unknown>): void;
}

export interface Workspaces {
  /** Fait choisir un dossier puis un nom (celui du dossier par défaut), et ouvre ce nouvel espace. */
  add(): Promise<void>;
  /** Passe à l'espace de travail `name`, ce qui est tapé étant enregistré d'abord. */
  switchTo(name: string): Promise<void>;
  /** Renomme l'espace de travail ouvert ; ses fichiers ne changent pas. */
  rename(): Promise<void>;
  /** Retire l'espace de travail `name` de la liste, après confirmation ; ses fichiers restent. */
  remove(name: string): Promise<void>;
  /** Le menu du sélecteur : chaque espace (l'ouvert marqué), puis ajouter, renommer, retirer. */
  menu(): Promise<readonly MenuEntry[]>;
  /** Fait choisir au clavier l'espace de travail où passer. */
  choose(): Promise<void>;
  /** Fait choisir au clavier l'espace de travail à retirer, parmi ceux qui ne sont pas ouverts. */
  chooseRemoval(): Promise<void>;
}

/** Le nom de l'espace de travail ouvert, ou rien sur l'accueil. */
function openName(screen: CurrentScreen): string | null {
  const shown = screen.get();
  return shown.kind === "workspace" ? shown.workspace.name : null;
}

async function opened(deps: WorkspacesDeps, info: Promise<Bridge.WorkspaceInfo>) {
  await deps.workspace.open(await info);
}

async function add(deps: WorkspacesDeps) {
  const folder = await deps.backend.chooseWorkspaceFolder();
  if (folder === null) return;
  const name = await deps.askName({
    question: "Nom de l'espace de travail",
    initial: folder.name,
    confirm: "Ajouter",
  });
  if (name === null) return;
  await deps.columns.flushAll();
  await opened(deps, deps.backend.addWorkspace(name, folder.path));
}

async function switchTo(deps: WorkspacesDeps, name: string) {
  if (name === openName(deps.screen)) return;
  await deps.columns.flushAll();
  await opened(deps, deps.backend.openWorkspace(name));
}

async function rename(deps: WorkspacesDeps) {
  const current = openName(deps.screen);
  if (current === null) return;
  const name = await deps.askName({
    question: "Nouveau nom de l'espace de travail",
    initial: current,
    confirm: "Renommer",
  });
  if (name === null) return;
  const kept = await deps.backend.renameWorkspace(current, name);
  deps.screen.show(workspaceRenamed(deps.screen.get(), kept));
}

async function remove(deps: WorkspacesDeps, name: string) {
  if (await deps.askRemoval(name)) await deps.backend.removeWorkspace(name);
}

function menuEntries(deps: WorkspacesDeps, list: readonly WorkspaceItem[]): MenuEntry[] {
  const { run } = deps;
  const others = list.filter((item) => !item.active);
  return [
    ...list.map((item) => ({
      label: item.name,
      icon: "workspace" as const,
      checked: item.active,
      stateName: item.active ? "ouvert" : undefined,
      run: () => run(switchTo(deps, item.name)),
    })),
    {
      label: "Ajouter un espace de travail…",
      icon: "add" as const,
      separatorBefore: true,
      run: () => run(add(deps)),
    },
    { label: "Renommer l'espace de travail…", icon: "edit" as const, run: () => run(rename(deps)) },
    ...others.map((item) => ({
      label: `Retirer « ${item.name} » de la liste…`,
      icon: "remove" as const,
      run: () => run(remove(deps, item.name)),
    })),
  ];
}

/** Fait choisir un espace de travail parmi `list` au clavier ; l'ouvert est marqué. */
function pick(
  deps: WorkspacesDeps,
  label: string,
  list: readonly WorkspaceItem[],
  choose: (name: string) => Promise<void>,
) {
  openPicker(deps.picker, {
    label,
    placeholder: "Nom de l'espace de travail",
    empty: "Aucun espace de travail ne correspond",
    entries: (query) => matching(list, query, (item) => item.name),
    describe: (item) => ({ label: item.name, detail: item.active ? "ouvert" : undefined }),
    choose: (item) => deps.run(choose(item.name)),
  });
}

export function createWorkspaces(deps: WorkspacesDeps): Workspaces {
  return {
    add: () => add(deps),
    switchTo: (name) => switchTo(deps, name),
    rename: () => rename(deps),
    remove: (name) => remove(deps, name),
    menu: async () => menuEntries(deps, await deps.backend.listWorkspaces()),
    choose: async () => {
      const list = await deps.backend.listWorkspaces();
      pick(deps, "Changer d'espace de travail", list, (name) => switchTo(deps, name));
    },
    chooseRemoval: async () => {
      const list = await deps.backend.listWorkspaces();
      const others = list.filter((item) => !item.active);
      pick(deps, "Retirer un espace de travail", others, (name) => remove(deps, name));
    },
  };
}
