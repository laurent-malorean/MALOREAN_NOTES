import { describe, expect, it } from "vitest";
import { IMAGE_MARGIN, IMAGE_SCALE, imageFrame, mapTitle } from "./mind-map-image";

describe("image de la carte mentale", () => {
  it("cadre toute la carte avec 40 points de marge, en deux fois plus de pixels", () => {
    expect(IMAGE_MARGIN).toBe(40);
    expect(IMAGE_SCALE).toBe(2);
    expect(imageFrame({ x: 10, y: 20, w: 300, h: 100 })).toEqual({
      x: -30,
      y: -20,
      width: 380,
      height: 180,
      pixelsWide: 760,
      pixelsHigh: 360,
    });
  });

  it("n'a pas d'image pour une carte vide", () => {
    expect(imageFrame(null)).toBeNull();
  });

  it("donne à l'image le titre de la carte, sinon le nom de son fichier", () => {
    const head = "---\ntype: carte-mentale\n---\n";
    expect(mapTitle(`${head}# Soft Power\n\n- A\n`, "Idées/soft-power.md")).toBe("Soft Power");
    expect(mapTitle(`${head}- A\n`, "Idées/soft-power.md")).toBe("soft-power");
    expect(mapTitle(`${head}#  Titre  \n`, "a.md")).toBe("Titre");
  });
});
