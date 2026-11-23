// Carte mentale (fiche 0050, spécification § 7.2) : glisser un nœud et sa branche. Le geste
// commence après 4 points de mouvement ; avant, c'est un clic.
import { type Drop, inBranch, type NodePath, pathKey } from "../state/mind-map";
import type { Box } from "../state/mind-map-layout";
import type { Point } from "../state/mind-map-viewport";

/** Le mouvement, en pixels, avant lequel un appui reste un clic. */
const THRESHOLD = 4;

export interface DragOptions {
  readonly world: HTMLElement;
  readonly boxes: readonly Box[];
  readonly from: Box;
  /** Le point de la carte sous le pointeur. */
  readonly point: (event: PointerEvent) => Point;
  /** Un appui relâché sans avoir glissé. */
  readonly onClick: () => void;
  /** Le dépôt, quand il est permis. */
  readonly onDrop: (drop: Drop) => void;
  /** Ce qui est sous le pointeur : un nœud et la façon de s'y déposer, `refused` dans sa propre branche, rien sur le fond. */
  readonly dropAt: (
    at: Point,
    dragged: NodePath,
  ) => { kind: "child" | "before" | "after"; target: Box } | "refused" | null;
}

const MARKS = ["drop-child", "drop-before", "drop-after"] as const;

function ghostOf(options: DragOptions): HTMLElement {
  const ghost = document.createElement("div");
  ghost.className = "mind-map-ghost";
  for (const element of options.world.querySelectorAll<HTMLElement>(".mind-map-node[data-path]")) {
    const path = (element.dataset.path ?? "").split(".").map(Number);
    if (!inBranch(options.from.path, path)) continue;
    const copy = element.cloneNode(true) as HTMLElement;
    copy.classList.remove("selected");
    copy.style.left = `${Number.parseFloat(element.style.left) - options.from.x}px`;
    copy.style.top = `${Number.parseFloat(element.style.top) - options.from.y}px`;
    ghost.append(copy);
  }
  options.world.append(ghost);
  return ghost;
}

function mark(world: HTMLElement, target: Box | null, kind: string | null): void {
  for (const element of world.querySelectorAll(".mind-map-node"))
    element.classList.remove(...MARKS);
  if (target === null || kind === null) return;
  const element = world.querySelector(`.mind-map-node[data-path="${pathKey(target.path)}"]`);
  element?.classList.add(`drop-${kind}`);
}

export function startDrag(event: PointerEvent, options: DragOptions): void {
  const start = { x: event.clientX, y: event.clientY };
  const grab = options.point(event);
  const offset = { x: grab.x - options.from.x, y: grab.y - options.from.y };
  let ghost: HTMLElement | null = null;

  const move = (e: PointerEvent) => {
    if (ghost === null) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESHOLD) return;
      ghost = ghostOf(options);
    }
    const at = options.point(e);
    ghost.style.left = `${at.x - offset.x}px`;
    ghost.style.top = `${at.y - offset.y}px`;
    const found = options.dropAt(at, options.from.path);
    if (found === null || found === "refused") mark(options.world, null, null);
    else mark(options.world, found.target, found.kind);
  };

  const up = (e: PointerEvent) => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    if (ghost === null) {
      options.onClick();
      return;
    }
    ghost.remove();
    mark(options.world, null, null);
    const at = options.point(e);
    const found = options.dropAt(at, options.from.path);
    if (found === "refused") return;
    if (found === null)
      options.onDrop({ kind: "root", place: { x: at.x - offset.x, y: at.y - offset.y } });
    else options.onDrop({ kind: found.kind, target: found.target.path });
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

/** Faire glisser le fond : déplace la vue ; relâché sans avoir bougé, c'est un clic. */
export function startPan(
  event: PointerEvent,
  pan: { by: (dx: number, dy: number) => void; onClick: () => void },
): void {
  let last = { x: event.clientX, y: event.clientY };
  let moved = false;
  const move = (e: PointerEvent) => {
    moved = true;
    pan.by(e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
  };
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    if (!moved) pan.onClick();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}
