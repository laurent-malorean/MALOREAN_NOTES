// Espaces de travail simulés pour les parcours. La liste gardée par « Rust » survit au relancement
// (`page.reload()`) dans le stockage de l'interface ; les notes de chaque dossier autre que le premier
// viennent du paramètre `spaces` (`{ dossier: { note: … } }`). Les vraies règles sont testées côté Rust.

interface FakeNote {
  content: string;
  modified: number;
}

export interface FakeWorkspace {
  name: string;
  path: string;
}

interface Saved {
  list: FakeWorkspace[];
  active: string | null;
  /** Les noms des espaces cochés pour les IA (fiche 0074) ; aucun au départ. */
  allowed?: string[];
  /** Le dossier des modèles de chaque espace, par son nom (fiche 0077) ; aucun au départ. */
  templates?: Record<string, string>;
}

/** La partie de la doublure qui change avec l'espace de travail ouvert. */
export interface FakeSpace {
  notes: Record<string, FakeNote>;
  folders: string[];
  /** Le dossier que rendra le prochain choix de dossier ; `null` : l'utilisateur annule. */
  nextFolder: string | null;
}

type Handler = (args: Record<string, string>) => unknown;
type Contents = Omit<FakeSpace, "nextFolder">;

const SAVED_KEY = "fake.workspaces";
export const FIRST: FakeWorkspace = { name: "Notes", path: "/Users/moi/Notes" };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** La liste gardée, et l'espace dont la doublure montre les notes. */
class Workspaces {
  saved: Saved;
  open: FakeWorkspace | null = null;
  readonly kept: Record<string, Contents>;

  constructor(
    private readonly space: FakeSpace,
    private readonly spaces: Record<string, Record<string, FakeNote>>,
    remembered: boolean,
  ) {
    const stored = localStorage.getItem(SAVED_KEY);
    this.saved = stored
      ? (JSON.parse(stored) as Saved)
      : { list: remembered ? [FIRST] : [], active: remembered ? FIRST.name : null };
    this.kept = { [FIRST.path]: { notes: space.notes, folders: space.folders } };
  }

  save() {
    localStorage.setItem(SAVED_KEY, JSON.stringify(this.saved));
  }

  isActive(workspace: FakeWorkspace) {
    return this.saved.active !== null && same(this.saved.active, workspace.name);
  }

  /** Range les notes de l'espace ouvert, puis met celles de `workspace` à leur place. */
  show(workspace: FakeWorkspace) {
    if (this.open)
      this.kept[this.open.path] = { notes: this.space.notes, folders: this.space.folders };
    const shown = this.kept[workspace.path] ?? {
      notes: this.spaces[workspace.path] ?? {},
      folders: [],
    };
    this.space.notes = shown.notes;
    this.space.folders = shown.folders;
    this.open = workspace;
    this.saved.active = workspace.name;
    this.save();
    return { ...workspace };
  }

  find(name: string) {
    const found = this.saved.list.find((w) => same(w.name, name));
    if (!found) throw { message: `aucun espace de travail ne s'appelle « ${name} »` };
    return found;
  }

  refuseName(name: string, except?: FakeWorkspace) {
    if (name.trim() === "") throw { message: "le nom de l'espace de travail est vide" };
    const owner = this.saved.list.find((w) => w !== except && same(w.name, name));
    if (owner) throw { message: `un espace de travail s'appelle déjà « ${owner.name} »` };
  }

  add(name: string, folder: string) {
    const owner = this.saved.list.find((w) => w.path === folder);
    if (owner) throw { message: `ce dossier est déjà l'espace de travail « ${owner.name} »` };
    this.refuseName(name);
    const added = { name: name.trim(), path: folder };
    this.saved.list.push(added);
    return this.show(added);
  }

  rename(name: string, newName: string) {
    const workspace = this.find(name);
    this.refuseName(newName, workspace);
    if (this.isActive(workspace)) this.saved.active = newName.trim();
    this.saved.allowed = this.allowed().map((n) => (same(n, workspace.name) ? newName.trim() : n));
    const folder = this.templatesOf(workspace);
    this.saved.templates = this.others(workspace);
    if (folder !== null) this.saved.templates[newName.trim()] = folder;
    workspace.name = newName.trim();
    this.save();
    return workspace.name;
  }

