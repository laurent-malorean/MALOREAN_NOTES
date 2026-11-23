// Carte mentale (fiche 0050, spécification § 8) : un changement de la carte, dit comme une
// opération qu'on peut refaire sur une version plus récente du fichier quand il a changé ailleurs.
import type { MindMapItem, MindNodeItem, PlaceItem } from "../bridge";
import {
  defaultPlace,
  type Drop,
  insertAt,
  moveBranch,
  newNode,
  type NodePath,
  nodeAt,
  removeAt,
  updateNode,
} from "./mind-map";

export type Op =
  /** Titre, détail ou couleur d'un nœud. */
  | {
      readonly kind: "update";
      readonly path: NodePath;
      readonly patch: Partial<Pick<MindNodeItem, "title" | "detail" | "color">>;
    }
  /** Un nœud ajouté au rang `index` sous `parent` (nœud racine si `parent` est vide, posé à `place`). */
  | {
      readonly kind: "add";
      readonly parent: NodePath;
      readonly index: number;
      readonly node: MindNodeItem;
      readonly place: PlaceItem;
    }
  | { readonly kind: "remove"; readonly path: NodePath }
  | { readonly kind: "move"; readonly from: NodePath; readonly drop: Drop }
  /** Annuler ou rétablir : la carte entière, qui ne se refait pas sur une autre version. */
  | { readonly kind: "replace" };

function redoMove(map: MindMapItem, op: Extract<Op, { kind: "move" }>): MindMapItem | null {
  const missingTarget = op.drop.kind !== "root" && nodeAt(map, op.drop.target) === null;
  return missingTarget ? null : (moveBranch(map, op.from, op.drop)?.map ?? null);
}

/** Le changement refait sur `map` ; `null` s'il est abandonné (son nœud ou sa cible n'existe plus). */
export function redo(map: MindMapItem, op: Op): MindMapItem | null {
  switch (op.kind) {
    case "update":
      return nodeAt(map, op.path) === null ? null : updateNode(map, op.path, op.patch);
    case "add":
      return redoAdd(map, op);
    case "remove":
      return nodeAt(map, op.path) === null ? map : removeAt(map, op.path);
    case "move":
      return redoMove(map, op);
    case "replace":
      return null;
  }
}

/** Sous le même parent s'il existe encore, sinon en nœud racine. */
function redoAdd(map: MindMapItem, op: Extract<Op, { kind: "add" }>): MindMapItem {
  const parentExists = op.parent.length > 0 && nodeAt(map, op.parent) !== null;
  if (!parentExists) {
    const rank = map.roots.length;
    const place = op.parent.length === 0 ? op.place : defaultPlace(rank);
    return insertAt(map, [], rank, op.node, place).map;
  }
  const count = nodeAt(map, op.parent)?.children.length ?? 0;
  return insertAt(map, op.parent, Math.min(op.index, count), op.node, undefined).map;
}

/** Les changements refaits l'un après l'autre sur `map` ; `null` dès que l'un est abandonné. */
export function redoAll(map: MindMapItem, ops: readonly Op[]): MindMapItem | null {
  let current: MindMapItem | null = map;
  for (const op of ops) {
    current = current === null ? null : redo(current, op);
  }
  return current;
}

/** Le changement qu'est une saisie validée sur le nœud `path` de `next` : un nœud ajouté, ou son texte changé. */
export function typedOp(
  next: MindMapItem,
  path: NodePath,
  isNew: boolean,
  typed: { title: string; detail: string[] },
): Op {
  if (!isNew) return { kind: "update", path, patch: typed };
  return {
    kind: "add",
    parent: path.slice(0, -1),
    index: path[path.length - 1] ?? 0,
    node: { ...newNode(typed.title), detail: typed.detail },
    place: next.places[path[0] ?? 0] ?? { x: 0, y: 0 },
  };
}
