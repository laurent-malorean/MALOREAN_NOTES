// Canvas (fiche 0052, spécification § 14) : les boutons carrés. En bas, la barre de trois boutons ; en haut à
// droite, la colonne des commandes (réglages ; zoomer, rétablir le zoom, tout voir, dézoomer ; annuler,
// rétablir ; aide) ; au-dessus de la sélection, sa barre (supprimer, couleur, zoom sur la sélection, modifier,
// et le sens d'une flèche ou l'alignement de plusieurs cartes).
import { type CanvasIcon, canvasIcon } from "./canvas-icons";

/** Un bouton carré : une icône, un nom pour les lecteurs d'écran et l'infobulle. */
export function iconButton(
  icon: CanvasIcon,
  label: string,
  run: (event: MouseEvent) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "canvas-button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(canvasIcon(icon));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    run(event);
  });
  button.addEventListener("pointerdown", (event) => event.stopPropagation());
  return button;
}

export interface ControlActions {
  readonly settings: (at: HTMLElement) => void;
  readonly zoomIn: () => void;
  readonly resetZoom: () => void;
  readonly fit: () => void;
  readonly zoomOut: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly help: (at: HTMLElement) => void;
}

export interface Controls {
  readonly element: HTMLElement;
  /** Grise annuler et rétablir quand il n'y a rien à annuler ou à rétablir. */
  history(canUndo: boolean, canRedo: boolean): void;
}

function column(...buttons: HTMLElement[]): HTMLElement {
  const group = document.createElement("div");
  group.className = "canvas-button-group";
  group.append(...buttons);
  return group;
}

/** La colonne des commandes, en haut à droite. */
export function createControls(actions: ControlActions): Controls {
  const element = document.createElement("div");
  element.className = "canvas-controls";
  const settings = iconButton("settings", "Réglages du canvas", (e) =>
    actions.settings(e.currentTarget as HTMLElement),
  );
  const undo = iconButton("undo", "Annuler", actions.undo);
  const redo = iconButton("redo", "Rétablir", actions.redo);
  const help = iconButton("help", "Aide", (e) => actions.help(e.currentTarget as HTMLElement));
  element.append(
    column(settings),
    column(
      iconButton("zoom-in", "Zoomer", actions.zoomIn),
      iconButton("reset-zoom", "Rétablir le zoom", actions.resetZoom),
      iconButton("fit", "Tout voir", actions.fit),
      iconButton("zoom-out", "Dézoomer", actions.zoomOut),
    ),
    column(undo, redo),
    column(help),
  );
  return {
    element,
    history: (canUndo, canRedo) => {
      undo.disabled = !canUndo;
      redo.disabled = !canRedo;
    },
  };
}

export interface BarActions {
  /** Ajoute une carte : au centre de la vue pour un clic, à `at` (point de l'écran) pour un bouton glissé. */
  readonly addText: (at: { x: number; y: number } | null) => void;
  readonly addNote: (at: { x: number; y: number } | null) => void;
  readonly addMedia: (at: { x: number; y: number } | null) => void;
}

/** Plus loin que cela (pixels), un appui sur un bouton de la barre qui bouge est un glissement vers le canvas. */
const BAR_DRAG = 8;

/** Un bouton de la barre : un clic ajoute la carte au centre de la vue, un glissement la dépose où on relâche. */
function barButton(
  icon: CanvasIcon,
  label: string,
  add: (at: { x: number; y: number } | null) => void,
): HTMLButtonElement {
  const button = iconButton(icon, label, () => add(null));
  button.addEventListener("pointerdown", (down) => {
    window.addEventListener(
      "pointerup",
      (up) => {
        if (button.contains(up.target as Node)) return;
        if (Math.hypot(up.clientX - down.clientX, up.clientY - down.clientY) > BAR_DRAG)
          add({ x: up.clientX, y: up.clientY });
      },
      { once: true },
    );
  });
  return button;
}

/** La barre du bas : le fichier vierge (carte texte), le document (note), l'image (média). */
export function createBar(actions: BarActions): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "canvas-bar";
  bar.append(
    barButton("new-card", "Ajouter une carte texte", actions.addText),
    barButton("note", "Ajouter une note de l'espace de travail", actions.addNote),
    barButton("image", "Ajouter un média", actions.addMedia),
  );
  return bar;
}
