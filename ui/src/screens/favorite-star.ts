// L'étoile d'un contenu : un bouton, dans la colonne qui le montre, qui l'ajoute aux favoris ou l'en retire.
// Deux états, creuse et pleine ; le dessin et la couleur viennent du thème (`style.css`).

/** Ce que l'étoile montre : cachée (aucun contenu, note des favoris, fiche du CRM), creuse ou pleine. */
export type StarState = "hidden" | "empty" | "filled";

export interface FavoriteStar {
  show(state: StarState): void;
}

const SVG = "http://www.w3.org/2000/svg";
const STAR = "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z";
const ADD = "Ajouter aux favoris";
const REMOVE = "Retirer des favoris";

function drawing(): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", STAR);
  svg.append(path);
  return svg;
}

/** Donne au bouton `button` le rôle d'étoile : un clic appelle `onClick`, `show` change son état. */
export function createFavoriteStar(button: HTMLButtonElement, onClick: () => void): FavoriteStar {
  button.type = "button";
  // Le nom ne change pas : c'est `aria-pressed` qui dit si l'étoile est pleine ; la bulle dit ce que fait le clic.
  button.setAttribute("aria-label", "Étoile");
  button.hidden = true;
  button.append(drawing());
  button.addEventListener("click", onClick);
  return {
    show(state) {
      button.hidden = state === "hidden";
      button.title = state === "filled" ? REMOVE : ADD;
      button.setAttribute("aria-pressed", String(state === "filled"));
    },
  };
}
