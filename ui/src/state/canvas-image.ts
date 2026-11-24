// Canvas (fiche 0052, spécification § 12) : le cadre de l'image PNG d'un canvas, comme celui de la carte
// mentale (40 points de marge, 2 pixels par point).
import type { CanvasItem } from "../bridge";
import { boundsOf, rectOf } from "./canvas-model";
import { type ImageFrame, imageFrame } from "./mind-map-image";

/** Le cadre de l'image de tout le canvas ; `null` pour un canvas vide, qui ne s'exporte pas. */
export function canvasFrame(canvas: CanvasItem): ImageFrame | null {
  return imageFrame(boundsOf(canvas.cards.map(rectOf)));
}

/** Le nom proposé pour l'image : le nom du fichier sans son extension. */
export function canvasTitle(path: string): string {
  return path.replace(/^.*\//, "").replace(/\.canvas$/i, "");
}
