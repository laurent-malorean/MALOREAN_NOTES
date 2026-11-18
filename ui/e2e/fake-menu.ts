// Barre des menus simulée pour les parcours : celle que la page fait construire est gardée en
// mémoire, avec ses éléments grisés ; choisir un élément envoie son identifiant comme Rust.
import { emit } from "@tauri-apps/api/event";
import type { AppMenu } from "../src/bridge";

type Handler = (args: Record<string, unknown>) => unknown;

/** La partie de la doublure qui tient la barre des menus. */
export interface FakeMenu {
  /** La barre construite par la page, telle qu'elle l'a décrite ; vide avant. */
  menu: AppMenu[];
  /** Les identifiants des éléments grisés depuis, ou rendus actifs (`false`). */
  greyed: Record<string, boolean>;
  /** Choisit l'élément de menu de cette commande, comme le Mac. */
  chooseMenu: (id: string) => Promise<void>;
}

export function fakeMenuState(): FakeMenu {
  return { menu: [], greyed: {}, chooseMenu: (id) => emit("menu-command", id) };
}

export function fakeMenu(state: FakeMenu): Record<string, Handler> {
  return {
    install_menu: ({ menus }) => {
      state.menu = menus as AppMenu[];
      state.greyed = {};
      for (const menu of state.menu)
        for (const entry of menu.entries)
          if (entry.kind === "command") state.greyed[entry.id] = !entry.enabled;
      return null;
    },
    enable_menu_items: ({ ids, enabled }) => {
      for (const id of ids as string[]) state.greyed[id] = !(enabled as boolean);
      return null;
    },
  };
}
