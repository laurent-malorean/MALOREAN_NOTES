// Canvas (fiche 0052, spécification § 4 à § 6 et § 9) : les gestes à la souris. Déplacer la vue, tracer un
// rectangle de sélection, déplacer et redimensionner des cartes (avec accrochage), créer une flèche par le
// rond du bord d'une carte, déplacer l'extrémité d'une flèche, double-clic.
import type { CanvasItem } from "../bridge";
import { curve, nearestSide, pathOf } from "../state/canvas-geometry";
import { anchor } from "../state/canvas-geometry";
import {
  type Selectable,
  type Side,
  boundsOf,
  broughtToFront,
  card,
  arrow,
  moved,
  newTextCard,
  rectOf,
  withArrow,
  withArrowChanged,
  withCard,
  withMembers,
  withoutArrows,
} from "../state/canvas-model";
import { type Edges, type SnapSettings, snapMove, snapResize } from "../state/canvas-snap";
import { type Point, type Rect, type Viewport, panned, toMap } from "../state/canvas-viewport";
import { curveOf } from "./canvas-arrows";
import { isImage } from "./canvas-cards";

/** Deux appuis à moins de ce délai (ms) et de cette distance (pixels) font un double-clic. */
const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_DISTANCE = 6;
/** Sous cette distance (pixels), un appui suivi d'un relâchement est un clic, pas un glissement. */
const DRAG_THRESHOLD = 3;

/** Ce que les gestes demandent à la vue. */
export interface GestureHost {
  /** L'élément qui reçoit la souris. */
  readonly surface: HTMLElement;
  /** Le calque SVG où se trace la flèche en cours de création. */
  readonly overlay: SVGElement;
  readonly canvas: () => CanvasItem;
  readonly view: () => Viewport;
  readonly setView: (view: Viewport) => void;
  readonly selection: () => readonly Selectable[];
  readonly select: (selection: readonly Selectable[]) => void;
  readonly snap: () => SnapSettings;
  readonly readOnly: () => boolean;
  /** Montre `next` sans le garder. */
  readonly preview: (next: CanvasItem) => void;
  /** Garde `next` comme un changement ; `before` est ce qu'on voyait avant. */
  readonly commit: (next: CanvasItem, before: CanvasItem) => void;
  readonly edit: (item: Selectable) => void;
  readonly spaceDown: () => boolean;
}

interface Pointer {
  readonly x: number;
  readonly y: number;
  readonly shift: boolean;
}

const pointerOf = (e: PointerEvent): Pointer => ({ x: e.clientX, y: e.clientY, shift: e.shiftKey });
const sameSelectable = (a: Selectable, b: Selectable) => a.kind === b.kind && a.id === b.id;

function toggled(selection: readonly Selectable[], item: Selectable): Selectable[] {
  return selection.some((s) => sameSelectable(s, item))
    ? selection.filter((s) => !sameSelectable(s, item))
    : [...selection, item];
}

/** Les bords que tire la poignée `edges` (`lt`, `r`, `rb`…). */
export function edgesOf(grip: string): Edges {
  return {
    left: grip.includes("l"),
    right: grip.includes("r"),
    top: grip.includes("t"),
    bottom: grip.includes("b"),
  };
}

/** Ce que le pointeur a touché : une poignée, un rond de flèche, une extrémité de flèche, une flèche, une carte, ou le fond. */
type Hit =
  | { kind: "grip" | "dot"; element: HTMLElement }
  | { kind: "end"; arrow: string; element: SVGElement }
  | { kind: "arrow" | "card"; id: string }
  | { kind: "empty" };

/** La poignée ou le rond d'une carte sous le pointeur, s'il y en a un. */
function handleHit(target: HTMLElement): Hit | null {
  for (const [selector, kind] of [
    [".canvas-grip", "grip"],
    [".canvas-link-dot", "dot"],
  ] as const) {
    const element = target.closest<HTMLElement>(selector);
    if (element?.parentElement?.dataset.id) return { kind, element };
  }
  return null;
}

function hitOf(target: HTMLElement): Hit {
  const handle = handleHit(target);
  if (handle !== null) return handle;
  const arrowId = target.closest("[data-arrow]")?.getAttribute("data-arrow");
  const end = target.closest<SVGElement>(".canvas-arrow-end");
  if (end !== null && arrowId) return { kind: "end", arrow: arrowId, element: end };
  if (arrowId) return { kind: "arrow", id: arrowId };
  const cardId = target.closest<HTMLElement>(".canvas-card")?.dataset.id;
  return cardId ? { kind: "card", id: cardId } : { kind: "empty" };
}

/** Un geste en cours : ce qu'il fait à chaque mouvement et au relâchement. */
interface Gesture {
  move(e: Pointer): void;
  up(e: Pointer): void;
}

