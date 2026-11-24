// Canvas (fiche 0052) : la géométrie des flèches. Une flèche est une courbe de Bézier entre les
// milieux de deux côtés (spécification canvas.md § 5) ; une ligne droite quand les cartes se font face.
import type { Point, Rect } from "./mind-map-viewport";
import type { Side } from "./canvas-model";

/** Le milieu du côté `side` du rectangle. */
export function anchor(box: Rect, side: Side): Point {
  switch (side) {
    case "top":
      return { x: box.x + box.w / 2, y: box.y };
    case "bottom":
      return { x: box.x + box.w / 2, y: box.y + box.h };
    case "left":
      return { x: box.x, y: box.y + box.h / 2 };
    case "right":
      return { x: box.x + box.w, y: box.y + box.h / 2 };
  }
}

/** La direction qui sort du côté. */
export const outward = (side: Side): Point =>
  ({ top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } })[
    side
  ];

/** Ce que la courbe s'éloigne du côté avant de tourner : la moitié de la distance, au moins 40. */
const CURVE_MIN = 40;

export interface Curve {
  readonly from: Point;
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

/** La courbe d'une flèche de `from` (côté `fromSide`) vers `to` (côté `toSide`). */
export function curve(from: Point, fromSide: Side, to: Point, toSide: Side): Curve {
  const reach = Math.max(CURVE_MIN, Math.hypot(to.x - from.x, to.y - from.y) / 2);
  const a = outward(fromSide);
  const b = outward(toSide);
  return {
    from,
    to,
    c1: { x: from.x + a.x * reach, y: from.y + a.y * reach },
    c2: { x: to.x + b.x * reach, y: to.y + b.y * reach },
  };
}

/** Le tracé SVG de la courbe. */
export const pathOf = (c: Curve): string =>
  `M ${c.from.x} ${c.from.y} C ${c.c1.x} ${c.c1.y}, ${c.c2.x} ${c.c2.y}, ${c.to.x} ${c.to.y}`;

/** Le point de la courbe au quart `t` (0 au départ, 1 à l'arrivée). */
export function pointAt(c: Curve, t: number): Point {
  const u = 1 - t;
  const [w0, w1, w2, w3] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: w0 * c.from.x + w1 * c.c1.x + w2 * c.c2.x + w3 * c.to.x,
    y: w0 * c.from.y + w1 * c.c1.y + w2 * c.c2.y + w3 * c.to.y,
  };
}

/** L'angle, en degrés, d'une pointe posée au bout `end` de la courbe : vers l'extérieur de la courbe. */
export function headAngle(c: Curve, end: "from" | "to"): number {
  const tip = end === "to" ? c.to : c.from;
  const inner = end === "to" ? c.c2 : c.c1;
  return (Math.atan2(tip.y - inner.y, tip.x - inner.x) * 180) / Math.PI;
}

/** Le côté de `box` le plus proche du point `at` (là où une flèche lâchée sur la carte s'accroche). */
export function nearestSide(box: Rect, at: Point): Side {
  const sides: Side[] = ["top", "right", "bottom", "left"];
  const distance = (side: Side) => {
    const p = anchor(box, side);
    return Math.hypot(p.x - at.x, p.y - at.y);
  };
  return sides.reduce((best, side) => (distance(side) < distance(best) ? side : best));
}
