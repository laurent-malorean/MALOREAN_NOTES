// Icônes de la barre de mise en forme et du bloc d'outils d'affichage : traits fins de la couleur du texte, dans le style des
// symboles du Mac. Chaque icône est une liste de tracés dans une grille de 24 sur 24.
import type { FormatIcon } from "../state/format-bar";
import { CLAUDE_RAY_COUNT, claudeRay } from "./claude-icon";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export const FORMAT_ICON_PATHS: Record<FormatIcon, readonly string[]> = {
  bold: ["M7 5h6a3.5 3.5 0 0 1 0 7H7z", "M7 12h7a3.5 3.5 0 0 1 0 7H7z"],
  italic: ["M10 5h7", "M7 19h7", "M14 5l-4 14"],
  link: [
    "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1",
    "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  ],
  "heading-1": ["M3 6v12", "M3 12h8", "M11 6v12", "M16 12l2-1.5V18"],
  "heading-2": [
    "M3 6v12",
    "M3 12h8",
    "M11 6v12",
    "M15.5 12a2.3 2.3 0 0 1 4.5.5c0 1.5-4.5 3.5-4.5 5.5h4.8",
  ],
  "heading-3": ["M3 6v12", "M3 12h8", "M11 6v12", "M15.5 11h4.5l-2.5 3a2.4 2.4 0 1 1-2 3.5"],
  "bullet-list": ["M9 7h11", "M9 12h11", "M9 17h11", "M4 7h.01", "M4 12h.01", "M4 17h.01"],
  "numbered-list": [
    "M10 7h10",
    "M10 12h10",
    "M10 17h10",
    "M4 5.5l1.2-.8V9",
    "M3.8 11.2a1.2 1.2 0 0 1 2.4.2c0 .9-2.4 1.6-2.4 2.6h2.5",
    "M3.8 15.6h2.2l-1 1.4a1.2 1.2 0 1 1-1 1.8",
  ],
  // Le micro : la capsule en premier (la saisie vocale en écoute la remplit), puis l'arceau et le pied.
  microphone: [
    "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z",
    "M6 11a6 6 0 0 0 12 0",
    "M12 17v4",
    "M9 21h6",
  ],
  // Un cercle ouvert : il tourne pendant la préparation de la langue.
  spinner: ["M12 4a8 8 0 1 0 8 8"],
  date: [
    "M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
    "M4 10.5h16",
    "M8 4v4",
    "M16 4v4",
  ],
  markdown: [
    "M4 7h16v10H4z",
    "M7 14v-4l2 2.5L11 10v4",
    "M15 10v4",
    "M15 14l-1.5-1.5",
    "M15 14l1.5-1.5",
  ],
  copy: [
    "M9 9h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z",
    "M16 9V6a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3",
  ],
  focus: [
    "M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12z",
    "M12 12h.01",
    "M12 3v3",
    "M12 18v3",
    "M3 12h3",
    "M18 12h3",
  ],
  outline: ["M4 6h16", "M9 10.7h11", "M9 15.3h11", "M4 19.5h16"],
  typewriter: [
    "M3 8h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z",
    ...["M6 11.5h.01", "M10 11.5h.01", "M14 11.5h.01", "M18 11.5h.01", "M7 15h10"],
  ],
  "full-screen": ["M4 9V4h5", "M20 9V4h-5", "M4 15v5h5", "M20 15v5h-5"],
  "full-screen-exit": ["M9 4v5H4", "M15 4v5h5", "M9 20v-5H4", "M15 20v-5h5"],
  // Les douze rayons de l'icône de la colonne Claude Code, un tracé par rayon.
  claude: Array.from({ length: CLAUDE_RAY_COUNT }, (_, index) => {
    const { from, to } = claudeRay(index);
    return `M${from[0]} ${from[1]}L${to[0]} ${to[1]}`;
  }),
};

/** Dessine l'icône : un SVG décoratif (le nom du bouton vient de sa commande), à trait fin. */
export function formatIcon(icon: FormatIcon): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const shape of FORMAT_ICON_PATHS[icon]) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", shape);
    svg.append(path);
  }
  return svg;
}
