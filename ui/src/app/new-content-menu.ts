// Menu de création : ce que chaque entrée lance. Rien de nouveau : ce sont les actions du clic
// droit sur un dossier (la note, le cahier, la carte mentale, le canvas, le CRM), prises dans le
// dossier affiché, et la note depuis un modèle de la palette.
import type { MenuEntry } from "../screens/context-menu";
import type { ScreenActions } from "../screens/screen-view";
import { NEW_CONTENT_MENU, type NewContentItem } from "../state/new-content-menu";
import { currentFolder } from "../state/screen";
import type { CurrentScreen } from "./current-screen";

export interface NewContentMenuDeps {
  readonly screen: Pick<CurrentScreen, "get">;
  /** Ce qu'on crée dans un dossier. */
  readonly actions: Pick<
    ScreenActions,
    "newNote" | "newNotebook" | "newMindMap" | "newCanvas" | "newCrm"
  >;
  /** La note depuis un modèle : elle demande le modèle, ou dit pourquoi elle ne peut pas. */
  readonly templates: { newNote(): Promise<void> };
  /** Lance l'action ; son échec est montré. */
  run(action: Promise<unknown>): void;
}

/** Ce que lance chaque entrée, pour le dossier affiché. */
function launch(deps: NewContentMenuDeps, command: NewContentItem["command"]): () => void {
  const folder = currentFolder(deps.screen.get());
  const { actions } = deps;
  const launches: Record<NewContentItem["command"], () => void> = {
    "new-note": () => actions.newNote(folder),
    "new-note-from-template": () => deps.run(deps.templates.newNote()),
    "new-research-notebook": () => actions.newNotebook(folder),
    "new-mind-map": () => actions.newMindMap(folder),
    "new-canvas": () => actions.newCanvas(folder),
    "new-crm": () => actions.newCrm(folder),
  };
  return launches[command];
}

/** Les choix du menu de création, dans l'ordre. */
export function newContentEntries(deps: NewContentMenuDeps): readonly MenuEntry[] {
  return NEW_CONTENT_MENU.map((item) => ({
    label: item.label,
    icon: item.icon,
    ...(item.shortcut === undefined ? {} : { shortcut: item.shortcut }),
    run: launch(deps, item.command),
  }));
}
