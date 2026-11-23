import { describe, expect, it } from "vitest";
import {
  centredOn,
  clampScale,
  contains,
  dropPlace,
  fitted,
  MAX_SCALE,
  MIN_SCALE,
  panned,
  revealed,
  toMap,
  wheeled,
  zoomed,
} from "./mind-map-viewport";

const VIEW = { w: 800, h: 600 };

describe("la vue d'une carte mentale", () => {
  it("borne le zoom de 20 % à 300 %", () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(9)).toBe(MAX_SCALE);
    expect(clampScale(1)).toBe(1);
  });

  it("cadre toute la carte, centrée, avec 40 points de marge", () => {
    const view = fitted({ x: 100, y: 50, w: 1440, h: 400 }, VIEW);
    expect(view.scale).toBeCloseTo((800 - 80) / 1440);
    expect(view.x + 100 * view.scale).toBeCloseTo(40);
    expect(view.y + (50 + 200) * view.scale).toBeCloseTo(300);
  });

  it("ne dépasse pas 150 % en cadrant une petite carte", () => {
    const view = fitted({ x: 0, y: 0, w: 10, h: 10 }, VIEW);
    expect(view.scale).toBe(1.5);
    expect(view.x + 5 * 1.5).toBeCloseTo(400);
  });

  it("cadre une carte vide au centre, et une carte plate sans diviser par zéro", () => {
    expect(fitted(null, VIEW)).toEqual({ x: 400, y: 300, scale: 1 });
    expect(fitted({ x: 0, y: 0, w: 0, h: 0 }, VIEW).scale).toBe(1.5);
  });

  it("zoome autour d'un point qui reste en place", () => {
    const view = { x: 10, y: 20, scale: 1 };
    const around = { x: 200, y: 100 };
    const next = zoomed(view, 2, around);
    expect(next.scale).toBe(2);
    expect(toMap(next, around)).toEqual(toMap(view, around));
    expect(zoomed(view, 100, around).scale).toBe(MAX_SCALE);
  });

  it("déplace la vue", () => {
    expect(panned({ x: 1, y: 2, scale: 2 }, 5, -3)).toEqual({ x: 6, y: -1, scale: 2 });
  });

  it("montre un nœud hors de la vue, sans bouger si déjà visible", () => {
    const view = { x: 0, y: 0, scale: 1 };
    expect(revealed(view, { x: 100, y: 100, w: 50, h: 30 }, VIEW)).toEqual(view);
    expect(revealed(view, { x: 900, y: 100, w: 50, h: 30 }, VIEW).x).toBe(800 - 24 - 950);
    expect(revealed(view, { x: -100, y: 100, w: 50, h: 30 }, VIEW).x).toBe(124);
    expect(revealed(view, { x: 100, y: 700, w: 50, h: 30 }, VIEW).y).toBe(600 - 24 - 730);
    expect(revealed(view, { x: 100, y: -50, w: 50, h: 30 }, VIEW).y).toBe(74);
    // Un nœud plus grand que la vue : son bord gauche reste visible.
    expect(revealed(view, { x: 100, y: 0, w: 2000, h: 30 }, VIEW).x).toBe(-76);
  });

  it("centre la vue sur un nœud", () => {
    const view = centredOn({ x: 0, y: 0, scale: 2 }, { x: 100, y: 100, w: 100, h: 20 }, VIEW);
    expect(view).toEqual({ x: 400 - 300, y: 300 - 220, scale: 2 });
  });

  it("dit où un dépôt met le nœud : quart haut, moitié centrale, quart bas", () => {
    const box = { x: 0, y: 100, w: 100, h: 40 };
    expect(dropPlace(box, 105)).toBe("before");
    expect(dropPlace(box, 120)).toBe("child");
    expect(dropPlace(box, 135)).toBe("after");
    expect(contains(box, { x: 50, y: 120 })).toBe(true);
    expect(contains(box, { x: 150, y: 120 })).toBe(false);
    expect(contains(box, { x: 50, y: 90 })).toBe(false);
  });

  it("déplace avec la molette, zoome avec Cmd + molette ou en pinçant", () => {
    const view = { x: 0, y: 0, scale: 1 };
    const at = { x: 100, y: 100 };
    const wheel = { deltaX: 5, deltaY: 10, ctrlKey: false, metaKey: false };
    expect(wheeled(view, wheel, at)).toEqual({ x: -5, y: -10, scale: 1 });
    const meta = wheeled(view, { ...wheel, metaKey: true, deltaY: -100 }, at);
    expect(meta.scale).toBeCloseTo(Math.exp(0.3));
    expect(toMap(meta, at).x).toBeCloseTo(100);
    const pinch = wheeled(view, { ...wheel, ctrlKey: true, deltaY: -10 }, at);
    expect(pinch.scale).toBeCloseTo(Math.exp(0.1));
  });
});
