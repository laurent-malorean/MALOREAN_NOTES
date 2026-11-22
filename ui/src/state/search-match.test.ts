import { describe, expect, it } from "vitest";
import { firstMatch } from "./search-match";

describe("premier passage trouvé par une recherche", () => {
  it("est le premier endroit où un mot cherché paraît", () => {
    expect(firstMatch("Le chien et le chat", "chat")).toEqual({ from: 15, to: 19 });
    expect(firstMatch("Le chien et le chat", "chien")).toEqual({ from: 3, to: 8 });
  });

  it("ignore les majuscules et les accents, comme l'index", () => {
    expect(firstMatch("Une IDÉE centrale", "idee")).toEqual({ from: 4, to: 8 });
    expect(firstMatch("une idee", "IDÉE")).toEqual({ from: 4, to: 8 });
  });

  it("garde l'endroit du texte d'origine malgré les lettres accentuées avant", () => {
    expect(firstMatch("éééé chat", "chat")).toEqual({ from: 5, to: 9 });
  });

  it("avec plusieurs mots, va au plus proche du début", () => {
    expect(firstMatch("alpha beta gamma", "gamma beta")).toEqual({ from: 6, to: 10 });
  });

  it("trouve un mot au tout début du texte", () => {
    expect(firstMatch("chat noir", "chat")).toEqual({ from: 0, to: 4 });
  });

  it("garde le premier mot cherché quand il paraît avant les autres", () => {
    expect(firstMatch("alpha beta gamma", "beta gamma")).toEqual({ from: 6, to: 10 });
  });

  it("à égalité de place, garde le premier mot cherché", () => {
    expect(firstMatch("abc", "ab abc")).toEqual({ from: 0, to: 2 });
  });

  it("sépare les mots par tout espace, même plusieurs ou une tabulation", () => {
    expect(firstMatch("un deux trois", "trois \t  deux")).toEqual({ from: 3, to: 7 });
  });

  it("ne replie pas plus que l'index : les majuscules et les accents seulement", () => {
    expect(firstMatch("Straße", "strasse")).toBeNull();
    expect(firstMatch("STRASSE", "strasse")).toEqual({ from: 0, to: 7 });
  });

  it("ne trouve rien si aucun mot ne paraît, ou si la recherche est vide", () => {
    expect(firstMatch("alpha", "zèbre")).toBeNull();
    expect(firstMatch("alpha", "   ")).toBeNull();
    expect(firstMatch("", "alpha")).toBeNull();
  });
});
