// Canvas (fiche 0052, spécification § 9) : la vue d'un canvas infini, où l'on regarde et à quel zoom.
// Les types et les fonctions qui ne dépendent pas des bornes du zoom sont ceux de la carte mentale.
import {
  type Point,
  type Rect,
  type Viewport,
  centredOn,
  panned,
  toMap,
} from "./mind-map-viewport";

export { centredOn, panned, toMap };
export type { Point, Rect, Viewport };

/** Un canvas se dézoome beaucoup plus qu'une carte mentale : très dézoomé, les cartes se réduisent à un rectangle. */
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 4;
/** Ce que multiplient les boutons « Zoomer » et « Dézoomer ». */
export const ZOOM_STEP = 1.25;
/** Sous ce zoom, une carte n'est plus qu'un rectangle coloré avec une icône (spécification § 14). */
export const DETAIL_SCALE = 0.25;
const FIT_MARGIN = 40;
const FIT_MAX_SCALE = 1;
const PINCH_RATE = 0.01;
const WHEEL_RATE = 0.003;

const clamp = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Le zoom initial : 100 %, le coin haut gauche du canvas au centre de la vue. */
export const initial = (view: { w: number; h: number }): Viewport => ({
  x: view.w / 2,
  y: view.h / 2,
  scale: 1,
});

/** Tout le contenu dans la vue : centré, avec 40 points de marge, sans dépasser 100 %. */
export function fitted(bounds: Rect | null, view: { w: number; h: number }): Viewport {
  if (bounds === null) return initial(view);
  const room = (size: number, content: number) =>
    content > 0 ? (size - 2 * FIT_MARGIN) / content : Infinity;
  const scale = Math.min(FIT_MAX_SCALE, room(view.w, bounds.w), room(view.h, bounds.h));
  const fit = clamp(scale);
  return {
    scale: fit,
    x: (view.w - bounds.w * fit) / 2 - bounds.x * fit,
    y: (view.h - bounds.h * fit) / 2 - bounds.y * fit,
  };
}

/** Le zoom multiplié par `factor` autour du point `around` de la vue, qui reste où il est. */
export function zoomed(viewport: Viewport, factor: number, around: Point): Viewport {
  const scale = clamp(viewport.scale * factor);
  const ratio = scale / viewport.scale;
  return {
    scale,
    x: around.x - (around.x - viewport.x) * ratio,
    y: around.y - (around.y - viewport.y) * ratio,
  };
}

/** Ce qu'une molette ou un pincement fait à la vue : Cmd (ou Ctrl) + molette zoome, Maj + molette va de côté, la molette descend. */
export function wheeled(
  viewport: Viewport,
  wheel: { deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  at: Point,
): Viewport {
  if (wheel.ctrlKey || wheel.metaKey) {
    const rate = wheel.ctrlKey ? PINCH_RATE : WHEEL_RATE;
    return zoomed(viewport, Math.exp(-wheel.deltaY * rate), at);
  }
  if (wheel.shiftKey && wheel.deltaX === 0) return panned(viewport, -wheel.deltaY, 0);
  return panned(viewport, -wheel.deltaX, -wheel.deltaY);
}
