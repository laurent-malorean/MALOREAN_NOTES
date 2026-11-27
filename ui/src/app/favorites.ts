// Favoris (fiche 0102) : la note des favoris, l'étoile d'un contenu, l'entrée « Favoris » de la liste des
// dossiers et l'onglet « Favoris » des réglages. Les règles (quelles lignes sont des favoris, les liens
// écrits) sont celles du moteur ; ici, seulement les gestes.
import type * as Bridge from "../bridge";
import type { RemovedLineItem } from "../bridge";
import { favoritesGroup } from "../screens/favorites-setting";
import type { StarState } from "../screens/favorite-star";
import type { PaneFavorites } from "../screens/note-pane";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import { chooseLinkable } from "./link-picker";
import type { MessageAction } from "./messages";
import type { AppSettings } from "./settings";
import type { Workspace } from "./workspace";

export interface FavoritesDeps {
  readonly backend: Pick<
    typeof Bridge,
    | "favoritesNote"
    | "chooseFavoritesNote"
    | "createFavoritesNote"
    | "stopUsingFavoritesNote"
    | "isFavorite"
    | "addFavorite"
    | "removeFavorite"
    | "restoreFavorites"
    | "listLinkable"
  >;
  readonly screen: Pick<CurrentScreen, "get">;
  readonly columns: Pick<OpenColumns, "panes">;
  readonly workspace: Pick<Workspace, "refreshList">;
  readonly settings: Pick<AppSettings, "openTab">;
  /** La fenêtre de choix au clavier, où l'on choisit la note des favoris. */
  readonly picker: HTMLDialogElement;
  /** Ouvre une note dans la colonne active, comme un clic sur la liste des notes. */
  open(path: string): void;
  show(message: string, kind?: "success", action?: MessageAction): void;
  run(action: Promise<unknown>): void;
}

export interface Favorites {
  /** Un clic sur l'entrée « Favoris » : ouvre la note des favoris, ou les réglages si l'on n'en a pas. */
  open(): Promise<void>;
  /** Ce que chaque colonne demande pour son étoile. */
  readonly star: PaneFavorites;
  /** L'onglet « Favoris » des réglages ; rien sans espace de travail ouvert. */
  settingsGroups(): HTMLElement[];
}

const TAB = "Favoris";
const ADDED = "Ajouté aux favoris";
const REMOVED = "Retiré des favoris";

/** Les gestes des favoris. `pending` : le contenu dont l'étoile a mené aux réglages, à ajouter une fois la note choisie ou créée. */
class FavoritesGestures implements Favorites {
  private pending: string | null = null;

  constructor(private readonly deps: FavoritesDeps) {}

  readonly star: PaneFavorites = {
    state: (path) => this.state(path),
    toggle: (path, state) => this.toggle(path, state),
  };

  async open(): Promise<void> {
    const note = await this.deps.backend.favoritesNote();
    if (note === null) this.deps.settings.openTab(TAB);
    else this.deps.open(note.path);
  }

  settingsGroups(): HTMLElement[] {
    const screen = this.deps.screen.get();
    if (screen.kind !== "workspace") return [];
    const { backend, run } = this.deps;
    // Le contenu de l'étoile n'attend que ces réglages-ci : une autre ouverture n'ajoute rien.
    const wanted = this.pending;
    this.pending = null;
    const group = favoritesGroup({
      folders: screen.folders,
      choose: () => run(this.choose(wanted).then(show)),
      create: (title, folder) => run(this.create(title, folder, wanted).then(show)),
      stop: () => run(this.stop().then(show)),
    });
    const show = () => this.deps.run(backend.favoritesNote().then(group.show));
    show();
    return [group.element];
  }

  private async state(path: string): Promise<StarState> {
    const { backend } = this.deps;
    const note = await backend.favoritesNote();
    // Sans note des favoris, l'étoile est creuse ; sur la note des favoris elle-même, elle n'existe pas.
    if (note?.path === path) return "hidden";
    return note !== null && (await backend.isFavorite(path)) ? "filled" : "empty";
  }

  private async toggle(path: string, state: StarState): Promise<void> {
    if (state === "filled") return this.remove(path);
    if ((await this.deps.backend.favoritesNote()) === null) {
      this.pending = path;
      return this.deps.settings.openTab(TAB);
    }
    await this.add(path);
  }

  private async add(path: string): Promise<void> {
    await this.deps.backend.addFavorite(path);
    this.deps.show(ADDED);
    await this.changed();
  }

  private async remove(path: string): Promise<void> {
    const removed = await this.deps.backend.removeFavorite(path);
    // Rien retiré : le contenu n'était plus en favori ; l'étoile se corrige, sans « Annuler ».
    if (removed.length > 0)
      this.deps.show(REMOVED, "success", { label: "Annuler", run: () => this.restore(removed) });
    await this.changed();
  }

  private async restore(removed: RemovedLineItem[]): Promise<void> {
    await this.deps.backend.restoreFavorites(removed);
    await this.changed();
  }

  /** La note des favoris a changé : l'étoile de chaque colonne se relit, et la note, si une colonne la montre, aussitôt. */
  private async changed(): Promise<void> {
    this.showStars();
    const note = await this.deps.backend.favoritesNote();
    for (const pane of this.deps.columns.panes().values())
      if (note !== null && pane.note() === note.path) await pane.followDisk();
  }

  private showStars(): void {
    for (const pane of this.deps.columns.panes().values()) this.deps.run(pane.showStar());
  }

  private async choose(wanted: string | null): Promise<void> {
    const { backend, picker } = this.deps;
    const item = await chooseLinkable(backend, picker, {
      label: "Choisir une note",
      keep: ({ contentType }) => contentType === "note",
    });
    if (item === null) return;
    await backend.chooseFavoritesNote(item.path);
    await this.chosen(wanted);
  }

  private async create(title: string, folder: string, wanted: string | null): Promise<void> {
    const note = await this.deps.backend.createFavoritesNote(title, folder);
    await this.deps.workspace.refreshList();
    this.deps.open(note.path);
    await this.chosen(wanted);
  }

  private async stop(): Promise<void> {
    await this.deps.backend.stopUsingFavoritesNote();
    this.showStars();
  }

  /** Une note des favoris est choisie ou créée : les étoiles se relisent, et le contenu qui a mené ici est ajouté. */
  private async chosen(wanted: string | null): Promise<void> {
    this.showStars();
    if (wanted !== null) await this.add(wanted);
  }
}

export function createFavorites(deps: FavoritesDeps): Favorites {
  return new FavoritesGestures(deps);
}
