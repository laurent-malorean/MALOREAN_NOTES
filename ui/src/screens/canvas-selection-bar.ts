// Canvas (fiche 0052, spécification § 14) : la petite barre au-dessus de la sélection. Pour une carte :
// supprimer, couleur, zoom sur la sélection, modifier. Pour une flèche, en plus, son sens. Pour plusieurs
// cartes, « Aligner ».
import { PALETTE } from "../state/palette";
import type { Sense } from "../state/canvas-model";
import { iconButton } from "./canvas-controls";

/** Ce que la sélection permet de faire. */
export interface SelectionContext {
  readonly cards: number;
  readonly arrows: number;
  /** Le sens de la flèche choisie, si c'est la seule chose sélectionnée. */
  readonly sense: Sense | null | undefined;
  /** La couleur de la palette que toute la sélection partage, s'il y en a une. */
  readonly color: string | null;
  /** On peut modifier le contenu (une carte texte ou de note, une flèche) : le crayon est montré. */
  readonly editable: boolean;
}

export interface SelectionActions {
  readonly remove: () => void;
  readonly color: (name: string | null) => void;
  readonly zoom: () => void;
  readonly edit: () => void;
  readonly sense: (at: HTMLElement) => void;
  readonly align: (at: HTMLElement) => void;
}

/** La rangée de ronds colorés de la palette ; la couleur actuelle est entourée d'un anneau, un clic dessus l'enlève. */
function swatches(current: string | null, choose: (name: string | null) => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "canvas-swatches";
  for (const name of PALETTE) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "canvas-swatch";
    swatch.dataset.color = name;
    swatch.title = name;
    swatch.setAttribute("aria-label", name);
    swatch.style.setProperty("--swatch", `var(--palette-${name})`);
    swatch.classList.toggle("current", name === current);
    swatch.addEventListener("click", (event) => {
      event.stopPropagation();
      choose(name === current ? null : name);
    });
    swatch.addEventListener("pointerdown", (event) => event.stopPropagation());
    row.append(swatch);
  }
  return row;
}

/** La barre pour cette sélection ; `null` si rien n'est sélectionné. */
export function createSelectionBar(
  context: SelectionContext,
  actions: SelectionActions,
): HTMLElement | null {
  if (context.cards + context.arrows === 0) return null;
  const bar = document.createElement("div");
  bar.className = "canvas-selection-bar";
  bar.addEventListener("pointerdown", (event) => event.stopPropagation());
  const palette = swatches(context.color, actions.color);
  palette.hidden = true;
  bar.append(
    iconButton("trash", "Supprimer", actions.remove),
    iconButton("palette", "Couleur", () => {
      palette.hidden = !palette.hidden;
    }),
    iconButton("focus", "Zoom sur la sélection", actions.zoom),
  );
  if (context.sense !== undefined)
    bar.append(
      iconButton(
        context.sense === "none" ? "line" : context.sense === "both" ? "double-arrow" : "arrow",
        "Sens de la ligne",
        (e) => actions.sense(e.currentTarget as HTMLElement),
      ),
    );
  if (context.cards >= 2)
    bar.append(
      iconButton("align", "Aligner", (e) => actions.align(e.currentTarget as HTMLElement)),
    );
  if (context.editable) bar.append(iconButton("edit", "Modifier", actions.edit));
  bar.append(palette);
  return bar;
}
