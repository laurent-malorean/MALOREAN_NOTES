import { describe, expect, it } from "vitest";
import { canvasFrame, canvasTitle } from "./canvas-image";
import { newTextCard } from "./canvas-model";

describe("image du canvas", () => {
  it("le cadre ajoute 40 points de marge de chaque côté, à deux pixels par point", () => {
    const frame = canvasFrame({
      cards: [{ ...newTextCard(10, 20), width: 100, height: 50 }],
      arrows: [],
      extra: [],
    });
    expect(frame).toMatchObject({
      x: -30,
      y: -20,
      width: 180,
      height: 130,
      pixelsWide: 360,
      pixelsHigh: 260,
    });
  });

  it("un canvas vide n'a pas d'image", () => {
    expect(canvasFrame({ cards: [], arrows: [], extra: [] })).toBeNull();
  });

  it("le nom proposé est celui du fichier sans extension", () => {
    expect(canvasTitle("Notes/Plan du projet.canvas")).toBe("Plan du projet");
    expect(canvasTitle("plan.CANVAS")).toBe("plan");
  });
});
