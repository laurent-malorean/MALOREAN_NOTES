import { describe, expect, it } from "vitest";
import { noteCount, tagChoices, tagColor, withoutTag, withTag } from "./tag-field";

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

describe("liste des étiquettes proposées", () => {
  const all = [
    { name: "salon", count: 3 },
    { name: "urgent", count: 12 },
    { name: "Voyage" },
    { name: "salaire", count: 1 },
  ];

  it("propose toutes les étiquettes qui existent quand rien n'est tapé, avec leur nombre de notes", () => {
    expect(tagChoices(all, [], "")).toEqual(all.map((s) => ({ kind: "existing", ...s })));
  });

  it("écarte celles que le contenu porte déjà, la casse ne comptant pas", () => {
    expect(tagChoices(all, ["Salon", "voyage"], "").map((c) => c.name)).toEqual([
      "urgent",
      "salaire",
    ]);
  });

  it("filtre sur ce qui est tapé, la casse et un « # » devant ne comptant pas, celles qui commencent par le texte d'abord", () => {
    const some = [{ name: "dessalé" }, { name: "Salon" }, { name: "xsal" }, { name: "salaire" }];
    expect(tagChoices(some, [], " #SAL ").map((c) => c.name)).toEqual([
      "Salon",
      "salaire",
      "dessalé",
      "xsal",
      "SAL",
    ]);
  });

  it("propose « Créer » avec le texte tapé quand ce n'est pas une étiquette qui existe, à la fin", () => {
    expect(tagChoices(all, [], "sal")).toEqual([
      { kind: "existing", name: "salon", count: 3 },
      { kind: "existing", name: "salaire", count: 1 },
      { kind: "create", name: "sal" },
    ]);
    expect(tagChoices(all, [], "  nouveau mot ").at(-1)).toEqual({
      kind: "create",
      name: "nouveau mot",
    });
  });

  it("ne propose pas de créer une étiquette qui existe, ou que le contenu porte, ni un texte vide", () => {
    expect(tagChoices(all, [], "SALON").map((c) => c.kind)).toEqual(["existing"]);
    expect(tagChoices(all, ["Nouveau"], "nouveau")).toEqual([]);
    expect(tagChoices(all, [], "#").some((c) => c.kind === "create")).toBe(false);
    expect(tagChoices([], [], "")).toEqual([]);
  });

  it("dit le nombre de notes au singulier et au pluriel", () => {
    expect(noteCount(1)).toBe("1 note");
    expect(noteCount(12)).toBe("12 notes");
    expect(noteCount(0)).toBe("0 note");
  });
});
