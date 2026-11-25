// Menu de création : le « + » de la liste des notes crée une note d'un clic ; le chevron à côté
// (toujours visible), une flèche ↓ sur ce chevron ou un appui prolongé sur le « + » ouvrent le menu
// des contenus à créer, sans rien créer d'eux-mêmes.
import { LONG_PRESS_MS } from "../state/new-content-menu";
import { contextMenuOpen, type MenuEntry, showContextMenu } from "./context-menu";
import { appIcon } from "./app-icons";

/** Les deux boutons du menu de création. */
export interface NewContentButtons {
  readonly newNoteButton: HTMLButtonElement;
  readonly newContentButton: HTMLButtonElement;
}

/** Ce que le menu de création demande à l'application. */
export interface NewContentMenuActions {
  /** Le « + » : crée une note. */
  readonly createNote: () => void;
  /** Les choix du menu, à jour au moment de l'ouverture. */
  readonly entries: () => readonly MenuEntry[];
}

/** Branche le « + » (clic, appui prolongé) et le chevron sur le menu de création. */
export function connectNewContentMenu(
  { newNoteButton: plus, newContentButton: chevron }: NewContentButtons,
  actions: NewContentMenuActions,
): void {
  chevron.append(appIcon("chevron"));
  // Le menu s'ouvre juste sous les deux boutons, quel que soit celui qui le demande.
  const openMenu = (viaKeyboard: boolean) => {
    const box = plus.getBoundingClientRect();
    chevron.setAttribute("aria-expanded", "true");
    showContextMenu(box.left, box.bottom, actions.entries(), undefined, {
      // Au clavier, le focus entre dans le menu et revient au chevron à sa fermeture.
      focus: viaKeyboard,
      opener: chevron,
      onClose: () => chevron.setAttribute("aria-expanded", "false"),
    });
  };
  pressPlus(plus, actions.createNote, () => openMenu(false));
  openByChevron(chevron, openMenu);
}

/** Un clic sur le « + » crée une note ; maintenu `LONG_PRESS_MS`, il ouvre le menu à la place. */
function pressPlus(plus: HTMLButtonElement, createNote: () => void, openMenu: () => void) {
  let timer: number | undefined;
  let menuOpened = false;
  plus.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    menuOpened = false;
    timer = window.setTimeout(() => {
      menuOpened = true;
      openMenu();
    }, LONG_PRESS_MS);
  });
  plus.addEventListener("pointerup", () => window.clearTimeout(timer));
  plus.addEventListener("pointerleave", () => {
    window.clearTimeout(timer);
    menuOpened = false;
  });
  plus.addEventListener("click", () => {
    // Relâcher après un appui prolongé ne crée rien : le menu est déjà ouvert.
    if (menuOpened) menuOpened = false;
    else createNote();
  });
}

/** Un clic sur le chevron ouvre le menu, ou le ferme s'il l'était ; ↓ l'ouvre au clavier. */
function openByChevron(chevron: HTMLButtonElement, openMenu: (viaKeyboard: boolean) => void) {
  // Le clic qui ferme le menu (appui hors du menu) ne doit pas le rouvrir aussitôt.
  let wasOpen = false;
  chevron.addEventListener("pointerdown", () => {
    wasOpen = contextMenuOpen();
  });
  chevron.addEventListener("pointerleave", () => {
    wasOpen = false;
  });
  chevron.addEventListener("click", (event) => {
    if (wasOpen) wasOpen = false;
    // Entrée ou Espace sur le chevron : `detail` vaut 0, le menu se parcourt alors aux flèches.
    else openMenu(event.detail === 0);
  });
  chevron.addEventListener("keydown", (event) => {
    // Le menu ouvert gère lui-même les flèches.
    if (event.key !== "ArrowDown" || contextMenuOpen()) return;
    event.preventDefault();
    // Le menu qui vient de s'ouvrir n'a pas à recevoir lui-même cette flèche.
    event.stopPropagation();
    openMenu(true);
  });
}
