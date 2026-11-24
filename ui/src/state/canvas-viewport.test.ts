import { describe, expect, it } from "vitest";
import {
  DETAIL_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  ZOOM_STEP,
  fitted,
  initial,
  panned,
  toMap,
  wheeled,
  zoomed,
} from "./canvas-viewport";

const view = { w: 1000, h: 600 };
const start = { x: 100, y: 50, scale: 1 };

describe("vue du canvas", () => {
  it("le zoom initial est 100 % au centre de la vue", () => {
    expect(initial(view)).toEqual({ x: 500, y: 300, scale: 1 });
    expect(fitted(null, view)).toEqual(initial(view));
  });

  it("tout voir centre le contenu avec une marge, sans dépasser 100 %", () => {
    expect(fitted({ x: 0, y: 0, w: 100, h: 100 }, view)).toEqual({ x: 450, y: 250, scale: 1 });
    const big = fitted({ x: 0, y: 0, w: 4000, h: 100 }, view);
    expect(big.scale).toBeCloseTo(0.23, 2);
    expect(big.x).toBeCloseTo(40, 5);
    expect(fitted({ x: 0, y: 0, w: 0, h: 0 }, view).scale).toBe(1);
  });

  it("le zoom reste entre ses bornes et garde fixe le point visé", () => {
    const z = zoomed(start, 2, { x: 300, y: 200 });
    expect(z).toEqual({ scale: 2, x: -100, y: -100 });
    expect(zoomed(start, 1000, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    expect(zoomed(start, 0.0001, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
    expect(ZOOM_STEP).toBe(1.25);
    expect(DETAIL_SCALE).toBe(0.25);
  });

  it("déplacer la vue et retrouver un point du canvas", () => {
    expect(panned(start, 5, -5)).toEqual({ x: 105, y: 45, scale: 1 });
    expect(toMap({ x: 100, y: 50, scale: 2 }, { x: 300, y: 250 })).toEqual({ x: 100, y: 100 });
  });

  it("la molette descend, Maj + molette va de côté, Cmd + molette zoome", () => {
    const wheel = { deltaX: 0, deltaY: 10, ctrlKey: false, metaKey: false, shiftKey: false };
    expect(wheeled(start, wheel, { x: 0, y: 0 })).toEqual({ x: 100, y: 40, scale: 1 });
    expect(wheeled(start, { ...wheel, deltaX: 4 }, { x: 0, y: 0 })).toEqual({
      x: 96,
      y: 40,
      scale: 1,
    });
    expect(wheeled(start, { ...wheel, shiftKey: true }, { x: 0, y: 0 })).toEqual({
      x: 90,
      y: 50,
      scale: 1,
    });
    expect(
      wheeled(start, { ...wheel, metaKey: true, deltaY: -100 }, { x: 0, y: 0 }).scale,
    ).toBeGreaterThan(1);
    expect(
      wheeled(start, { ...wheel, ctrlKey: true, deltaY: -100 }, { x: 0, y: 0 }).scale,
    ).toBeCloseTo(Math.exp(1), 5);
  });
});
