// Carte mentale (fiche 0050, spécification § 6.3) : où se pose chaque nœud. Fonction pure : la
// taille d'un nœud vient de l'écran, qui sait mesurer son texte.
import type { MindMapItem, MindNodeItem } from "../bridge";
import { type Folded, type NodePath, pathKey } from "./mind-map";

/** L'écart vertical entre deux frères, et celui quand l'un des deux a un détail. */
const GAP = 12;
const GAP_WITH_DETAIL = 20;
/** L'écart horizontal entre deux niveaux : une part du plus grand écart vertical, entre ces bornes. */
const COLUMN_GAP_SHARE = 0.3;
const COLUMN_GAP_MIN = 48;
const COLUMN_GAP_MAX = 200;

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * La taille d'un nœud de ce niveau (1 pour les nœuds racines) ; `width`, s'il est donné, est la
 * largeur imposée par le niveau.
 */
export type Measure = (node: MindNodeItem, level: number, width?: number) => Size;

export interface Box {
  readonly path: NodePath;
  readonly node: MindNodeItem;
  readonly level: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Il a des enfants, montrés ou non. */
  readonly hasChildren: boolean;
  /** Ses enfants sont cachés. */
  readonly folded: boolean;
}

export interface Link {
  readonly from: string;
  readonly to: string;
}

export interface Layout {
  readonly boxes: readonly Box[];
  readonly links: readonly Link[];
}

interface Sized {
  readonly path: NodePath;
  readonly node: MindNodeItem;
  readonly level: number;
  readonly size: Size;
  readonly children: Sized[];
  /** La hauteur de sa branche. */
  branch: number;
  /** Le centre vertical, relatif au haut du bloc de la branche. */
  centre: number;
}

/** Les nœuds d'un arbre, mesurés à la largeur de leur niveau. */
function measured(root: MindNodeItem, rank: number, folded: Folded, measure: Measure): Sized {
  const natural = new Map<number, number>();
  const collect = (node: MindNodeItem, level: number, path: NodePath) => {
    natural.set(level, Math.max(natural.get(level) ?? 0, measure(node, level).width));
    if (!folded.has(pathKey(path)))
      node.children.forEach((child, at) => collect(child, level + 1, [...path, at]));
  };
  collect(root, 1, [rank]);
  const build = (node: MindNodeItem, level: number, path: NodePath): Sized => ({
    path,
    node,
    level,
    size: measure(node, level, natural.get(level)),
    children: folded.has(pathKey(path))
      ? []
      : node.children.map((child, at) => build(child, level + 1, [...path, at])),
    branch: 0,
    centre: 0,
  });
  return build(root, 1, [rank]);
}

function gapBetween(a: Sized, b: Sized): number {
  return a.node.detail.length > 0 || b.node.detail.length > 0 ? GAP_WITH_DETAIL : GAP;
}

/** La hauteur des branches de ces frères et des écarts entre elles. */
function childrenHeight(kids: readonly Sized[]): number {
  let total = 0;
  let previous: Sized | undefined;
  for (const kid of kids) {
    total += kid.branch + (previous === undefined ? 0 : gapBetween(previous, kid));
    previous = kid;
  }
  return total;
}

/** Hauteur de chaque branche, et centre de chaque nœud dans le bloc de sa branche. */
function stack(node: Sized): void {
  node.children.forEach(stack);
  node.branch = Math.max(node.size.height, childrenHeight(node.children));
  node.centre = node.branch / 2;
}

/** Les boîtes d'un arbre dont le nœud racine a son coin haut gauche en `x`, `y`. */
function place(root: Sized, x: number, y: number): Box[] {
  stack(root);
  const widths = new Map<number, number>();
  const levels = new Map<number, Sized[]>();
  const visit = (node: Sized) => {
    widths.set(node.level, node.size.width);
    levels.set(node.level, [...(levels.get(node.level) ?? []), node]);
    node.children.forEach(visit);
  };
  visit(root);
  // Les centres verticaux d'abord, en points absolus.
  const centres = new Map<Sized, number>();
  const layVertical = (node: Sized, centre: number) => {
    centres.set(node, centre);
    const kids = node.children;
    if (kids.length === 0) return;
    let top = centre - childrenHeight(kids) / 2;
    let previous: Sized | undefined;
    for (const kid of kids) {
      if (previous !== undefined) top += gapBetween(previous, kid);
      layVertical(kid, top + kid.branch / 2);
      top += kid.branch;
      previous = kid;
    }
  };
  layVertical(root, y + root.size.height / 2);
  // Les bords gauches : un niveau, une colonne.
  const lefts = new Map<number, number>([[1, x]]);
  for (let level = 1; widths.has(level + 1); level += 1) {
    let widest = 0;
    for (const node of levels.get(level) ?? [])
      for (const kid of node.children)
        widest = Math.max(widest, Math.abs((centres.get(kid) ?? 0) - (centres.get(node) ?? 0)));
    const gap = Math.min(COLUMN_GAP_MAX, Math.max(COLUMN_GAP_MIN, widest * COLUMN_GAP_SHARE));
    lefts.set(level + 1, (lefts.get(level) ?? 0) + (widths.get(level) ?? 0) + gap);
  }
  const boxes: Box[] = [];
  const collect = (node: Sized) => {
    boxes.push({
      path: node.path,
      node: node.node,
      level: node.level,
      x: lefts.get(node.level) ?? x,
      y: (centres.get(node) ?? 0) - node.size.height / 2,
      width: node.size.width,
      height: node.size.height,
      hasChildren: node.node.children.length > 0,
      folded: node.node.children.length > 0 && node.children.length === 0,
    });
    node.children.forEach(collect);
  };
  collect(root);
  return boxes;
}

/** La disposition de toute la carte : les boîtes des nœuds montrés et les liens entre eux. */
export function layoutMap(map: MindMapItem, folded: Folded, measure: Measure): Layout {
  const boxes: Box[] = [];
  map.roots.forEach((root, rank) => {
    const where = map.places[rank] ?? { x: 0, y: rank * 160 };
    boxes.push(...place(measured(root, rank, folded, measure), where.x, where.y));
  });
  const links: Link[] = boxes
    .filter((box) => box.path.length > 1)
    .map((box) => ({ from: pathKey(box.path.slice(0, -1)), to: pathKey(box.path) }));
  return { boxes, links };
}

/** Le rectangle qui contient toutes les boîtes ; `null` sans nœud. */
export function bounds(
  boxes: readonly Box[],
): { x: number; y: number; w: number; h: number } | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left, y: top, w: right - left, h: bottom - top };
}
