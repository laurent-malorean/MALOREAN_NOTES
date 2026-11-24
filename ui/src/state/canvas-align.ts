// Canvas (fiche 0052, spécification § 5) : aligner et répartir au moins deux cartes sélectionnées. Seuls
// les alignements et la répartition de l'espace sont repris : la spécification ne dit pas comment
// « disposer en ligne, en colonne, en grille » ni « justifier » placent les cartes.
import type { CanvasItem } from "../bridge";
import { card } from "./canvas-model";

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Distribution = "horizontal" | "vertical";

/** Ce que chaque alignement fait de la carte : sa nouvelle position selon la zone des cartes. */
const ALIGN: Record<
  Alignment,
  (
    zone: { x: number; y: number; w: number; h: number },
    c: { w: number; h: number },
  ) => Partial<{ x: number; y: number }>
> = {
  left: (zone) => ({ x: zone.x }),
  center: (zone, c) => ({ x: zone.x + (zone.w - c.w) / 2 }),
  right: (zone, c) => ({ x: zone.x + zone.w - c.w }),
  top: (zone) => ({ y: zone.y }),
  middle: (zone, c) => ({ y: zone.y + (zone.h - c.h) / 2 }),
  bottom: (zone, c) => ({ y: zone.y + zone.h - c.h }),
};

function selected(canvas: CanvasItem, ids: readonly string[]) {
  return ids.flatMap((id) => card(canvas, id) ?? []);
}

/** Les cartes alignées sur la zone qu'elles couvrent ensemble. */
export function aligned(canvas: CanvasItem, ids: readonly string[], how: Alignment): CanvasItem {
  const cards = selected(canvas, ids);
  if (cards.length < 2) return canvas;
  const left = Math.min(...cards.map((c) => c.x));
  const top = Math.min(...cards.map((c) => c.y));
  const zone = {
    x: left,
    y: top,
    w: Math.max(...cards.map((c) => c.x + c.width)) - left,
    h: Math.max(...cards.map((c) => c.y + c.height)) - top,
  };
  const set = new Set(cards.map((c) => c.id));
  return {
    ...canvas,
    cards: canvas.cards.map((c) =>
      set.has(c.id) ? roundedPlace({ ...c, ...ALIGN[how](zone, { w: c.width, h: c.height }) }) : c,
    ),
  };
}

const roundedPlace = <T extends { x: number; y: number }>(c: T): T => ({
  ...c,
  x: Math.round(c.x),
  y: Math.round(c.y),
});

/**
 * Les cartes réparties : les deux extrêmes restent, l'espace entre les cartes devient le même
 * (dans l'ordre où elles sont, de gauche à droite ou de haut en bas).
 */
export function distributed(
  canvas: CanvasItem,
  ids: readonly string[],
  how: Distribution,
): CanvasItem {
  const cards = selected(canvas, ids);
  if (cards.length < 3) return canvas;
  const horizontal = how === "horizontal";
  const start = (c: (typeof cards)[number]) => (horizontal ? c.x : c.y);
  const size = (c: (typeof cards)[number]) => (horizontal ? c.width : c.height);
  const ordered = [...cards].sort((a, b) => start(a) - start(b));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first === undefined || last === undefined) return canvas;
  const span = start(last) + size(last) - start(first);
  const gap = (span - ordered.reduce((sum, c) => sum + size(c), 0)) / (ordered.length - 1);
  const places = new Map<string, number>();
  let at = start(first);
  for (const c of ordered) {
    places.set(c.id, Math.round(at));
    at += size(c) + gap;
  }
  return {
    ...canvas,
    cards: canvas.cards.map((c) => {
      const place = places.get(c.id);
      if (place === undefined) return c;
      return horizontal ? { ...c, x: place } : { ...c, y: place };
    }),
  };
}
