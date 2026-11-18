// Espaces de travail simulés pour les parcours. La liste gardée par « Rust » survit au relancement
// (`page.reload()`) dans le stockage de la page ; les notes de chaque dossier autre que le premier
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
    this.save();
    return null;
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
  };
}
