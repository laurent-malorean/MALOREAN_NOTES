import { describe, expect, it } from "vitest";
import { plainText } from "./note-text";

describe("texte brut d'une note", () => {
  it("garde le texte des titres et des paragraphes, séparés d'une ligne vide, sans en-tête", () => {
    expect(plainText("---\ntags: [a]\n---\n# Titre ##\n\nUn *deux*\ntrois\n\nSous\n-")).toBe(
      "Titre\n\nUn deux\ntrois\n\nSous",
    );
  });

  it("lit les titres de chaque niveau et le texte HTML tel quel", () => {
    expect(
      plainText("## 2\n### 3\n#### 4\n##### 5\n###### 6\n\nGrand\n=\n\n<div>\nhi\n</div>"),
    ).toBe("2\n\n3\n\n4\n\n5\n\n6\n\nGrand\n\n<div>\nhi\n</div>");
  });

  it("retire les marques d'emphase, de code et les échappements", () => {
    expect(plainText("**a** ~~b~~ `c` ~d~ ^e^ \\*f\\* &amp;")).toBe("a b c d e *f* &amp;");
  });

  it("garde le texte des liens, des liens entre notes et des images, sans leurs adresses", () => {
    expect(
      plainText("[site](https://a.fr) [[Note|texte]] [[Autre]] ![vue](v.png) <https://b.fr>"),
    ).toBe("site texte Autre vue https://b.fr");
  });

  it("ne lit les adresses, titres et renvois d'un lien que hors d'un lien", () => {
    expect(plainText('[a][r] [b](u "t") https://c.fr\n\n[r]: http://x')).toBe("a b https://c.fr");
  });

  it("ne prend pour un lien entre notes que des crochets doublés autour d'un lien", () => {
    expect(plainText("[*a*] x [[b] y [c]] z")).toBe("a x [b y c] z");
    expect(plainText("[**a**](u)")).toBe("a");
  });

  it("met des puces, garde les numéros et les cases à cocher, décale les sous-listes", () => {
    expect(plainText("- un\n- deux\n  3. trois\n  4. quatre\n- [x] fait\n- [ ] non")).toBe(
      "• un\n• deux\n  3. trois\n  4. quatre\n☑ fait\n☐ non",
    );
  });

  it("un élément vide garde sa puce", () => {
    expect(plainText("- un\n-\n- deux")).toBe("• un\n• \n• deux");
  });

  it("décale aussi les lignes suivantes d'un élément", () => {
    expect(plainText("1. un\n   suite\n\n   para")).toBe("1. un\n   suite\n   para");
  });

  it("garde le texte des citations, le code tel quel et un trait pour un séparateur", () => {
    expect(plainText("> cité\n\n```js\nlet a = 1;\n```\n\n    retrait\n\n***")).toBe(
      "cité\n\nlet a = 1;\n\nretrait\n\n———",
    );
  });

  it("lit les citations sur plusieurs lignes et le code en retrait sur plusieurs lignes", () => {
    expect(plainText("> a\n> b\n\n    x\n    y")).toBe("a\nb\n\nx\ny");
  });

  it("sépare les cellules d'un tableau par des tabulations, sans la ligne de séparation", () => {
    expect(plainText("| a | **b** |\n|---|---|\n| 1 | 2 |")).toBe("a\tb\n1\t2");
  });

  it("garde un retour à la ligne forcé, sans les commentaires", () => {
    expect(plainText("un\\\ndeux <!-- caché -->")).toBe("un\ndeux");
  });

  it("une note vide donne un texte vide", () => {
    expect(plainText("")).toBe("");
  });
});
