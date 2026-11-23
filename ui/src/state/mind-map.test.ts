import { describe, expect, it } from "vitest";
import type { MindMapItem, MindNodeItem } from "../bridge";
import {
  addChild,
  addRoot,
  addSibling,
  allPaths,
  ancestorsOf,
  descendantsCount,
  firstChildOf,
  moveBranch,
  newNode,
  nodeAt,
  parentOf,
  parseTyped,
  pathKey,
  placeRoot,
  removeAt,
  samePath,
  siblingOf,
  typedOf,
  updateNode,
} from "./mind-map";

/** Le déplacement, qui ne doit pas être refusé. */
function move(...args: Parameters<typeof moveBranch>) {
  const moved = moveBranch(...args);
  if (moved === null) throw new Error("déplacement refusé");
  return moved;
}

const leaf = (title: string, children: MindNodeItem[] = []): MindNodeItem => ({
  ...newNode(title),
  children,
});

/** A (B, C (D)), E */
function sample(): MindMapItem {
  return {
    roots: [leaf("A", [leaf("B"), leaf("C", [leaf("D")])]), leaf("E")],
    places: [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ],
  };
}

const titles = (map: MindMapItem) => allPaths(map).map((p) => nodeAt(map, p)?.title);

describe("l'arbre d'une carte mentale", () => {
  it("désigne un nœud par son chemin", () => {
    const map = sample();
    expect(nodeAt(map, [0, 1, 0])?.title).toBe("D");
    expect(nodeAt(map, [0, 5])).toBeNull();
    expect(nodeAt(map, [])).toBeNull();
    expect(pathKey([1, 0, 2])).toBe("1.0.2");
    expect(samePath([1, 2], [1, 2])).toBe(true);
    expect(samePath([1, 2], [1, 3])).toBe(false);
    expect(samePath([1], [1, 3])).toBe(false);
    expect(descendantsCount(map.roots[0] as MindNodeItem)).toBe(3);
    expect(titles(map)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("ajoute un dernier enfant, un frère juste en dessous, un nœud racine", () => {
    const map = sample();
    const child = addChild(map, [0, 1], newNode("F"));
    expect(child.path).toEqual([0, 1, 1]);
    expect(titles(child.map)).toEqual(["A", "B", "C", "D", "F", "E"]);
    const sibling = addSibling(map, [0, 0], newNode("G"));
    expect(sibling.path).toEqual([0, 1]);
    expect(titles(sibling.map)).toEqual(["A", "B", "G", "C", "D", "E"]);
    const root = addRoot(map, newNode("H"), { x: 9, y: 9 });
    expect(root.path).toEqual([2]);
    expect(root.map.places[2]).toEqual({ x: 9, y: 9 });
    expect(map.roots).toHaveLength(2);
  });

  it("garde la place des nœuds racines quand un enfant s'ajoute", () => {
    expect(addChild(sample(), [1], newNode("X")).map.places).toEqual(sample().places);
  });

  it("retire une branche, et la place d'un nœud racine retiré", () => {
    expect(titles(removeAt(sample(), [0, 1]))).toEqual(["A", "B", "E"]);
    const rootless = removeAt(sample(), [0]);
    expect(titles(rootless)).toEqual(["E"]);
    expect(rootless.places).toEqual([{ x: 3, y: 4 }]);
  });

  it("change le titre, le détail et la couleur sans toucher aux enfants", () => {
    const map = updateNode(sample(), [0, 1], { title: "C2", color: "bleu", detail: ["x"] });
    expect(nodeAt(map, [0, 1])).toMatchObject({ title: "C2", color: "bleu", detail: ["x"] });
    expect(nodeAt(map, [0, 1, 0])?.title).toBe("D");
    expect(placeRoot(sample(), 1, { x: 7, y: 8 }).places[1]).toEqual({ x: 7, y: 8 });
  });

  it("déplace une branche comme enfant ou frère", () => {
    const map = sample();
    const asChild = move(map, [1], { kind: "child", target: [0, 0] });
    expect(titles(asChild.map)).toEqual(["A", "B", "E", "C", "D"]);
    expect(asChild.path).toEqual([0, 0, 0]);
    expect(asChild.map.places).toEqual([{ x: 1, y: 2 }]);
    const before = move(map, [1], { kind: "before", target: [0, 0] });
    expect(titles(before.map)).toEqual(["A", "E", "B", "C", "D"]);
    expect(before.path).toEqual([0, 0]);
    const after = move(map, [0, 0], { kind: "after", target: [0, 1] });
    expect(titles(after.map)).toEqual(["A", "C", "D", "B", "E"]);
    expect(after.path).toEqual([0, 1]);
    const afterEarlier = move(map, [0, 1], { kind: "after", target: [0, 0] });
    expect(titles(afterEarlier.map)).toEqual(["A", "B", "C", "D", "E"]);
    const beforeLater = move(map, [0, 0], { kind: "before", target: [0, 1] });
    expect(titles(beforeLater.map)).toEqual(["A", "B", "C", "D", "E"]);
    const firstOfAll = move(map, [0, 1], { kind: "before", target: [0, 0] });
    expect(titles(firstOfAll.map)).toEqual(["A", "C", "D", "B", "E"]);
  });

  it("refuse de déposer une branche dans la sienne", () => {
    const map = sample();
    expect(moveBranch(map, [0], { kind: "child", target: [0, 1, 0] })).toBeNull();
    expect(moveBranch(map, [0, 1], { kind: "after", target: [0, 1] })).toBeNull();
    expect(moveBranch(map, [9], { kind: "child", target: [0] })).toBeNull();
  });

  it("dépose sur le fond : un nœud racine déplacé, ou un nœud devenu racine", () => {
    const map = sample();
    const moved = move(map, [1], { kind: "root", place: { x: 50, y: 60 } });
    expect(moved.map.places[1]).toEqual({ x: 50, y: 60 });
    expect(moved.path).toEqual([1]);
    const promoted = move(map, [0, 1], { kind: "root", place: { x: 5, y: 6 } });
    expect(titles(promoted.map)).toEqual(["A", "B", "E", "C", "D"]);
    expect(promoted.path).toEqual([2]);
    expect(promoted.map.places[2]).toEqual({ x: 5, y: 6 });
    expect(nodeAt(promoted.map, [2, 0])?.title).toBe("D");
  });

  it("se déplace au clavier", () => {
    const map = sample();
    expect(parentOf([0, 1, 0])).toEqual([0, 1]);
    expect(parentOf([0])).toBeNull();
    expect(firstChildOf(map, [0])).toEqual([0, 0]);
    expect(firstChildOf(map, [1])).toBeNull();
    expect(siblingOf(map, [0], 1)).toEqual([1]);
    expect(siblingOf(map, [0], -1)).toBeNull();
    expect(siblingOf(map, [1], 1)).toBeNull();
    expect(siblingOf(map, [0, 0], 1)).toEqual([0, 1]);
    expect(siblingOf(map, [0, 1], 1)).toBeNull();
    expect(ancestorsOf([0, 1, 0])).toEqual([[0], [0, 1]]);
  });

  it("lit une saisie : la première ligne est le titre, les suivantes le détail", () => {
    expect(parseTyped("  Titre \nun\n\ndeux")).toEqual({
      title: "Titre",
      detail: ["un", "", "deux"],
    });
    expect(parseTyped("Seul")).toEqual({ title: "Seul", detail: [] });
    expect(typedOf({ ...newNode("T"), detail: ["a", "b"] })).toBe("T\na\nb");
  });
});
