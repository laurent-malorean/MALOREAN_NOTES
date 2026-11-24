import { describe, expect, it } from "vitest";
import { GRID, SNAP_DISTANCE, snapMove, snapResize } from "./canvas-snap";

const none = { grid: false, objects: false };
const grid = { grid: true, objects: false };
const objects = { grid: false, objects: true };
const box = { x: 33, y: 47, w: 100, h: 60 };

describe("accrochage au déplacement", () => {
  it("sans réglage, rien ne bouge", () => {
    expect(snapMove(box, [], none, 1)).toEqual({ dx: 0, dy: 0 });
  });

  it("à la grille, le coin haut gauche tombe sur un point", () => {
    expect(snapMove(box, [], grid, 1)).toEqual({ dx: 40 - 33, dy: 40 - 47 });
    expect(GRID).toBe(20);
  });

  it("aux objets, un bord proche s'aligne sur celui d'une autre carte", () => {
    const other = [{ x: 200, y: 0, w: 50, h: 50 }];
    // le bord droit (133) est à 3 du bord gauche (200 - 70 = trop loin) : on prend le bord gauche de l'autre à 136
    const close = { x: 100, y: 47, w: 98, h: 60 };
    expect(snapMove(close, other, objects, 1).dx).toBe(2);
    expect(snapMove({ ...close, x: 80 }, other, objects, 1).dx).toBe(0);
  });

  it("la distance d'accrochage est en pixels de l'écran : elle grandit quand on dézoome", () => {
    const other = [{ x: 200, y: 0, w: 50, h: 50 }];
    const apart = { x: 100, y: 0, w: 90, h: 50 };
    expect(SNAP_DISTANCE).toBe(8);
    expect(snapMove({ ...apart, x: 95 }, other, objects, 1).dx).toBe(0);
    expect(snapMove({ ...apart, x: 95 }, other, objects, 0.5).dx).toBe(15);
  });

  it("les objets passent avant la grille, la grille sert quand aucun bord n'est proche", () => {
    const other = [{ x: 105, y: 0, w: 10, h: 1000 }];
    const both = { grid: true, objects: true };
    const result = snapMove({ x: 103, y: 47, w: 10, h: 10 }, other, both, 1);
    expect(result.dx).toBe(2);
    expect(result.dy).toBe(40 - 47);
  });
});

describe("accrochage au redimensionnement", () => {
  it("tirer le bord droit et le bas les accroche à la grille", () => {
    const resized = snapResize(
      { x: 40, y: 40, w: 93, h: 47 },
      { left: false, right: true, top: false, bottom: true },
      [],
      grid,
      1,
    );
    expect(resized).toEqual({ x: 40, y: 40, w: 100, h: 40 });
  });

  it("tirer le bord gauche et le haut déplace le coin", () => {
    const resized = snapResize(
      { x: 43, y: 57, w: 100, h: 100 },
      { left: true, right: false, top: true, bottom: false },
      [],
      grid,
      1,
    );
    expect(resized).toEqual({ x: 40, y: 60, w: 103, h: 97 });
  });

  it("un bord s'accroche à celui d'une autre carte", () => {
    const resized = snapResize(
      { x: 0, y: 0, w: 96, h: 50 },
      { left: false, right: true, top: false, bottom: false },
      [{ x: 100, y: 200, w: 10, h: 10 }],
      objects,
      1,
    );
    expect(resized.w).toBe(100);
  });

  it("jamais plus petit que le minimum, de quelque côté qu'on tire", () => {
    const edges = (right: boolean) => ({ left: !right, right, top: !right, bottom: right });
    expect(snapResize({ x: 0, y: 0, w: 5, h: 5 }, edges(true), [], none, 1)).toMatchObject({
      w: 20,
      h: 20,
    });
    const small = snapResize({ x: 90, y: 90, w: 5, h: 5 }, edges(false), [], none, 1);
    expect(small).toEqual({ x: 75, y: 75, w: 20, h: 20 });
  });

  it("sans réglage, le rectangle est celui du pointeur", () => {
    const free = { left: false, right: true, top: false, bottom: true };
    expect(snapResize({ x: 1, y: 2, w: 93, h: 47 }, free, [], none, 1)).toEqual({
      x: 1,
      y: 2,
      w: 93,
      h: 47,
    });
  });
});
