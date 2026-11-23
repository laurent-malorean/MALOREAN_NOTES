// Carte mentale (fiche 0050, spécification § 7.1) : les touches qui agissent sur le nœud choisi.
import type { MindMapItem } from "../bridge";
import { firstChildOf, type NodePath, parentOf, siblingOf } from "../state/mind-map";
import type { MenuHost } from "./mind-map-menu";

/** Ce que les touches font faire à la carte. */
export interface KeyHost extends MenuHost {
  map(): MindMapItem;
  choose(path: NodePath | null): void;
  /** Déplie la branche du nœud. */
  unfold(path: NodePath): void;
}

type KeyAction = (host: KeyHost, path: NodePath) => void;

const goTo = (host: KeyHost, path: NodePath | null) => {
  if (path !== null) host.choose(path);
};

const ACTIONS = new Map<string, KeyAction>([
  ["Tab", (host, path) => host.add("child", path)],
  ["Enter", (host, path) => host.add("sibling", path)],
  ["F2", (host, path) => host.edit(path)],
  ["Delete", (host, path) => host.remove(path)],
  ["Backspace", (host, path) => host.remove(path)],
  ["Escape", (host) => host.choose(null)],
  ["ArrowLeft", (host, path) => goTo(host, parentOf(path))],
  [
    "ArrowRight",
    (host, path) => {
      host.unfold(path);
      goTo(host, firstChildOf(host.map(), path));
    },
  ],
  ["ArrowUp", (host, path) => goTo(host, siblingOf(host.map(), path, -1))],
  ["ArrowDown", (host, path) => goTo(host, siblingOf(host.map(), path, 1))],
]);

/** La touche agit sur le nœud `path` ; dit si elle est prise en compte. */
export function nodeKey(host: KeyHost, key: string, path: NodePath): boolean {
  const action = ACTIONS.get(key);
  if (action === undefined) return false;
  action(host, path);
  return true;
}
