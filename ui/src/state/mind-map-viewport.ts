// Carte mentale (fiche 0050, spécification § 6.4) : la vue, c'est-à-dire où l'on regarde et à quel
// zoom. Des fonctions pures ; les points de la carte sont en « points » (un pixel à 100 %).

export interface Viewport {
  /** Où le coin haut gauche de la carte tombe dans la vue, en pixels. */
  readonly x: number;
  readonly y: number;
  /** Le zoom : 1 pour 100 %. */
  readonly scale: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3;
/** Ce que multiplient les boutons « + » et « − ». */
export const ZOOM_STEP = 1.2;
const FIT_MARGIN = 40;
const FIT_MAX_SCALE = 1.5;
/** La marge gardée autour d'un nœud montré par un déplacement de la vue. */
const REVEAL_MARGIN = 24;
const PINCH_RATE = 0.01;
const WHEEL_RATE = 0.003;
/** La part du haut, et du bas, d'un nœud où un dépôt en fait un frère. */
const EDGE_SHARE = 0.25;

export const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Toute la carte dans la vue : centrée, avec 40 points de marge, sans dépasser 150 %. */
export function fitted(bounds: Rect | null, view: { w: number; h: number }): Viewport {
  if (bounds === null) return { x: view.w / 2, y: view.h / 2, scale: 1 };
  const room = (size: number, content: number) =>
    content > 0 ? (size - 2 * FIT_MARGIN) / content : Infinity;
  const scale = clampScale(Math.min(FIT_MAX_SCALE, room(view.w, bounds.w), room(view.h, bounds.h)));
  return {
    scale,
    x: (view.w - bounds.w * scale) / 2 - bounds.x * scale,
    y: (view.h - bounds.h * scale) / 2 - bounds.y * scale,
  };
}

/** Le zoom multiplié par `factor` autour du point `around` de la vue, qui reste où il est. */
export function zoomed(viewport: Viewport, factor: number, around: Point): Viewport {
  const scale = clampScale(viewport.scale * factor);
  const ratio = scale / viewport.scale;
  return {
    scale,
    x: around.x - (around.x - viewport.x) * ratio,
    y: around.y - (around.y - viewport.y) * ratio,
  };
}

export const panned = (viewport: Viewport, dx: number, dy: number): Viewport => ({
  ...viewport,
  x: viewport.x + dx,
  y: viewport.y + dy,
});

/** Le point de la carte sous le point `at` de la vue. */
export const toMap = (viewport: Viewport, at: Point): Point => ({
  x: (at.x - viewport.x) / viewport.scale,
  y: (at.y - viewport.y) / viewport.scale,
});

/** La vue déplacée, si besoin, pour que `box` (en points de la carte) y soit tout entière visible. */
export function revealed(viewport: Viewport, box: Rect, view: { w: number; h: number }): Viewport {
  const shift = (start: number, size: number, offset: number, room: number) => {
    const from = start * viewport.scale + offset;
    const to = from + size * viewport.scale;
    if (from < REVEAL_MARGIN) return REVEAL_MARGIN - from;
    if (to > room - REVEAL_MARGIN) return Math.max(room - REVEAL_MARGIN - to, REVEAL_MARGIN - from);
    return 0;
  };
  return panned(
    viewport,
    shift(box.x, box.w, viewport.x, view.w),
    shift(box.y, box.h, viewport.y, view.h),
  );
}

/** La vue centrée sur `box`. */
export function centredOn(viewport: Viewport, box: Rect, view: { w: number; h: number }): Viewport {
  return {
    ...viewport,
    x: view.w / 2 - (box.x + box.w / 2) * viewport.scale,
    y: view.h / 2 - (box.y + box.h / 2) * viewport.scale,
  };
}

/** Où un dépôt à la hauteur `y` sur `box` met le nœud : au-dessus, dessous (quarts haut et bas) ou dedans. */
export function dropPlace(box: Rect, y: number): "before" | "child" | "after" {
  const share = (y - box.y) / box.h;
  if (share < EDGE_SHARE) return "before";
  return share > 1 - EDGE_SHARE ? "after" : "child";
}

export const contains = (box: Rect, at: Point) =>
  at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h;

/** Ce qu'une molette ou un pincement fait à la vue : Cmd + molette ou pincer zoome autour du pointeur, le reste déplace. */
export function wheeled(
  viewport: Viewport,
  wheel: { deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean },
  at: Point,
): Viewport {
  if (!wheel.ctrlKey && !wheel.metaKey) return panned(viewport, -wheel.deltaX, -wheel.deltaY);
  // Pincer sur le trackpad arrive en molette avec Ctrl, par petits pas.
  const rate = wheel.ctrlKey ? PINCH_RATE : WHEEL_RATE;
  return zoomed(viewport, Math.exp(-wheel.deltaY * rate), at);
}
