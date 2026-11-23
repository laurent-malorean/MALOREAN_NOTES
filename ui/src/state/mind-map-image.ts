// Carte mentale : le cadre de l'image qui montre toute la carte.
import { titleFromPath } from "./claude-input-bar";
import type { Rect } from "./mind-map-viewport";

/** La marge, en points, autour de la carte entière. */
export const IMAGE_MARGIN = 40;
/** Pixels de l'image par point de la carte : une image deux fois plus fine que l'écran. */
export const IMAGE_SCALE = 2;

export interface ImageFrame {
  /** Le coin haut gauche de l'image, sur la carte. */
  readonly x: number;
  readonly y: number;
  /** Sa taille, en points. */
  readonly width: number;
  readonly height: number;
  /** Sa taille, en pixels. */
  readonly pixelsWide: number;
  readonly pixelsHigh: number;
}

/** Le cadre de l'image d'une carte dont les nœuds tiennent dans `bounds` ; rien si la carte est vide. */
export function imageFrame(bounds: Rect | null): ImageFrame | null {
  if (bounds === null) return null;
  const width = bounds.w + 2 * IMAGE_MARGIN;
  const height = bounds.h + 2 * IMAGE_MARGIN;
  return {
    x: bounds.x - IMAGE_MARGIN,
    y: bounds.y - IMAGE_MARGIN,
    width,
    height,
    pixelsWide: width * IMAGE_SCALE,
    pixelsHigh: height * IMAGE_SCALE,
  };
}

/** Le titre de la carte (son premier titre `#`), sinon le nom de son fichier sans `.md` : le nom proposé pour l'image. */
export function mapTitle(content: string, path: string): string {
  const heading = /^#[ \t]+(.+)$/m.exec(content)?.[1]?.trim();
  return heading ?? titleFromPath(path);
}
