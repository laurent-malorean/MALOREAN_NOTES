import { describe, expect, it } from "vitest";
import { IMAGES_BUDGET, noteStyles, styledHtml, withEmbeddedImages } from "./rich-text";

/** Un thème simulé : chaque variable vaut son nom, entre crochets. */
const token = (name: string) => `[${name}]`;

describe("styles en ligne de la copie mise en forme", () => {
  it("reprennent l'apparence de la feuille d'impression, valeurs tirées du thème", () => {
    const cell = "border: 1px solid [--border]; padding: 0.3em 0.7em; text-align: left";
    expect(noteStyles(token)).toEqual({
      sheet:
        "color: [--text]; font-family: [--text-font]; font-size: [--text-size]; line-height: [--line-height]",
      h1: "font-size: [--heading1-size]",
      h2: "font-size: [--heading2-size]",
      h3: "font-size: [--heading3-size]",
      a: "color: [--accent]",
      blockquote:
        "margin: 1em 0; padding-left: 1em; border-left: 3px solid [--border]; color: [--muted]; font-style: italic",
      code: "font-family: [--mono]; color: [--code]",
      pre: "padding: 0.8em 1em; border-radius: 4px; background: [--code-block-background]; font-size: [--code-block-text-size]; white-space: pre-wrap",
      "pre code": "font-family: [--mono]; color: [--syntax-plain]",
      table: "border-collapse: collapse; font-size: [--table-text-size]",
      th: `${cell}; background: [--side-panel]`,
      td: cell,
      hr: "border: none; border-top: 1px solid [--border]",
      img: "max-width: 100%",
      "syntax-keyword": "color: [--syntax-keyword]",
      "syntax-string": "color: [--syntax-string]",
      "syntax-comment": "color: [--syntax-comment]; font-style: italic",
      "syntax-number": "color: [--syntax-number]",
      "syntax-function": "color: [--syntax-function]",
      "syntax-type": "color: [--syntax-type]",
      "syntax-property": "color: [--syntax-property]",
      "syntax-tag": "color: [--syntax-tag]",
    });
  });
});

describe("rendu HTML aux styles en ligne", () => {
  const styles = {
    sheet: 'font-family: "New York", serif',
    h1: "S-h1",
    code: "S-code",
    pre: "S-pre",
    "pre code": "S-precode",
    a: "S-a",
    img: "S-img",
    "syntax-keyword": "S-kw",
  };

  it("met le style de chaque élément dans son attribut, le tout dans un bloc au style du texte", () => {
    expect(styledHtml('<h1>T</h1><p><a href="x">l</a> <img src="i" alt=""></p>', styles)).toBe(
      '<div style="font-family: &quot;New York&quot;, serif">' +
        '<h1 style="S-h1">T</h1><p><a style="S-a" href="x">l</a> <img style="S-img" src="i" alt=""></p>' +
        "</div>",
    );
  });

  it("distingue le code dans le texte du code d'un bloc, et colore le code sans classes", () => {
    expect(
      styledHtml(
        '<p><code>a</code></p><pre><code><span class="syntax-keyword">if</span> x</code></pre>',
        styles,
      ),
    ).toContain(
      '<p><code style="S-code">a</code></p>' +
        '<pre style="S-pre"><code style="S-precode"><span style="S-kw">if</span> x</code></pre>',
    );
  });

  it("change les cases à cocher en caractères, que les mails gardent", () => {
    expect(
      styledHtml(
        '<li><input type="checkbox" disabled checked> fait</li><li><input type="checkbox" disabled> non</li>',
        {},
      ),
    ).toBe('<div style=""><li>☑ fait</li><li>☐ non</li></div>');
  });

  it("laisse sans style ce que le thème ne règle pas, même à la place d'un élément stylé", () => {
    expect(styledHtml("<h2>a</h2><p>b</p><hr>", { h1: "x" })).toBe(
      '<div style=""><h2>a</h2><p>b</p><hr></div>',
    );
  });
});

describe("images de la copie mise en forme", () => {
  const html = '<p><img src="a.png" alt="A"> <img src="b.png" alt="B"></p>';

  it("sont incluses dans le HTML en adresses data:", async () => {
    const loaded = await withEmbeddedImages(html, async (src) => `data:${src}`);
    expect(loaded).toBe('<p><img src="data:a.png" alt="A"> <img src="data:b.png" alt="B"></p>');
  });

  it("sont laissées de côté si elles ne se lisent pas", async () => {
    const loaded = await withEmbeddedImages(html, async (src) =>
      src === "a.png" ? null : `data:${src}`,
    );
    expect(loaded).toBe('<p> <img src="data:b.png" alt="B"></p>');
  });

  it("sont laissées de côté au-delà de la taille permise, comptée sur toutes les images", async () => {
    const data = "d".repeat(6);
    expect(await withEmbeddedImages(html, async () => data, 12)).toBe(
      `<p><img src="${data}" alt="A"> <img src="${data}" alt="B"></p>`,
    );
    expect(await withEmbeddedImages(html, async () => data, 11)).toBe(
      `<p><img src="${data}" alt="A"> </p>`,
    );
  });

  it("tiennent en tout dans quelques mégaoctets", () => {
    expect(IMAGES_BUDGET).toBe(8 * 1024 * 1024);
  });

  it("une image qui ne tient plus n'empêche pas une plus petite après elle", async () => {
    const sizes: Record<string, string> = { "a.png": "x".repeat(10), "b.png": "y" };
    expect(await withEmbeddedImages(html, async (src) => sizes[src] ?? null, 5)).toBe(
      '<p> <img src="y" alt="B"></p>',
    );
  });
});
