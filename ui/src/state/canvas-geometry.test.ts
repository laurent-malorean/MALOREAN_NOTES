import { describe, expect, it } from "vitest";
import { anchor, curve, headAngle, nearestSide, outward, pathOf, pointAt } from "./canvas-geometry";

const box = { x: 100, y: 50, w: 200, h: 100 };

describe("géométrie des flèches", () => {
  it("l'accroche est au milieu du côté", () => {
    expect(anchor(box, "top")).toEqual({ x: 200, y: 50 });
    expect(anchor(box, "bottom")).toEqual({ x: 200, y: 150 });
    expect(anchor(box, "left")).toEqual({ x: 100, y: 100 });
    expect(anchor(box, "right")).toEqual({ x: 300, y: 100 });
  });

  it("la sortie va vers l'extérieur du côté", () => {
    expect(outward("top")).toEqual({ x: 0, y: -1 });
    expect(outward("right")).toEqual({ x: 1, y: 0 });
  });

  it("deux cartes face à face donnent une ligne droite", () => {
    const c = curve({ x: 0, y: 0 }, "right", { x: 300, y: 0 }, "left");
    expect(pointAt(c, 0.5)).toEqual({ x: 150, y: 0 });
    expect(c.c1).toEqual({ x: 150, y: 0 });
    expect(pathOf(c)).toBe("M 0 0 C 150 0, 150 0, 300 0");
  });

  it("la courbe s'éloigne d'au moins 40 points de chaque côté", () => {
    const c = curve({ x: 0, y: 0 }, "bottom", { x: 10, y: 20 }, "top");
    expect(c.c1).toEqual({ x: 0, y: 40 });
    expect(c.c2).toEqual({ x: 10, y: -20 });
  });

  it("le point d'une courbe va du départ à l'arrivée", () => {
    const c = curve({ x: 0, y: 0 }, "right", { x: 100, y: 100 }, "top");
    expect(pointAt(c, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAt(c, 1)).toEqual({ x: 100, y: 100 });
  });

  it("la pointe regarde vers l'extérieur de la courbe", () => {
    const c = curve({ x: 0, y: 0 }, "right", { x: 300, y: 0 }, "left");
    expect(headAngle(c, "to")).toBe(0);
    expect(Math.abs(headAngle(c, "from"))).toBe(180);
  });

  it("une flèche lâchée sur une carte s'accroche au côté le plus proche", () => {
    expect(nearestSide(box, { x: 110, y: 100 })).toBe("left");
    expect(nearestSide(box, { x: 290, y: 100 })).toBe("right");
    expect(nearestSide(box, { x: 200, y: 55 })).toBe("top");
    expect(nearestSide(box, { x: 200, y: 145 })).toBe("bottom");
  });
});
