// Le jeu d'icônes des menus (menu de création, clic droit) et des listes de liens : traits fins de la
// couleur du texte, dans une grille de 24 sur 24, comme celles de la barre de mise en forme. Les dessins
// qu'ont déjà la barre de mise en forme et le canvas sont repris d'eux, jamais redessinés.
import type { NewContentIcon } from "../state/new-content-menu";
import { CANVAS_ICON_PATHS } from "./canvas-icons";
import { FORMAT_ICON_PATHS } from "./format-icons";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Les dessins propres aux menus du clic droit (ceux de la barre et du canvas ne sont pas redéclarés). */
export type MenuIcon =
  | "new-tab"
  | "open-left"
  | "open-right"
  | "close"
  | "pin"
  | "unpin"
  | "print"
  | "history"
  | "web"
  | "group"
  | "go-to-group"
  | "replace"
  | "external-link"
  | "remove"
  | "align-center"
  | "align-right"
  | "align-top"
  | "align-middle"
  | "align-bottom"
  | "distribute-horizontal"
  | "distribute-vertical"
  | "grid"
  | "snap"
  | "lock"
  | "correct"
  | "rewrite"
  | "workspace"
  | "no-color"
  | "add-child"
  | "add-sibling"
  | "calendar"
  // Repris de la barre de mise en forme ou du canvas.
  | "copy"
  | "markdown"
  | "export"
  | "trash"
  | "edit"
  | "image"
  | "add"
  | "lines"
  | "line"
  | "arrow"
  | "double-arrow"
  | "align-left"
  | "zoom-selection";

/** Les deux dessins du bouton des panneaux latéraux, dans la bande du haut : panneau plein (montrés), vide (cachés). */
export type WindowIcon = "side-panels-shown" | "side-panels-hidden";

/** Tous les dessins du jeu : ceux du menu de création, du chevron, de la bande du haut et des menus du clic droit. */
export type AppIcon = NewContentIcon | "chevron" | WindowIcon | MenuIcon;

const SHEET = "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z";
const WINDOW = "M4 5h16v14H4z";
const CIRCLE = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z";
const PIN = ["M9 4h6", "M10 4v6l-3 4h10l-3-4V4", "M12 14v6"];
const PANELS_FRAME = "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z";

const PATHS: Record<AppIcon, readonly string[]> = {
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
  "agenda-12": ["M4 5h16v14H4z", "M4 9h16", "M4 14h16", "M9.3 9v10", "M14.7 9v10"],
  chevron: ["M6 9l6 6 6-6"],
  // Panneau plein : le trait de séparation et les lignes des listes ; panneau vide : un pointillé.
  "side-panels-shown": [PANELS_FRAME, "M10 5v14", "M6.5 9h1", "M6.5 12h1", "M6.5 15h1"],
  "side-panels-hidden": [PANELS_FRAME, "M10 7v2", "M10 11v2", "M10 15v2"],
  "new-tab": [WINDOW, "M12 9v6", "M9 12h6"],
  "open-left": [WINDOW, "M12 5v14", "M10 9l-3 3 3 3"],
  "open-right": [WINDOW, "M12 5v14", "M14 9l3 3-3 3"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  pin: PIN,
  unpin: [...PIN, "M4 4l16 16"],
  print: [
    "M7 9V4h10v5",
    "M7 17H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2",
    "M7 14h10v6H7z",
  ],
  history: ["M4 12a8 8 0 1 0 2.5-5.8", "M4 4v5h5", "M12 8v4l3 2"],
  web: [CIRCLE, "M3 12h18", "M12 3c3 3 3 15 0 18", "M12 3c-3 3-3 15 0 18"],
  group: ["M4 8V4h4", "M16 4h4v4", "M20 16v4h-4", "M8 20H4v-4", "M10 10h4v4h-4z"],
  "go-to-group": [
    "M12 4v4",
    "M12 16v4",
    "M4 12h4",
    "M16 12h4",
    "M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  ],
  replace: ["M5 8h13", "M14 4l4 4-4 4", "M19 16H6", "M10 12l-4 4 4 4"],
  "external-link": [
    "M14 4h6v6",
    "M20 4l-9 9",
    "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  ],
  remove: [CIRCLE, "M8 12h8"],
  "align-center": ["M12 3v18", "M6 7h12", "M8 12h8", "M5 17h14"],
  "align-right": ["M20 4v16", "M4 7h12", "M8 12h8", "M6 17h10"],
  "align-top": ["M4 4h16", "M7 8v12", "M12 8v8", "M17 8v10"],
  "align-middle": ["M3 12h18", "M7 5v14", "M12 8v8", "M17 6v12"],
  "align-bottom": ["M4 20h16", "M7 4v12", "M12 8v8", "M17 6v10"],
  "distribute-horizontal": ["M4 4v16", "M20 4v16", "M10 8h4v8h-4z"],
  "distribute-vertical": ["M4 4h16", "M4 20h16", "M8 10h8v4H8z"],
  grid: ["M4 4h16v16H4z", "M4 9.3h16", "M4 14.7h16", "M9.3 4v16", "M14.7 4v16"],
  snap: ["M6 4v8a6 6 0 0 0 12 0V4", "M6 8h4", "M14 8h4"],
  lock: ["M6 11h12v9H6z", "M8 11V8a4 4 0 0 1 8 0v3"],
  correct: ["M3 18l5-12 5 12", "M5 14h6", "M15 15l2.5 2.5L22 12"],
  rewrite: ["M4 12a8 8 0 0 1 14-5", "M18 3v4h-4", "M20 12a8 8 0 0 1-14 5", "M6 21v-4h4"],
  workspace: ["M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"],
  "no-color": [CIRCLE, "M5.6 5.6l12.8 12.8"],
  "add-child": ["M4 4h7v5H4z", "M7.5 9v7h5", "M12.5 13.5h7v5h-7z"],
  "add-sibling": ["M3 5h8v4H3z", "M3 15h8v4H3z", "M16 8v8", "M13 12h6"],
  calendar: ["M4 6h16v14H4z", "M4 10h16", "M8 3v4", "M16 3v4"],
  copy: FORMAT_ICON_PATHS.copy,
  markdown: FORMAT_ICON_PATHS.markdown,
  export: CANVAS_ICON_PATHS.export,
  trash: CANVAS_ICON_PATHS.trash,
  edit: CANVAS_ICON_PATHS.edit,
  image: CANVAS_ICON_PATHS.image,
  add: CANVAS_ICON_PATHS["zoom-in"],
  lines: CANVAS_ICON_PATHS.lines,
  line: CANVAS_ICON_PATHS.line,
  arrow: CANVAS_ICON_PATHS.arrow,
  "double-arrow": CANVAS_ICON_PATHS["double-arrow"],
  "align-left": CANVAS_ICON_PATHS.align,
  "zoom-selection": CANVAS_ICON_PATHS.focus,
};

/** Tous les noms du jeu. */
export const APP_ICONS = Object.keys(PATHS) as readonly AppIcon[];

/** Dessine l'icône : un SVG décoratif (le nom du choix ou du bouton vient d'ailleurs), à trait fin. */
export function appIcon(icon: AppIcon): SVGSVGElement {
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
