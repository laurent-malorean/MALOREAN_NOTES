import { describe, expect, it } from "vitest";
import { imageIn } from "./panes";

const asset = (path: string) => `asset://${path}`;

describe("image d'une note", () => {
  it("une image relative est cherchée dans le dossier de sa note", () => {
    expect(imageIn("/lib", "voyages/rome.md", "vue.png", asset)).toBe(
      "asset:///lib/voyages/vue.png",
    );
    expect(imageIn("/lib", "rome.md", "vue.png", asset)).toBe("asset:///lib/vue.png");
  });

  it("sans note, à la racine de la bibliothèque", () => {
    expect(imageIn("/lib", null, "vue.png", asset)).toBe("asset:///lib/vue.png");
  });
});