  remove(name: string) {
    const workspace = this.find(name);
    if (this.isActive(workspace))
      throw {
        message: `l'espace de travail « ${workspace.name} » est ouvert : passez à un autre avant de le retirer`,
      };
    this.saved.list = this.saved.list.filter((w) => w !== workspace);
    this.saved.allowed = this.allowed().filter((n) => !same(n, workspace.name));
    this.saved.templates = this.others(workspace);
    this.save();
    return null;
  }

  /** Le dossier des modèles de `workspace`, s'il en a choisi un. */
  templatesOf(workspace: FakeWorkspace) {
    const found = Object.entries(this.saved.templates ?? {}).find(([name]) =>
      same(name, workspace.name),
    );
    return found ? found[1] : null;
  }

  /** Les dossiers des modèles de tous les espaces sauf `workspace`. */
  private others(workspace: FakeWorkspace) {
    return Object.fromEntries(
      Object.entries(this.saved.templates ?? {}).filter(([name]) => !same(name, workspace.name)),
    );
  }

  /** Choisit le dossier des modèles de l'espace ouvert ; aucun pour `null`. */
  chooseTemplates(folder: string | null) {
    const workspace = this.open ?? this.find(this.saved.active ?? "");
    this.saved.templates = this.others(workspace);
    if (folder !== null && folder.trim() !== "") this.saved.templates[workspace.name] = folder;
    this.save();
    return null;
  }

  /** Reprend les dossiers gardés par l'interface : chacun va à l'espace qui a ce dossier, sans écraser. */
  importTemplates(chosen: { location: string; folder: string }[]) {
    let imported = 0;
    for (const { location, folder } of chosen) {
      const workspace = this.saved.list.find((w) => w.path === location);
      if (!workspace || this.templatesOf(workspace) !== null || folder.trim() === "") continue;
      this.saved.templates = { ...this.saved.templates, [workspace.name]: folder };
      imported += 1;
    }
    if (imported > 0) this.save();
    return imported;
  }

  allowed() {
    return this.saved.allowed ?? [];
  }

  /** Les espaces et leur case « autorisé pour les IA ». */
  aiList() {
    return this.saved.list.map((w) => ({
      name: w.name,
      allowed: this.allowed().some((n) => same(n, w.name)),
    }));
  }

  setAllowed(name: string, allowed: boolean) {
    const workspace = this.find(name);
    const others = this.allowed().filter((n) => !same(n, workspace.name));
    this.saved.allowed = allowed ? [...others, workspace.name] : others;
    this.save();
    return this.aiList();
  }
}

/** Les commandes des espaces de travail ; `remembered` : « Notes » est connu au premier lancement. */
export function fakeWorkspaces(
  params: URLSearchParams,
  space: FakeSpace,
  remembered: boolean,
): Record<string, Handler> {
  const spaces = JSON.parse(params.get("spaces") ?? "{}") as Record<
    string,
    Record<string, FakeNote>
  >;
  const workspaces = new Workspaces(space, spaces, remembered);
  return {
    reopen_last_workspace: () => {
      const active = workspaces.saved.active;
      return active === null ? null : workspaces.show(workspaces.find(active));
    },
    list_workspaces: () =>
      workspaces.saved.list.map((w) => ({ name: w.name, active: workspaces.isActive(w) })),
    choose_workspace_folder: () =>
      space.nextFolder === null ? null : { name: nameOf(space.nextFolder), path: space.nextFolder },
    add_workspace: ({ name = "", folder = "" }) => workspaces.add(name, folder),
    open_workspace: ({ name = "" }) => workspaces.show(workspaces.find(name)),
    rename_workspace: ({ name = "", newName = "" }) => workspaces.rename(name, newName),
    remove_workspace: ({ name = "" }) => workspaces.remove(name),
    list_ai_workspaces: () => workspaces.aiList(),
    set_workspace_allowed: ({ name = "", allowed = "" }) =>
      workspaces.setAllowed(name, (allowed as unknown) === true),
    templates_folder: () =>
      workspaces.templatesOf(workspaces.open ?? workspaces.find(workspaces.saved.active ?? "")),
    set_templates_folder: ({ folder = null }) =>
      workspaces.chooseTemplates(folder as unknown as string | null),
    import_templates_folders: ({ chosen = [] }) =>
      workspaces.importTemplates(chosen as unknown as { location: string; folder: string }[]),
  };
}
