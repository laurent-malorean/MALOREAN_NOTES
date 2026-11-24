// Canvas (fiche 0052, spécification § 5 et § 10) : l'accrochage au déplacement et au redimensionnement,
// à la grille du fond et aux cartes proches. La touche Espace le désactive.
import type { Rect } from "./mind-map-viewport";

/** L'écart des points du fond, qui est aussi celui de la grille d'accrochage. */
export const GRID = 20;
/** À quelle distance, en pixels de l'écran, un bord s'accroche à celui d'une autre carte. */
export const SNAP_DISTANCE = 8;

export interface SnapSettings {
  readonly grid: boolean;
  readonly objects: boolean;
}

const onGrid = (value: number) => Math.round(value / GRID) * GRID;

/** Le plus petit écart pour amener l'un des `moving` sur l'un des `targets` ; 0 si aucun n'est assez près. */
function closest(moving: readonly number[], targets: readonly number[], reach: number): number {
  let best = 0;
  let bestDistance = reach;
  for (const m of moving) {
    for (const t of targets) {
      const delta = t - m;
      if (Math.abs(delta) <= bestDistance) {
        best = delta;
        bestDistance = Math.abs(delta);
      }
    }
  }
  return best;
}

const xs = (r: Rect) => [r.x, r.x + r.w / 2, r.x + r.w];
const ys = (r: Rect) => [r.y, r.y + r.h / 2, r.y + r.h];

/** La correction à ajouter à un déplacement de `box` (déjà déplacée) : à la grille, sinon aux cartes `others`. */
export function snapMove(
  box: Rect,
  others: readonly Rect[],
  settings: SnapSettings,
  scale: number,
): { dx: number; dy: number } {
  const reach = SNAP_DISTANCE / scale;
  let dx = 0;
  let dy = 0;
  if (settings.objects) {
    dx = closest(xs(box), others.flatMap(xs), reach);
    dy = closest(ys(box), others.flatMap(ys), reach);
  }
  if (settings.grid) {
    if (dx === 0) dx = onGrid(box.x) - box.x;
    if (dy === 0) dy = onGrid(box.y) - box.y;
  }
  return { dx, dy };
}

/** Les bords que tire un redimensionnement : de quels côtés on tire. */
export interface Edges {
  readonly left: boolean;
  readonly right: boolean;
  readonly top: boolean;
  readonly bottom: boolean;
}

/** Un bord déplacé jusqu'à la grille ou à un bord d'une autre carte. */
function snapEdge(
  value: number,
  targets: readonly number[],
  settings: SnapSettings,
  reach: number,
): number {
  if (settings.objects) {
    const delta = closest([value], targets, reach);
    if (delta !== 0) return value + delta;
  }
  return settings.grid ? onGrid(value) : value;
}

/** Le rectangle `box` redimensionné en tirant `edges`, ces bords accrochés ; jamais plus petit que `min`. */
export function snapResize(
  box: Rect,
  edges: Edges,
  others: readonly Rect[],
  settings: SnapSettings,
  scale: number,
  min = { w: GRID, h: GRID },
): Rect {
  const reach = SNAP_DISTANCE / scale;
  const xTargets = others.flatMap((r) => [r.x, r.x + r.w]);
  const yTargets = others.flatMap((r) => [r.y, r.y + r.h]);
  let { x, y } = box;
  let right = box.x + box.w;
  let bottom = box.y + box.h;
  if (edges.left) x = snapEdge(x, xTargets, settings, reach);
  if (edges.right) right = snapEdge(right, xTargets, settings, reach);
  if (edges.top) y = snapEdge(y, yTargets, settings, reach);
  if (edges.bottom) bottom = snapEdge(bottom, yTargets, settings, reach);
  if (right - x < min.w) {
    if (edges.left) x = right - min.w;
    else right = x + min.w;
  }
  if (bottom - y < min.h) {
    if (edges.top) y = bottom - min.h;
    else bottom = y + min.h;
  }
  return { x, y, w: right - x, h: bottom - y };
}
