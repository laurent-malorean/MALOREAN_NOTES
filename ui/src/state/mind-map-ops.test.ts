import { describe, expect, it } from "vitest";
import type { MindMapItem, MindNodeItem } from "../bridge";
import { newNode, nodeAt } from "./mind-map";
import { type Op, redo, redoAll, typedOp } from "./mind-map-ops";

const leaf = (title: string, children: MindNodeItem[] = []) => ({ ...newNode(title), children });
const base = (): MindMapItem => ({
  roots: [leaf("A", [leaf("B"), leaf("C")]), leaf("D")],
  places: [
    { x: 0, y: 0 },
    { x: 0, y: 160 },
  ],
});
const titles = (map: MindMapItem | null) => map?.roots.map((r) => r.title);

describe("refaire un changement sur une autre version", () => {
  it("titre, détail, couleur : sur le même nœud s'il existe, sinon abandonné", () => {
    const op: Op = { kind: "update", path: [0, 1], patch: { color: "bleu" } };
    expect(nodeAt(redo(base(), op) as MindMapItem, [0, 1])?.color).toBe("bleu");
    expect(redo({ roots: [leaf("A")], places: [{ x: 0, y: 0 }] }, op)).toBeNull();
  });

  it("ajout : sous le même parent à son rang, sinon en nœud racine", () => {
    const node = newNode("N");
    const under: Op = { kind: "add", parent: [0], index: 1, node, place: { x: 5, y: 5 } };
    expect(nodeAt(redo(base(), under) as MindMapItem, [0, 1])?.title).toBe("N");
    const tooFar: Op = { ...under, index: 9 };
    expect(nodeAt(redo(base(), tooFar) as MindMapItem, [0, 2])?.title).toBe("N");
    const lost = redo({ roots: [leaf("A")], places: [{ x: 0, y: 0 }] }, { ...under, parent: [4] });
    expect(titles(lost)).toEqual(["A", "N"]);
    expect(lost?.places[1]).toEqual({ x: 0, y: 160 });
    const root = redo(base(), { ...under, parent: [] }) as MindMapItem;
    expect(titles(root)).toEqual(["A", "D", "N"]);
    expect(root.places[2]).toEqual({ x: 5, y: 5 });
  });

  it("suppression : refaite si le nœud existe encore, sans effet sinon", () => {
    const op: Op = { kind: "remove", path: [0, 0] };
    expect(nodeAt(redo(base(), op) as MindMapItem, [0, 0])?.title).toBe("C");
    const same = { roots: [leaf("A")], places: [{ x: 0, y: 0 }] };
    expect(redo(same, op)).toEqual(same);
  });

  it("déplacement : refait si le nœud et sa cible existent, sinon abandonné", () => {
    const op: Op = { kind: "move", from: [1], drop: { kind: "child", target: [0, 0] } };
    expect(nodeAt(redo(base(), op) as MindMapItem, [0, 0, 0])?.title).toBe("D");
    expect(redo({ roots: [leaf("A")], places: [{ x: 0, y: 0 }] }, op)).toBeNull();
    const own: Op = { kind: "move", from: [0], drop: { kind: "child", target: [0, 0] } };
    expect(redo(base(), own)).toBeNull();
    const root: Op = { kind: "move", from: [1], drop: { kind: "root", place: { x: 9, y: 9 } } };
    expect(redo(base(), root)?.places[1]).toEqual({ x: 9, y: 9 });
  });

  it("annuler ou rétablir ne se refait pas", () => {
    expect(redo(base(), { kind: "replace" })).toBeNull();
  });

  it("plusieurs changements de suite, abandonnés dès que l'un l'est", () => {
    const ok: Op[] = [
      { kind: "update", path: [1], patch: { title: "D2" } },
      { kind: "remove", path: [0, 0] },
    ];
    expect(titles(redoAll(base(), ok))).toEqual(["A", "D2"]);
    expect(redoAll(base(), [{ kind: "replace" }, ...ok])).toBeNull();
    expect(redoAll(base(), [])).toEqual(base());
  });

  it("une saisie validée est un texte changé ou un nœud ajouté", () => {
    const typed = { title: "T", detail: ["d"] };
    expect(typedOp(base(), [0, 1], false, typed)).toEqual({
      kind: "update",
      path: [0, 1],
      patch: typed,
    });
    const added = typedOp(base(), [1], true, typed);
    expect(added).toMatchObject({ kind: "add", parent: [], index: 1, place: { x: 0, y: 160 } });
    expect(typedOp(base(), [0, 2], true, typed)).toMatchObject({ parent: [0], index: 2 });
  });
});
