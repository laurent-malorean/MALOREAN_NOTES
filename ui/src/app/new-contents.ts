// Les contenus qu'on crée par un nom ou un titre demandé d'abord : le cahier de recherche
// (fiche 0041) et la carte mentale (fiche 0050), le canvas (fiche 0052) et le CRM (fiche 0060), dans le dossier cliqué ou, par défaut, affiché.
import type * as Bridge from "../bridge";
import { askName } from "../screens/name-prompt";
import { folderOf } from "../state/folders";
import { currentFolder } from "../state/screen";
import {
  createResearchNotebooks,
  type ResearchNotebooks,
  type ResearchNotebooksDeps,
} from "./research-notebook";

export interface NewContentsDeps extends Omit<ResearchNotebooksDeps, "backend"> {
  readonly backend: ResearchNotebooksDeps["backend"] &
    Pick<typeof Bridge, "createMindMap" | "createCanvas" | "createCrm" | "createAgenda12">;
}

export interface NewContents extends ResearchNotebooks {
  /** Fait choisir le nom d'une nouvelle carte mentale, la crée dans `folder` (le dossier affiché par défaut) et l'ouvre. */
  createMindMap(folder?: string): Promise<void>;
  /** Fait choisir le nom d'un nouveau canvas, le crée dans `folder` (le dossier du fichier actif par défaut) et l'ouvre (fiche 0052). */
  createCanvas(folder?: string): Promise<void>;
  /** Fait choisir le nom d'un nouveau CRM, le crée dans `folder` (le dossier affiché par défaut) et l'ouvre, sur son onglet Kanban (fiche 0060). */
  createCrm(folder?: string): Promise<void>;
  /** Fait choisir le titre d'un nouvel agenda 12, le crée dans `folder` (le dossier affiché par défaut) et l'ouvre (fiche 0104). */
  createAgenda12(folder?: string): Promise<void>;
}

export const NEW_MIND_MAP = {
  question: "Nom de la nouvelle carte mentale",
  initial: "",
  confirm: "Créer",
};

/** Le nom demandé, redemandé tant qu'il est vide ; `null` si on annule. */
async function nameOf(
  deps: NewContentsDeps,
  options: typeof NEW_MIND_MAP = NEW_MIND_MAP,
): Promise<string | null> {
  for (;;) {
    const name = await askName(deps.dialog, options);
    if (name === null || name.trim() !== "") return name;
  }
}

async function createMindMap(deps: NewContentsDeps, folder: string | undefined) {
  if (deps.screen.get().kind !== "workspace") return;
  const title = await nameOf(deps);
  if (title === null) return;
  const where = folder ?? currentFolder(deps.screen.get());
  const created = await deps.backend.createMindMap(where, title);
  await deps.workspace.refreshList();
  await deps.columns.openNote(created.path);
}

export const NEW_CRM = {
  question: "Nom du nouveau CRM",
  initial: "",
  confirm: "Créer",
};

async function createCrm(deps: NewContentsDeps, folder: string | undefined) {
  if (deps.screen.get().kind !== "workspace") return;
  const title = await nameOf(deps, NEW_CRM);
  if (title === null) return;
  const where = folder ?? currentFolder(deps.screen.get());
  const created = await deps.backend.createCrm(where, title);
  await deps.workspace.refreshList();
  await deps.columns.openNote(created.path);
}

export const NEW_AGENDA_12 = {
  question: "Titre du nouvel agenda 12",
  initial: "",
  confirm: "Créer",
};

async function createAgenda12(deps: NewContentsDeps, folder: string | undefined) {
  if (deps.screen.get().kind !== "workspace") return;
  const title = await nameOf(deps, NEW_AGENDA_12);
  if (title === null) return;
  const where = folder ?? currentFolder(deps.screen.get());
  const created = await deps.backend.createAgenda12(where, title);
  await deps.workspace.refreshList();
  await deps.columns.openNote(created.path);
}

export const NEW_CANVAS = {
  question: "Nom du nouveau canvas",
  initial: "",
  confirm: "Créer",
};

async function createCanvas(deps: NewContentsDeps, folder: string | undefined) {
  if (deps.screen.get().kind !== "workspace") return;
  const title = await nameOf(deps, NEW_CANVAS);
  if (title === null) return;
  const active = deps.columns.activePane().note();
  const where = folder ?? (active === null ? currentFolder(deps.screen.get()) : folderOf(active));
  const created = await deps.backend.createCanvas(where, title);
  await deps.workspace.refreshList();
  await deps.columns.openNote(created.path);
}

export function createNewContents(deps: NewContentsDeps): NewContents {
  return {
    ...createResearchNotebooks(deps),
    createMindMap: (folder) => createMindMap(deps, folder),
    createCanvas: (folder) => createCanvas(deps, folder),
    createCrm: (folder) => createCrm(deps, folder),
    createAgenda12: (folder) => createAgenda12(deps, folder),
  };
}
