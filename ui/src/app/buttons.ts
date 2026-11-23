// Boutons de la fenêtre et champ de recherche : chacun lance l'action du module de son domaine.
import type { Layout } from "../screens/layout";
import { connectSearchField } from "../screens/search-field";
import { connectSearchWindow } from "../screens/search-window";
import { connectWorkspaceSwitcher } from "../screens/workspace-switcher";
import type { Workspaces } from "./workspaces";

export interface ButtonsDeps {
  readonly workspaces: Pick<Workspaces, "add" | "choose" | "menu">;
  readonly workspace: { createNote(): Promise<void> };
  readonly search: { type(query: string): void };
  readonly trash: { show(): Promise<void> };
  readonly folders: { startCreation(): void };
  /** La fenêtre de recherche se ferme par ce qu'on lui demande ici. */
  readonly actions: { closeSearch(): void };
  error(error: unknown): void;
  run(action: Promise<unknown>): void;
}

type ButtonsLayout = Pick<
  Layout,
  | "addButton"
  | "switchButton"
  | "workspaceSwitcher"
  | "newNoteButton"
  | "searchField"
  | "searchWindow"
  | "searchClose"
  | "trashButton"
  | "newFolderButton"
>;

/** Branche chaque bouton de la fenêtre sur son action. */
export function connectButtons(layout: ButtonsLayout, deps: ButtonsDeps): void {
  const { workspaces, run } = deps;
  layout.addButton.addEventListener("click", () => run(workspaces.add()));
  layout.switchButton.addEventListener("click", () => run(workspaces.choose()));
  connectWorkspaceSwitcher(layout.workspaceSwitcher, workspaces.menu, deps.error);
  layout.newNoteButton.addEventListener("click", () => run(deps.workspace.createNote()));
  connectSearchField(layout.searchField, deps.search.type);
  connectSearchWindow(layout, deps.actions.closeSearch);
  layout.trashButton.addEventListener("click", () => run(deps.trash.show()));
  layout.newFolderButton.addEventListener("click", deps.folders.startCreation);
}
