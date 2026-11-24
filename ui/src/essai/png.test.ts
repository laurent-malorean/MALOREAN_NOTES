import { describe, expect, it } from "vitest";
import { drawnPoints, pixelRect, pngSize } from "./png";

const header = (width: number, height: number) => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

describe("essai : la taille d'un PNG", () => {
  it("se lit dans l'en-tête", () => {
    expect(pngSize(header(1360, 900))).toEqual({ width: 1360, height: 900 });
  });

  it("n'existe pas pour autre chose qu'un PNG", () => {
    const text = new TextEncoder().encode('{"erreur":"image pas reçue en entier","x":1}');
    expect(pngSize(text)).toBeNull();
    expect(pngSize(new Uint8Array(0))).toBeNull();
    expect(pngSize(header(1, 1).subarray(0, 23))).toBeNull();
    const nearly = header(1, 1);
    nearly[7] = 0x0b;
    expect(pngSize(nearly)).toBeNull();
  });

  it("se lit aussi d'un morceau de mémoire plus grand", () => {
    const outer = new Uint8Array(50);
    outer.set(header(7, 9), 10);
    expect(pngSize(outer.subarray(10))).toEqual({ width: 7, height: 9 });
  });
});

describe("essai : où une zone tombe dans l'image", () => {
  it("décale du coin du cadre et met à l'échelle", () => {
    expect(pixelRect({ x: 100, y: 50, width: 20, height: 10 }, { x: 60, y: 30 }, 2)).toEqual({
      x: 80,
      y: 40,
      width: 40,
      height: 20,
    });
  });

  it("arrondit au pixel", () => {
    expect(pixelRect({ x: 0.3, y: 0.7, width: 1.2, height: 1.2 }, { x: 0, y: 0 }, 1)).toEqual({
      x: 0,
      y: 1,
      width: 1,
      height: 1,
    });
  });
});

/** Une image de `width` x `height` : fond blanc, et `ink` tracé dans la zone donnée. */
function picture(width: number, height: number, ink: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const [x0, y0, x1, y1] = ink;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) data.set([10, 20, 30, 255], (y * width + x) * 4);
  return { width, height, data };
}

describe("essai : les points dessinés d'une zone", () => {
  const image = picture(40, 40, [10, 10, 20, 20]);

  it("compte les points qui diffèrent du fond (celui du coin haut gauche)", () => {
    expect(drawnPoints(image, { x: 10, y: 10, width: 10, height: 10 }, 1)).toBe(100);
    expect(drawnPoints(image, { x: 0, y: 0, width: 10, height: 10 }, 1)).toBe(0);
  });

  it("échantillonne un point sur `step`, deux par défaut", () => {
    expect(drawnPoints(image, { x: 10, y: 10, width: 10, height: 10 })).toBe(25);
  });

  it("ignore ce qui sort de l'image", () => {
    expect(drawnPoints(image, { x: 15, y: 15, width: 100, height: 100 }, 1)).toBe(25);
    expect(drawnPoints(image, { x: -5, y: -5, width: 20, height: 20 }, 1)).toBe(25);
  });

  it("ne compte pas un écart de fond sous la tolérance, mais compte celui qui la dépasse", () => {
    const data = new Uint8ClampedArray(4 * 4).fill(255);
    data.set([249, 255, 255, 255], 4);
    data.set([248, 255, 255, 255], 8);
    expect(drawnPoints({ width: 4, height: 1, data }, { x: 0, y: 0, width: 4, height: 1 }, 1)).toBe(
      1,
    );
  });

  it("une image vide n'a rien de dessiné", () => {
    const empty = { width: 2, height: 2, data: [] };
    expect(drawnPoints(empty, { x: 0, y: 0, width: 2, height: 2 }, 1)).toBe(0);
  });
});