class Gestures {
  private gesture: Gesture | null = null;
  private last: { time: number; x: number; y: number } | null = null;

  constructor(private readonly host: GestureHost) {}

  attach(): void {
    const { surface } = this.host;
    surface.addEventListener("pointerdown", (e) => this.down(e));
    surface.addEventListener("pointermove", (e) => this.gesture?.move(pointerOf(e)));
    const end = (e: PointerEvent) => {
      const gesture = this.gesture;
      this.gesture = null;
      gesture?.up(pointerOf(e));
    };
    surface.addEventListener("pointerup", end);
    surface.addEventListener("pointercancel", end);
  }

  private at(p: { x: number; y: number }): Point {
    const box = this.host.surface.getBoundingClientRect();
    return toMap(this.host.view(), { x: p.x - box.left, y: p.y - box.top });
  }

  private doubled(e: PointerEvent): boolean {
    const now = e.timeStamp;
    const before = this.last;
    this.last = { time: now, x: e.clientX, y: e.clientY };
    const near =
      before !== null &&
      now - before.time < DOUBLE_CLICK_MS &&
      Math.hypot(e.clientX - before.x, e.clientY - before.y) < DOUBLE_CLICK_DISTANCE;
    if (near) this.last = null;
    return near;
  }

  private down(e: PointerEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest("textarea, input, a[href^='http']") !== null || e.button === 2) return;
    try {
      this.host.surface.setPointerCapture(e.pointerId);
    } catch {
      // Un pointeur simulé ne se capture pas : le geste marche quand même.
    }
    const start = pointerOf(e);
    const double = this.doubled(e);
    if (e.button === 1 || this.host.spaceDown()) return this.pan(start);
    const hit = hitOf(target);
    if (this.host.readOnly()) return this.readOnlyDown(start, hit);
    this.dispatch(hit, start, double);
  }

  private dispatch(hit: Hit, start: Pointer, double: boolean): void {
    switch (hit.kind) {
      case "grip":
        return this.resize(start, hit.element);
      case "dot":
        return this.link(hit.element);
      case "end":
        return this.reconnect(hit.arrow, hit.element);
      case "arrow":
        return this.onArrow(start, hit.id, double);
      case "card":
        return this.onCard(start, hit.id, double);
      case "empty":
        return this.onEmpty(start, double);
    }
  }

  /** En lecture seule on peut choisir, pas changer. */
  private readOnlyDown(start: Pointer, hit: Hit): void {
    const item: Selectable | null =
      hit.kind === "card" || hit.kind === "arrow" ? { kind: hit.kind, id: hit.id } : null;
    const current = this.host.selection();
    if (item === null) this.host.select([]);
    else this.host.select(start.shift ? toggled(current, item) : [item]);
  }

  private pan(from: Pointer): void {
    let last = from;
    this.gesture = {
      move: (e) => {
        this.host.setView(panned(this.host.view(), e.x - last.x, e.y - last.y));
        last = e;
      },
      up: () => undefined,
    };
  }

  private onEmpty(start: Pointer, double: boolean): void {
    if (double) {
      const at = this.at(start);
      const created = newTextCard(at.x - 125, at.y - 30);
      const before = this.host.canvas();
      this.host.commit(withCard(before, created), before);
      this.host.select([{ kind: "card", id: created.id }]);
      this.host.edit({ kind: "card", id: created.id });
      return;
    }
    const kept = start.shift ? this.host.selection() : [];
    this.host.select(kept);
    const origin = this.at(start);
    this.gesture = {
      move: (e) => this.host.select([...kept, ...this.inside(origin, this.at(e))]),
      up: (e) => this.host.select([...kept, ...this.inside(origin, this.at(e))]),
    };
  }

  /** Les cartes et flèches entièrement dans le rectangle tracé de `a` à `b`. */
  private inside(a: Point, b: Point): Selectable[] {
    const box: Rect = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y),
    };
    if (box.w < 1 && box.h < 1) return [];
    const canvas = this.host.canvas();
    const hit = (r: Rect) =>
      r.x >= box.x && r.y >= box.y && r.x + r.w <= box.x + box.w && r.y + r.h <= box.y + box.h;
    const cards = canvas.cards
      .filter((c) => hit(rectOf(c)))
      .map((c): Selectable => ({ kind: "card", id: c.id }));
    const arrows = canvas.arrows
      .filter((a) => {
        const c = curveOf(canvas, a);
        return (
          c !== null &&
          hit({
            x: Math.min(c.from.x, c.to.x),
            y: Math.min(c.from.y, c.to.y),
            w: Math.abs(c.to.x - c.from.x),
            h: Math.abs(c.to.y - c.from.y),
          })
        );
      })
      .map((a): Selectable => ({ kind: "arrow", id: a.id }));
    return [...cards, ...arrows];
  }

  private onArrow(start: Pointer, id: string, double: boolean): void {
    const item: Selectable = { kind: "arrow", id };
    this.host.select(start.shift ? toggled(this.host.selection(), item) : [item]);
    if (double && !this.host.readOnly()) this.host.edit(item);
    this.gesture = { move: () => undefined, up: () => undefined };
  }

  private onCard(start: Pointer, id: string, double: boolean): void {
    const item: Selectable = { kind: "card", id };
    const current = this.host.selection();
    const wasSelected = current.some((s) => sameSelectable(s, item));
    if (start.shift) this.host.select(toggled(current, item));
    else if (!wasSelected) this.host.select([item]);
    if (double) {
      this.host.edit(item);
      return;
    }
    if (start.shift) return;
    this.move(start);
  }

  private move(start: Pointer): void {
    const before = this.host.canvas();
    const picked = this.host
      .selection()
      .filter((s) => s.kind === "card")
      .map((s) => s.id);
    const ids = withMembers(before, picked);
    const rects = ids.flatMap((id) => card(before, id) ?? []).map(rectOf);
    const frame = boundsOf(rects);
    const others = before.cards.filter((c) => !ids.includes(c.id)).map(rectOf);
    let latest = before;
    const apply = (e: Pointer, quiet: boolean) => {
      const scale = this.host.view().scale;
      let dx = (e.x - start.x) / scale;
      let dy = (e.y - start.y) / scale;
      if (e.shift && Math.abs(dx) > Math.abs(dy)) dy = 0;
      else if (e.shift) dx = 0;
      if (frame !== null && !this.host.spaceDown()) {
        const fix = snapMove(
          { ...frame, x: frame.x + dx, y: frame.y + dy },
          others,
          this.host.snap(),
          scale,
        );
        dx += fix.dx;
        dy += fix.dy;
      }
      latest = moved(before, ids, dx, dy);
      if (!quiet) this.host.preview(latest);
    };
    let dragging = false;
    this.gesture = {
      move: (e) => {
        if (!dragging && Math.hypot(e.x - start.x, e.y - start.y) < DRAG_THRESHOLD) return;
        dragging = true;
        apply(e, false);
      },
      up: (e) => {
        if (dragging) apply(e, true);
        const next = broughtToFront(
          latest,
          ids.filter((id) => picked.includes(id)),
        );
        this.host.commit(dragging ? next : broughtToFront(before, picked), before);
      },
    };
  }

  private resize(start: Pointer, grip: HTMLElement): void {
    const id = (grip.parentElement as HTMLElement).dataset.id as string;
    const before = this.host.canvas();
    const target = card(before, id);
    if (target === undefined) return;
    this.host.select([{ kind: "card", id }]);
    const edges = edgesOf(grip.dataset.edges ?? "");
    const others = before.cards.filter((c) => c.id !== id).map(rectOf);
    const startBox = rectOf(target);
    // Une image garde ses proportions sans Maj ; Maj ne change rien de plus.
    const isImageCard = target.kind === "file" && isImage(target.file ?? "");
    let latest = before;
    const apply = (e: Pointer) => {
      const scale = this.host.view().scale;
      const dx = (e.x - start.x) / scale;
      const dy = (e.y - start.y) / scale;
      let box: Rect = {
        x: startBox.x + (edges.left ? dx : 0),
        y: startBox.y + (edges.top ? dy : 0),
        w: startBox.w + (edges.right ? dx : 0) - (edges.left ? dx : 0),
        h: startBox.h + (edges.bottom ? dy : 0) - (edges.top ? dy : 0),
      };
      const snapped = (b: Rect) =>
        this.host.spaceDown() ? b : snapResize(b, edges, others, this.host.snap(), scale);
      box = resizedBox(
        { box, start: startBox, edges, keepRatio: e.shift, image: isImageCard },
        snapped,
      );
      const r = {
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.w),
        h: Math.round(box.h),
      };
      latest = {
        ...before,
        cards: before.cards.map((c) =>
          c.id === id ? { ...c, x: r.x, y: r.y, width: r.w, height: r.h } : c,
        ),
      };
    };
    this.gesture = {
      move: (e) => {
        apply(e);
        this.host.preview(latest);
      },
      up: (e) => {
        apply(e);
        this.host.commit(broughtToFront(latest, [id]), before);
      },
    };
  }

  /** Le trait qui suit le pointeur pendant qu'une flèche se trace. */
  private tracing(from: Point, side: Side): (to: Point) => void {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "canvas-arrow-draft");
    this.host.overlay.replaceChildren(path);
    return (to) =>
      path.setAttribute("d", pathOf(curve(from, side, to, side === "left" ? "right" : "left")));
  }

  private link(dot: HTMLElement): void {
    const from = (dot.parentElement as HTMLElement).dataset.id as string;
    const side = dot.dataset.side as Side;
    const before = this.host.canvas();
    const source = card(before, from);
    if (source === undefined) return;
    const draw = this.tracing(anchor(rectOf(source), side), side);
    this.gesture = {
      move: (e) => draw(this.at(e)),
      up: (e) => {
        this.host.overlay.replaceChildren();
        const target = this.cardUnder(e);
        if (target !== null && target !== from) {
          const box = card(before, target);
          if (box === undefined) return;
          const made = withArrow(
            before,
            { id: from, side },
            { id: target, side: nearestSide(rectOf(box), this.at(e)) },
          );
          this.host.commit(made.canvas, before);
          this.host.select([{ kind: "arrow", id: made.id }]);
        } else if (target === null) this.newCardAt(before, from, side, this.at(e));
      },
    };
  }

  /** Une flèche lâchée dans le vide : une carte texte neuve à l'autre bout (spécification § 6). */
  private newCardAt(before: CanvasItem, from: string, side: Side, at: Point): void {
    const created = newTextCard(at.x, at.y);
    const placed = {
      ...created,
      x: Math.round(at.x - created.width / 2),
      y: Math.round(at.y - created.height / 2),
    };
    const facing: Side = { top: "bottom", bottom: "top", left: "right", right: "left" }[
      side
    ] as Side;
    const made = withArrow(
      withCard(before, placed),
      { id: from, side },
      { id: placed.id, side: facing },
    );
    this.host.commit(made.canvas, before);
    this.host.select([{ kind: "card", id: placed.id }]);
    this.host.edit({ kind: "card", id: placed.id });
  }

  /** L'identifiant de la carte sous le pointeur ; `null` s'il n'y en a pas. */
  private cardUnder(p: { x: number; y: number }): string | null {
    const at = this.at(p);
    const hit = [...this.host.canvas().cards]
      .reverse()
      .find(
        (c) =>
          c.kind !== "group" &&
          at.x >= c.x &&
          at.x <= c.x + c.width &&
          at.y >= c.y &&
          at.y <= c.y + c.height,
      );
    return hit?.id ?? null;
  }

  private reconnect(id: string, end: SVGElement): void {
    const before = this.host.canvas();
    const current = arrow(before, id);
    if (current === undefined) return;
    const which = end.getAttribute("data-end") === "from" ? "from" : "to";
    const fixed = which === "from" ? current.to : current.from;
    const fixedSide = (which === "from" ? current.toSide : current.fromSide) as Side;
    const fixedCard = card(before, fixed);
    if (fixedCard === undefined) return;
    const draw = this.tracing(anchor(rectOf(fixedCard), fixedSide), fixedSide);
    this.gesture = {
      move: (e) => draw(this.at(e)),
      up: (e) => {
        this.host.overlay.replaceChildren();
        const target = this.cardUnder(e);
        if (target === null) return this.host.commit(withoutArrows(before, [id]), before);
        const box = card(before, target);
        if (box === undefined) return;
        const side = nearestSide(rectOf(box), this.at(e));
        const patch =
          which === "from" ? { from: target, fromSide: side } : { to: target, toSide: side };
        this.host.commit(withArrowChanged(before, id, patch), before);
      },
    };
  }
}

