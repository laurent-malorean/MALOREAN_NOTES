import { describe, expect, it } from "vitest";
import { renderInline } from "./inline";

const html = (text: string) => {
  const box = document.createElement("div");
  box.append(renderInline(text));
  return box.innerHTML;
};

describe("texte mis en forme dans une cellule", () => {
  it("garde le texte simple tel quel", () => {
    expect(html("Pomme & <b>")).toBe("Pomme &amp; &lt;b&gt;");
  });

  it("met en gras, en italique, barré et en code, sans les marques", () => {
    expect(html("**g** *i* ~~b~~ `c`")).toBe(
      "<strong>g</strong> <em>i</em> <s>b</s> <code>c</code>",
    );
  });

  it("imbrique les mises en forme", () => {
    expect(html("**a *b* c**")).toBe("<strong>a <em>b</em> c</strong>");
  });

  it("ne garde que le texte d'un lien et d'une image", () => {
    expect(html("[site](https://example.com) ![chat](c.png)")).toBe("site chat");
  });

  it("ne montre pas le titre d'un lien", () => {
    expect(html('[site](https://example.com "Le site")')).toBe("site");
  });

  it("garde le texte vide vide", () => {
    expect(html("")).toBe("");
  });
});
