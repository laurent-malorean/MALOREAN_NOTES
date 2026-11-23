import { describe, expect, it } from "vitest";
import type { MindMapItem, MindNodeItem } from "../bridge";
import { newNode } from "./mind-map";
import { type Box, bounds, layoutMap, type Measure } from "./mind-map-layout";

const leaf = (title: string, children: MindNodeItem[] = [], detail: string[] = []) => ({
  ...newNode(title, detail),
  children,
});

/** Largeur : 10 par lettre, 100 au moins ; hauteur 30 ; la largeur imposée l'emporte. */
const measure: Measure = (node, _level, width) => ({
  width: width ?? Math.max(100, node.title.length * 10),
  height: 30,
});

const byTitle = (map: MindMapItem, folded = new Set<string>()) => {
  const layout = layoutMap(map, folded, measure);
  return {
    layout,
    box: (title: string) => layout.boxes.find((b) => b.node.title === title) as Box,
  };
};

describe("la disposition d'une carte mentale", () => {
  it("pose chaque nœud racine à sa place", () => {
    const map = {
      roots: [leaf("A"), leaf("B")],
      places: [
        { x: 10, y: 20 },
        { x: -5, y: 300 },
      ],
    };
    const { box } = byTitle(map);
    expect([box("A").x, box("A").y]).toEqual([10, 20]);
    expect([box("B").x, box("B").y]).toEqual([-5, 300]);
  });

  it("range les enfants à droite, centrés sur leur parent, avec 12 points d'écart", () => {
    const map = { roots: [leaf("A", [leaf("B"), leaf("C")])], places: [{ x: 0, y: 0 }] };
    const { box, layout } = byTitle(map);
    expect(box("B").y).toBe(box("A").y + 15 - 36);
    expect(box("C").y - (box("B").y + 30)).toBe(12);
    const centre = (title: string) => box(title).y + 15;
    expect((centre("B") + centre("C")) / 2).toBe(centre("A"));
    expect(box("B").x).toBeGreaterThanOrEqual(box("A").x + 100 + 48);
    expect(layout.links).toEqual([
      { from: "0", to: "0.0" },
      { from: "0", to: "0.1" },
    ]);
  });

  it("écarte de 20 points deux frères dont l'un a un détail", () => {
    const map = { roots: [leaf("A", [leaf("B", [], ["d"]), leaf("C")])], places: [{ x: 0, y: 0 }] };
    const { box } = byTitle(map);
    expect(box("C").y - (box("B").y + 30)).toBe(20);
  });

  it("donne à un niveau le même bord gauche et la largeur du plus large", () => {
    const map = {
      roots: [leaf("A", [leaf("court"), leaf("un titre bien plus long que les autres")])],
      places: [{ x: 0, y: 0 }],
    };
    const { box } = byTitle(map);
    expect(box("court").x).toBe(box("un titre bien plus long que les autres").x);
    expect(box("court").width).toBe(box("un titre bien plus long que les autres").width);
  });

  it("borne l'écart horizontal entre 48 et 200 points", () => {
    const wide = (count: number) => {
      const kids = Array.from({ length: count }, (_, at) => leaf(`n${at}`));
      return byTitle({ roots: [leaf("A", kids)], places: [{ x: 0, y: 0 }] }).box("n0");
    };
    expect(wide(1).x).toBe(100 + 48);
    expect(wide(60).x).toBe(100 + 200);
    expect(wide(10).x).toBeGreaterThan(100 + 48);
  });

  it("ne montre que le nœud d'une branche pliée", () => {
    const map = { roots: [leaf("A", [leaf("B", [leaf("C")])])], places: [{ x: 0, y: 0 }] };
    const { layout, box } = byTitle(map, new Set(["0.0"]));
    expect(layout.boxes.map((b) => b.node.title)).toEqual(["A", "B"]);
    expect(box("B")).toMatchObject({ hasChildren: true, folded: true });
    expect(box("A")).toMatchObject({ hasChildren: true, folded: false });
    expect(layout.links).toEqual([{ from: "0", to: "0.0" }]);
  });

  it("donne le rectangle de toutes les boîtes", () => {
    expect(bounds([])).toBeNull();
    const map = { roots: [leaf("A", [leaf("B")])], places: [{ x: 10, y: 20 }] };
    const rect = bounds(byTitle(map).layout.boxes) as NonNullable<ReturnType<typeof bounds>>;
    expect(rect).toMatchObject({ x: 10, y: 20 });
    expect(rect.w).toBe(100 + 48 + 100);
    expect(rect.h).toBe(30);
  });
});
