import { describe, expect, it } from "vitest";
import { tagColor, withoutTag, withTag } from "./tag-field";

describe("couleur d'une étiquette", () => {
  it("vient de la somme des codes de son nom en minuscules, modulo 10", () => {
    // « a » = 97 : 97 mod 10 = 7, la huitième couleur (rose).
    expect(tagColor("a")).toBe("rose");
    // « urgent » : 117+114+103+101+110+116 = 661, modulo 10 = 1 (orange).
    expect(tagColor("urgent")).toBe("orange");
  });

  it("ne compte pas la casse, et part du rouge", () => {
    expect(tagColor("URGENT")).toBe(tagColor("urgent"));
    // « d » = 100 : modulo 10 = 0, la première couleur.
    expect(tagColor("d")).toBe("rouge");
  });

  it("compte les codes d'un caractère hors du plan de base comme un seul", () => {
    // 😀 = 128512 : modulo 10 = 2 (jaune).
    expect(tagColor("😀")).toBe("jaune");
  });
});

describe("ajouter une étiquette", () => {
  it("ajoute une étiquette à la fin, sans espaces autour", () => {
    expect(withTag(["a"], "  b ")).toEqual(["a", "b"]);
  });

  it("refuse une étiquette vide ou déjà là, la casse ne comptant pas", () => {
    expect(withTag(["a"], "   ")).toEqual(["a"]);
    expect(withTag(["Salon"], "salon")).toEqual(["Salon"]);
  });

  it("rend une nouvelle liste, jamais celle reçue", () => {
    const tags = ["a"];
    expect(withTag(tags, "b")).not.toBe(tags);
    expect(withTag(tags, "")).not.toBe(tags);
  });
});

describe("retirer une étiquette", () => {
  it("retire cette étiquette et garde l'ordre des autres", () => {
    expect(withoutTag(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("ne retire que l'étiquette écrite ainsi", () => {
    expect(withoutTag(["Salon", "salon"], "salon")).toEqual(["Salon"]);
    expect(withoutTag(["a"], "z")).toEqual(["a"]);
  });
});
