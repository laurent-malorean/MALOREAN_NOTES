// Icônes du menu de création : traits fins de la couleur du texte, dans une grille de 24 sur 24,
// comme celles de la barre de mise en forme et des dossiers.
import type { NewContentIcon } from "../state/new-content-menu";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const SHEET = "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z";

const PATHS: Record<NewContentIcon | "chevron", readonly string[]> = {
  note: [SHEET, "M14 3v5h5", "M9 13h6", "M9 17h6"],
  template: [SHEET, "M14 3v5h5", "M9 12h6v3H9z", "M9 18h3"],
  notebook: ["M5 4h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2z", "M9 4v16", "M12 9h4"],
  "mind-map": [
    "M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
    "M5 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
    "M19 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
    "M5 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
    "M19 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
    "M6.5 7.5l4 3",
    "M17.5 7.5l-4 3",
    "M6.5 16.5l4-3",
    "M17.5 16.5l-4-3",
  ],
  canvas: ["M4 5h7v6H4z", "M13 13h7v6h-7z", "M11 8h2a2 2 0 0 1 2 2v3"],
  crm: ["M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M5 20a7 7 0 0 1 14 0"],
  chevron: ["M6 9l6 6 6-6"],
};

/** Dessine l'icône : un SVG décoratif (le nom du choix ou du bouton vient d'ailleurs), à trait fin. */
export function newContentIcon(icon: NewContentIcon | "chevron"): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const shape of PATHS[icon]) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", shape);
    svg.append(path);
  }
  return svg;
}
