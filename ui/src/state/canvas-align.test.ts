import { describe, expect, it } from "vitest";
import type { CanvasItem } from "../bridge";
import { aligned, distributed } from "./canvas-align";
import { newTextCard } from "./canvas-model";

const cardAt = (id: string, x: number, y: number, width: number, height: number) => ({
  ...newTextCard(x, y),
  id,
  width,
  height,
});
const canvas: CanvasItem = {
  cards: [
    cardAt("a", 0, 0, 100, 50),
    cardAt("b", 150, 30, 50, 100),
    cardAt("c", 400, 10, 100, 20),
    cardAt("z", 9, 9, 9, 9),
  ],
  arrows: [],
  extra: [],
};
const positions = (c: CanvasItem) => c.cards.map((card) => [card.x, card.y]);

describe("aligner", () => {
  const ids = ["a", "b", "c"];

  it("à gauche, à droite, au centre, en haut, au milieu, en bas, sur la zone des cartes", () => {
    expect(positions(aligned(canvas, ids, "left"))).toEqual([
      [0, 0],
      [0, 30],
      [0, 10],
      [9, 9],
    ]);
    expect(positions(aligned(canvas, ids, "right"))).toEqual([
      [400, 0],
      [450, 30],
      [400, 10],
      [9, 9],
    ]);
    expect(positions(aligned(canvas, ids, "center"))).toEqual([
      [200, 0],
      [225, 30],
      [200, 10],
      [9, 9],
    ]);
    expect(positions(aligned(canvas, ids, "top"))).toEqual([
      [0, 0],
      [150, 0],
      [400, 0],
      [9, 9],
    ]);
    expect(positions(aligned(canvas, ids, "bottom"))).toEqual([
      [0, 80],
      [150, 30],
      [400, 110],
      [9, 9],
    ]);
    expect(positions(aligned(canvas, ids, "middle"))).toEqual([
      [0, 40],
      [150, 15],
      [400, 55],
      [9, 9],
    ]);
  });

  it("il faut au moins deux cartes", () => {
    expect(aligned(canvas, ["a"], "left")).toBe(canvas);
    expect(aligned(canvas, ["a", "absente"], "left")).toBe(canvas);
  });

  it("les positions restent entières", () => {
    const odd: CanvasItem = {
      ...canvas,
      cards: [cardAt("a", 0, 0, 5, 5), cardAt("b", 0, 0, 2, 2)],
    };
    expect(positions(aligned(odd, ["a", "b"], "center"))).toEqual([
      [0, 0],
      [2, 0],
    ]);
  });
});

describe("répartir", () => {
  it("l'espace horizontal devient le même entre les cartes, les deux extrêmes ne bougent pas", () => {
    const out = distributed(canvas, ["c", "a", "b"], "horizontal");
    expect(positions(out)).toEqual([
      [0, 0],
      [225, 30],
      [400, 10],
      [9, 9],
    ]);
  });

  it("l'espace vertical aussi", () => {
    const column: CanvasItem = {
      ...canvas,
      cards: [cardAt("a", 0, 0, 10, 10), cardAt("b", 0, 15, 10, 10), cardAt("c", 0, 100, 10, 20)],
    };
    expect(positions(distributed(column, ["a", "b", "c"], "vertical"))).toEqual([
      [0, 0],
      [0, 50],
      [0, 100],
    ]);
  });

  it("il faut au moins trois cartes", () => {
    expect(distributed(canvas, ["a", "b"], "horizontal")).toBe(canvas);
  });
});