/**
 * La boîte après Maj (rapport gardé) et accrochage ; pour une image, l'accrochage passe avant le rapport,
 * qui reste gardé quoi qu'il arrive.
 */
function resizedBox(
  it: { box: Rect; start: Rect; edges: Edges; keepRatio: boolean; image: boolean },
  snapped: (box: Rect) => Rect,
): Rect {
  const kept = it.keepRatio && !it.image ? ratioKept(it.box, it.start, it.edges) : it.box;
  const box = snapped(kept);
  return it.image ? ratioKept(box, it.start, it.edges) : box;
}

/** La boîte redimensionnée gardant le rapport largeur/hauteur de `start` (Maj pendant le redimensionnement). */
function ratioKept(box: Rect, start: Rect, edges: Edges): Rect {
  const ratio = start.w / start.h;
  const sideOnly = (edges.left || edges.right) !== (edges.top || edges.bottom);
  // Une poignée de côté mène une seule dimension ; un coin, la plus grande des deux.
  const w =
    sideOnly && (edges.top || edges.bottom)
      ? box.h * ratio
      : sideOnly
        ? box.w
        : Math.max(box.w, box.h * ratio);
  const h = w / ratio;
  return {
    x: edges.left ? box.x + box.w - w : box.x,
    y: edges.top ? box.y + box.h - h : box.y,
    w,
    h,
  };
}

/** Branche les gestes sur la surface du canvas. */
export function attachGestures(host: GestureHost): void {
  new Gestures(host).attach();
}
