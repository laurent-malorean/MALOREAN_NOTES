// Carte mentale (fiche 0050) : l'arbre des nœuds et ses changements, des fonctions pures. L'écran
// enregistre l'arbre entier après chaque changement ; Rust seul connaît le format du fichier.
import type { MindMapItem, MindNodeItem, PlaceItem } from "../bridge";

/** Le chemin d'un nœud : ses rangs depuis 0 (`[1, 0, 2]` s'écrit `1.0.2`). */
export type NodePath = readonly number[];

/** Les 10 couleurs de la palette, dans l'ordre des menus. */
export const PALETTE = [
  "rouge",
  "orange",
  "jaune",
  "vert",
  "turquoise",
  "bleu",
  "violet",
  "rose",
  "marron",
  "ardoise",
] as const;

/** L'écart vertical par défaut entre deux nœuds racines. */
const ROOT_ROW = 160;

/** Le rang d'un nœud chez son parent : le dernier du chemin. */
function lastRank(path: NodePath): number {
  return path[path.length - 1] ?? 0;
}

export function pathKey(path: NodePath): string {
  return path.join(".");
}

export function samePath(a: NodePath, b: NodePath): boolean {
  return a.length === b.length && a.every((rank, at) => rank === b[at]);
}

/** Le nœud désigné, s'il existe. */
export function nodeAt(map: MindMapItem, path: NodePath): MindNodeItem | null {
  let nodes: readonly MindNodeItem[] = map.roots;
  let found: MindNodeItem | null = null;
  for (const rank of path) {
    found = nodes[rank] ?? null;
    if (found === null) return null;
    nodes = found.children;
  }
  return found;
}

/** Combien de descendants un nœud a. */
export function descendantsCount(node: MindNodeItem): number {
  return node.children.reduce((sum, child) => sum + 1 + descendantsCount(child), 0);
}

/** Le chemin de chaque nœud de la carte, dans l'ordre du fichier. */
export function allPaths(map: MindMapItem): NodePath[] {
  const paths: NodePath[] = [];
  const visit = (nodes: readonly MindNodeItem[], above: NodePath) =>
    nodes.forEach((node, rank) => {
      const path = [...above, rank];
      paths.push(path);
      visit(node.children, path);
    });
  visit(map.roots, []);
  return paths;
}

export function newNode(title: string, detail: string[] = []): MindNodeItem {
  return { title, color: null, detail, children: [] };
}

/** La place par défaut du nœud racine de rang `rank`. */
export function defaultPlace(rank: number): PlaceItem {
  return { x: 0, y: rank * ROOT_ROW };
}

/**
 * Une copie de l'arbre dont les enfants de `above` passent par `change`. La place des nœuds
 * racines ne change pas : un changement des nœuds racines eux-mêmes règle les places lui-même.
 */
function withSiblings(
  map: MindMapItem,
  above: NodePath,
  change: (siblings: MindNodeItem[]) => MindNodeItem[],
): MindMapItem {
  const rebuild = (nodes: readonly MindNodeItem[], depth: number): MindNodeItem[] => {
    if (depth === above.length) return change([...nodes]);
    return nodes.map((node, rank) =>
      rank === above[depth] ? { ...node, children: rebuild(node.children, depth + 1) } : node,
    );
  };
  return { roots: rebuild(map.roots, 0), places: map.places };
}

/** Le nœud ajouté comme dernier enfant de `parent`. */
export function addChild(
  map: MindMapItem,
  parent: NodePath,
  node: MindNodeItem,
): { map: MindMapItem; path: NodePath } {
  const added = withSiblings(map, parent, (children) => [...children, node]);
  const rank = (nodeAt(added, parent)?.children.length ?? 1) - 1;
  return { map: added, path: [...parent, rank] };
}

/**
 * Le nœud ajouté juste sous `path` (même parent). Entre nœuds racines, `place` est celle du nœud
 * ajouté (la place par défaut de son rang sinon).
 */
export function addSibling(
  map: MindMapItem,
  path: NodePath,
  node: MindNodeItem,
  place?: PlaceItem,
): { map: MindMapItem; path: NodePath } {
  return insertAt(map, path.slice(0, -1), lastRank(path) + 1, node, place);
}

function insertAt(
  map: MindMapItem,
  above: NodePath,
  rank: number,
  node: MindNodeItem,
  place: PlaceItem | undefined,
): { map: MindMapItem; path: NodePath } {
  const added = withSiblings(map, above, (siblings) => [
    ...siblings.slice(0, rank),
    node,
    ...siblings.slice(rank),
  ]);
  const places =
    above.length > 0
      ? added.places
      : [...map.places.slice(0, rank), place ?? defaultPlace(rank), ...map.places.slice(rank)];
  return { map: { ...added, places }, path: [...above, rank] };
}

/** Un nœud racine ajouté à la fin, posé à `place`. */
export function addRoot(
  map: MindMapItem,
  node: MindNodeItem,
  place: PlaceItem,
): { map: MindMapItem; path: NodePath } {
  return {
    map: { roots: [...map.roots, node], places: [...map.places, place] },
    path: [map.roots.length],
  };
}

