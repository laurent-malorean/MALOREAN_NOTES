// Canvas (fiche 0052) : les icônes des boutons, en traits fins dans une grille de 24 sur 24, comme celles de la
// barre de mise en forme.
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type CanvasIcon =
  | "settings"
  | "zoom-in"
  | "zoom-out"
  | "reset-zoom"
  | "fit"
  | "undo"
  | "redo"
  | "help"
  | "trash"
  | "palette"
  | "focus"
  | "edit"
  | "new-card"
  | "note"
  | "image"
  | "lines"
  | "line"
  | "arrow"
  | "double-arrow"
  | "align"
  | "check";

const PATHS: Record<CanvasIcon, readonly string[]> = {
  settings: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z",
  ],
  "zoom-in": ["M12 5v14", "M5 12h14"],
  "zoom-out": ["M5 12h14"],
  "reset-zoom": ["M20 12a8 8 0 1 1-2.5-5.8", "M20 4v5h-5"],
  fit: ["M4 9V4h5", "M20 9V4h-5", "M4 15v5h5", "M20 15v5h-5"],
  undo: ["M9 14L4 9l5-5", "M4 9h10a6 6 0 0 1 0 12h-3"],
  redo: ["M15 14l5-5-5-5", "M20 9H10a6 6 0 0 0 0 12h3"],
  help: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    "M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7",
    "M12 17h.01",
  ],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v6", "M14 11v6"],
  palette: [
    "M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.5-2-.6-1.2.2-2.5 1.6-2.5H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5z",
    "M7.5 11h.01",
    "M10 7.5h.01",
    "M14.5 7.5h.01",
  ],
  focus: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M3 8V3h5",
    "M21 8V3h-5",
    "M3 16v5h5",
    "M21 16v5h-5",
  ],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "M13.5 6.5l4 4"],
  "new-card": ["M6 3h8l4 4v14H6z", "M14 3v4h4"],
  note: ["M6 3h8l4 4v14H6z", "M14 3v4h4", "M9 12h6", "M9 16h6"],
  image: ["M4 5h16v14H4z", "M4 16l5-5 4 4 3-3 4 4", "M9 9h.01"],
  lines: ["M5 7h14", "M5 12h14", "M5 17h9"],
  line: ["M4 12h16"],
  arrow: ["M4 12h15", "M14 7l5 5-5 5"],
  "double-arrow": ["M5 12h14", "M10 7l-5 5 5 5", "M14 7l5 5-5 5"],
  align: ["M4 4v16", "M8 7h12", "M8 12h8", "M8 17h10"],
  check: ["M5 12l4 4 10-10"],
};

/** L'icône `name` : un SVG de la couleur du texte, qui n'attrape pas les clics. */
export function canvasIcon(name: CanvasIcon): SVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("canvas-icon");
  for (const d of PATHS[name]) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
