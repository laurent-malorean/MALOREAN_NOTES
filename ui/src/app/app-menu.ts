// Barre des menus du Mac : la page la décrit et la fait construire par Rust, grise les commandes
// d'une note tant qu'aucune n'est montrée, et lance la commande de chaque élément choisi.
import type * as Bridge from "../bridge";
import { menuBar, menuCommand, NOTE_COMMANDS } from "../state/app-menu";
import { activeNote, type Columns } from "../state/columns";
import type { MenuCommandId } from "../state/commands";
import { dialogOpen } from "./commands";

export interface AppMenuDeps {
  readonly backend: Pick<typeof Bridge, "installMenu" | "enableMenuItems" | "onMenuCommand">;
  /** Ce que fait chaque commande, et la palette : les mêmes que pour les raccourcis. */
  readonly actions: Readonly<Record<MenuCommandId, () => void>>;
  error(error: unknown): void;
}

export interface AppMenuConnection {
  /** Les colonnes ont changé : grise ou rend actives les commandes d'une note. */
  follow(columns: Columns): void;
}

/** Construit la barre des menus et la relie aux commandes. */
export function connectAppMenu(deps: AppMenuDeps): AppMenuConnection {
  const { backend, actions, error } = deps;
  let noteShown = false;
  // Chaque demande attend la précédente : griser avant que la barre soit construite serait perdu.
  let queue = backend.installMenu(menuBar(noteShown)).catch(error);
  backend
    .onMenuCommand((id) => {
      const command = menuCommand(id);
      // Comme les raccourcis : une fenêtre ouverte (réglages, choix) garde la main.
      if (command !== null && !dialogOpen()) actions[command]();
    })
    .catch(error);
  return {
    follow: (columns) => {
      const shown = activeNote(columns) !== null;
      if (shown === noteShown) return;
      noteShown = shown;
      queue = queue.then(() => backend.enableMenuItems([...NOTE_COMMANDS], shown)).catch(error);
    },
  };
}