/** La carte sans la branche de `path`. */
export function removeAt(map: MindMapItem, path: NodePath): MindMapItem {
  const rank = lastRank(path);
  const removed = withSiblings(map, path.slice(0, -1), (siblings) =>
    siblings.filter((_, at) => at !== rank),
  );
  if (path.length > 1) return removed;
  return { ...removed, places: map.places.filter((_, at) => at !== rank) };
}

/** Le nœud `path` modifié par `patch` ; ses enfants ne changent pas. */
export function updateNode(
  map: MindMapItem,
  path: NodePath,
  patch: Partial<Pick<MindNodeItem, "title" | "detail" | "color">>,
): MindMapItem {
  const rank = lastRank(path);
  return withSiblings(map, path.slice(0, -1), (siblings) =>
    siblings.map((node, at) => (at === rank ? { ...node, ...patch } : node)),
  );
}

/** La place du nœud racine `rank` changée. */
export function placeRoot(map: MindMapItem, rank: number, place: PlaceItem): MindMapItem {
  return { ...map, places: map.places.map((was, at) => (at === rank ? place : was)) };
}

/** Où un nœud glissé est déposé. */
export type Drop =
  | { readonly kind: "child"; readonly target: NodePath }
  | { readonly kind: "before" | "after"; readonly target: NodePath }
  | { readonly kind: "root"; readonly place: PlaceItem };

/** Le chemin `inner` est dans la branche de `outer` (ou est `outer`). */
export function inBranch(outer: NodePath, inner: NodePath): boolean {
  return inner.length >= outer.length && outer.every((rank, at) => rank === inner[at]);
}

/**
 * La carte une fois la branche `from` déposée en `drop` ; `null` si c'est refusé (dans sa propre
 * branche, ou sur elle-même) : rien ne change. Un nœud racine déposé sur le fond est seulement
 * déplacé. Rend aussi le nouveau chemin du nœud déplacé.
 */
export function moveBranch(
  map: MindMapItem,
  from: NodePath,
  drop: Drop,
): { map: MindMapItem; path: NodePath } | null {
  const moving = nodeAt(map, from);
  if (moving === null) return null;
  if (drop.kind === "root") {
    if (from.length === 1) return { map: placeRoot(map, lastRank(from), drop.place), path: from };
    return addRoot(removeAt(map, from), moving, drop.place);
  }
  if (inBranch(from, drop.target)) return null;
  // Le nœud retiré, les chemins d'après le sien dans la même fratrie reculent d'un rang.
  const target = shiftedAfterRemoval(from, drop.target);
  const without = removeAt(map, from);
  if (drop.kind === "child") return addChild(without, target, moving);
  // Un nœud racine déplacé entre nœuds racines garde sa place.
  const own = from.length === 1 ? map.places[lastRank(from)] : undefined;
  const rank = lastRank(target) + (drop.kind === "after" ? 1 : 0);
  return insertAt(without, target.slice(0, -1), rank, moving, own);
}

function shiftedAfterRemoval(removed: NodePath, path: NodePath): NodePath {
  const depth = removed.length - 1;
  const sameParent = removed.slice(0, depth).every((rank, at) => rank === path[at]);
  if (!sameParent || path.length <= depth || (path[depth] ?? 0) <= (removed[depth] ?? 0))
    return path;
  return path.map((rank, at) => (at === depth ? rank - 1 : rank));
}

/** Les mouvements de la sélection au clavier. */
export function parentOf(path: NodePath): NodePath | null {
  return path.length > 1 ? path.slice(0, -1) : null;
}

export function firstChildOf(map: MindMapItem, path: NodePath): NodePath | null {
  return (nodeAt(map, path)?.children.length ?? 0) > 0 ? [...path, 0] : null;
}

/** Le frère du dessus (`-1`) ou du dessous (`1`), dans l'ordre du fichier. */
export function siblingOf(map: MindMapItem, path: NodePath, step: -1 | 1): NodePath | null {
  const above = path.slice(0, -1);
  const count = above.length === 0 ? map.roots.length : (nodeAt(map, above)?.children.length ?? 0);
  const rank = lastRank(path) + step;
  return rank < 0 || rank >= count ? null : [...above, rank];
}

/** Les chemins des ancêtres de `path` (sans lui), pour les déplier. */
export function ancestorsOf(path: NodePath): NodePath[] {
  return path.slice(0, -1).map((_, at) => path.slice(0, at + 1));
}

/** Le texte d'une saisie : sa première ligne est le titre, les suivantes le détail. */
export function parseTyped(text: string): { title: string; detail: string[] } {
  const [first, ...rest] = text.split("\n");
  return { title: (first ?? "").trim(), detail: rest };
}

/** Le texte d'une saisie pour un nœud : son titre puis son détail. */
export function typedOf(node: MindNodeItem): string {
  return [node.title, ...node.detail].join("\n");
}

/** Les branches pliées, par chemin. */
export type Folded = ReadonlySet<string>;
