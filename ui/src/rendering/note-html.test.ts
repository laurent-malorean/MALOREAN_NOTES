import { describe, expect, it } from "vitest";
import { noteHtml } from "./note-html";

const options = { resolveImage: (src: string) => `asset://notes/${src}` };
const html = (markdown: string) => noteHtml(markdown, options);

describe("rendu HTML d'une note", () => {
  it("met les titres en forme, sans leurs dièses", async () => {
    expect(await html("# Un\n## Deux\n### Trois\n#### Quatre\n##### Cinq\n###### Six ##")).toBe(
      "<h1>Un</h1><h2>Deux</h2><h3>Trois</h3><h4>Quatre</h4><h5>Cinq</h5><h6>Six</h6>",
    );
  });

  it("lit aussi les titres soulignés", async () => {
    expect(await html("Grand\n=\n\nPetit\n-")).toBe("<h1>Grand</h1><h2>Petit</h2>");
  });

  it("laisse de côté l'en-tête de la note", async () => {
    expect(await html("---\ntags: [a]\n---\n# Titre")).toBe("<h1>Titre</h1>");
  });

  it("met l'emphase en forme, sans ses marques", async () => {
    expect(await html("*a* **b** ~~c~~ `d` ~e~ ^f^")).toBe(
      "<p><em>a</em> <strong>b</strong> <del>c</del> <code>d</code> <sub>e</sub> <sup>f</sup></p>",
    );
  });

  it("garde les paragraphes, les retours à la ligne forcés et les séparateurs", async () => {
    expect(await html("un\\\ndeux\n\n---\n\ntrois")).toBe("<p>un<br>deux</p><hr><p>trois</p>");
  });

  it("montre les listes, imbriquées, et les cases à cocher", async () => {
    expect(await html("- [x] fait\n- [ ] à faire\n- deux\n  1. sub")).toBe(
      '<ul><li><input type="checkbox" disabled checked> fait</li>' +
        '<li><input type="checkbox" disabled> à faire</li>' +
        "<li><p>deux</p><ol><li><p>sub</p></li></ol></li></ul>",
    );
  });

  it("met les citations en forme, sans leurs chevrons", async () => {
    expect(await html("> cite **b**\n> suite")).toBe(
      "<blockquote><p>cite <strong>b</strong>\n suite</p></blockquote>",
    );
  });

  it("garde les liens et leur texte mis en forme, sans le titre du lien", async () => {
    expect(await html('[*voir* ici](https://a.fr/?a=1&b=2 "titre")')).toBe(
      '<p><a href="https://a.fr/?a=1&amp;b=2"><em>voir</em> ici</a></p>',
    );
  });

  it("garde les adresses écrites telles quelles, entre chevrons ou non", async () => {
    expect(await html("<https://a.fr> et https://b.fr")).toBe(
      '<p><a href="https://a.fr">https://a.fr</a> et <a href="https://b.fr">https://b.fr</a></p>',
    );
  });

  it("ne garde que le texte d'un lien sans adresse", async () => {
    expect(await html("[réf] et [a][b]")).toBe("<p>réf et a</p>");
  });

  it("montre le texte d'un lien entre notes", async () => {
    expect(await html("voir [[Recettes]] et [[Lundi|la réunion]].")).toBe(
      "<p>voir Recettes et la réunion.</p>",
    );
  });

  it("ne prend pour un lien entre notes que des crochets doublés autour d'un lien", async () => {
    expect(await html("[*a*] x [[b] y [c]] z")).toBe("<p><em>a</em> x [b y c] z</p>");
  });

  it("montre les images à l'adresse où l'interface les trouve", async () => {
    expect(await html('![Vue "mer"](v.assets/a%20b.png) ![seule][x]')).toBe(
      '<p><img src="asset://notes/v.assets/a%20b.png" alt="Vue &quot;mer&quot;"> seule</p>',
    );
  });

  it("dessine les tableaux, ligne d'en-tête comprise", async () => {
    expect(await html("| A | B |\n|---|:-:|\n| `c` | ~~d~~ |\n| e | f |")).toBe(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>" +
        "<tr><td><code>c</code></td><td><del>d</del></td></tr>" +
        "<tr><td>e</td><td>f</td></tr></tbody></table>",
    );
  });

  it("colore les blocs de code selon leur langue", async () => {
    expect(await html("```js\nconst a = 'b'; // c\nf(1)\n```")).toBe(
      '<pre><code><span class="syntax-keyword">const</span> a = ' +
        "<span class=\"syntax-string\">'b'</span>; " +
        '<span class="syntax-comment">// c</span>\n' +
        '<span class="syntax-function">f</span>(<span class="syntax-number">1</span>)' +
        "</code></pre>",
    );
  });

  it("colore les types, les propriétés et les balises", async () => {
    expect(await html('```ts\nlet a: T = b.c\n```\n\n```html\n<a href="x">\n```')).toBe(
      '<pre><code><span class="syntax-keyword">let</span> a: <span class="syntax-type">T</span> = b.' +
        '<span class="syntax-property">c</span></code></pre>' +
        '<pre><code>&lt;<span class="syntax-tag">a</span> <span class="syntax-property">href</span>=' +
        '<span class="syntax-string">&quot;x&quot;</span>&gt;</code></pre>',
    );
  });

  it("garde tel quel un bloc de code sans langue connue, ou indenté", async () => {
    expect(await html("```inconnue\na < b\n```\n\n```\n```\n\n    x\n      y")).toBe(
      "<pre><code>a &lt; b</code></pre><pre><code></code></pre><pre><code>x\n  y</code></pre>",
    );
  });

  it("n'interprète pas le HTML écrit dans la note, et retire les commentaires", async () => {
    expect(
      await html('<div>"bloc"</div>\n\n<!-- note -->\n\na <b>x</b> <!-- c --> &amp; \\*'),
    ).toBe("<p>&lt;div&gt;&quot;bloc&quot;&lt;/div&gt;</p><p>a &lt;b&gt;x&lt;/b&gt;  &amp; *</p>");
  });
});
