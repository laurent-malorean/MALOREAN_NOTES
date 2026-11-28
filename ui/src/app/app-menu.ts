// Barre des menus du Mac : l'interface la décrit et la fait construire par Rust, grise les commandes
// d'une note tant qu'aucune n'est montrée, celles de l'aide à l'écriture tant que l'assistant
// d'écriture ne peut pas répondre, et lance la commande de chaque élément choisi.
import type * as Bridge from "../bridge";
import { ASSISTANT_COMMANDS, menuBar, menuCommand, NOTE_COMMANDS } from "../state/app-menu";
import { activeNote, type Columns } from "../state/columns";
import { type MenuCommandId, onShortcutChosen } from "../state/commands";
import { landing } from "../state/shortcut-landing";
import { dialogOpen } from "./commands";
import type { WritingAssistance } from "./writing-assistant";

export interface AppMenuDeps {
  readonly backend: Pick<typeof Bridge, "installMenu" | "enableMenuItems" | "onMenuCommand">;
  /** Ce que fait chaque commande, et la palette : les mêmes que pour les raccourcis. */
  readonly actions: Readonly<Record<MenuCommandId, () => void>>;
  /** L'assistant d'écriture : ses commandes deviennent actives s'il peut répondre. */
  readonly assistant: Pick<WritingAssistance, "status">;
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
  // Les commandes de l'aide à l'écriture ont été rendues actives : une barre refaite doit les rendre actives de nouveau.
  let assistantEnabled = false;
  // Chaque demande attend la précédente : griser avant que la barre soit construite serait perdu.
  const install = async (): Promise<void> => {
    await backend.installMenu(menuBar(noteShown));
    if (assistantEnabled) await backend.enableMenuItems([...ASSISTANT_COMMANDS], true);
  };
  let queue: Promise<unknown> = install().catch(error);
  void deps.assistant.status.then((status) => {
    if (status.kind !== "available") return;
    queue = queue
      .then(() => {
        assistantEnabled = true;
        return backend.enableMenuItems([...ASSISTANT_COMMANDS], true);
      })
      .catch(error);
  });
  // Un raccourci choisi (saisie vocale) : la barre se refait avec lui.
  onShortcutChosen(() => {
    queue = queue.then(install).catch(error);
  });
  backend
    .onMenuCommand((id) => {
      const command = menuCommand(id);
      // Comme les raccourcis : une fenêtre ouverte (réglages, choix) garde la main.
      // Une pression livrée aussi par la fenêtre ne compte qu'une fois (`state/shortcut-landing.ts`).
      if (command !== null && !dialogOpen() && landing.accepts(command)) actions[command]();
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
