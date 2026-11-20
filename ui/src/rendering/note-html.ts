// Rendu HTML d'une note : le Markdown mis en forme, sans sa syntaxe ni son en-tête, lu par le même
// analyseur que l'éditeur. Sert à l'export PDF, à « Imprimer » et à « Copier en texte mis en forme ».
// Le HTML écrit dans la note n'est pas interprété : il reste du texte.
import { markdownLanguage } from "@codemirror/lang-markdown";
import { type Language, LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import type { SyntaxNode, Tree } from "@lezer/common";
import { highlightCode, tagHighlighter, tags } from "@lezer/highlight";
import { withoutFrontMatter } from "../editor/front-matter";

export interface RenderOptions {
  /** L'adresse où l'interface trouve une image écrite dans la note (chemin relatif à la note). */
  readonly resolveImage: (src: string) => string;
}

interface Context {
  readonly source: string;
  readonly options: RenderOptions;
  /** La langue de chaque bloc de code, par le nom écrit après ses ``` ; les inconnues manquent. */
  readonly languages: ReadonlyMap<string, Language>;
}

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const escaped = (text: string) => text.replace(/[&<>"]/g, (c) => ESCAPES[c] as string);

/** Les blocs qui contiennent d'autres blocs. */
const CONTAINERS: Readonly<Record<string, string>> = {
  Blockquote: "blockquote",
  BulletList: "ul",
  OrderedList: "ol",
  ListItem: "li",
};

/** Les blocs de texte : leur contenu est du texte mis en forme. */
const TEXT_BLOCKS: Readonly<Record<string, string>> = {
  Paragraph: "p",
  HTMLBlock: "p",
  ATXHeading1: "h1",
  ATXHeading2: "h2",
  ATXHeading3: "h3",
  ATXHeading4: "h4",
  ATXHeading5: "h5",
  ATXHeading6: "h6",
  SetextHeading1: "h1",
  SetextHeading2: "h2",
};

/** La mise en forme dans le texte. */
const INLINES: Readonly<Record<string, string>> = {
  Emphasis: "em",
  StrongEmphasis: "strong",
  Strikethrough: "del",
  InlineCode: "code",
  Subscript: "sub",
  Superscript: "sup",
};

/** La syntaxe Markdown, qui ne se montre pas. */
const MARKS = new Set([
  "HeaderMark",
  "QuoteMark",
  "EmphasisMark",
  "CodeMark",
  "StrikethroughMark",
  "SubscriptMark",
  "SuperscriptMark",
  "LinkMark",
  "Comment",
]);

/** Les classes des éléments d'un bloc de code, colorés par le thème comme dans l'éditeur. */
const HIGHLIGHTER = tagHighlighter([
  { tag: tags.keyword, class: "syntax-keyword" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: "syntax-string" },
  { tag: tags.comment, class: "syntax-comment" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: "syntax-number" },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    class: "syntax-function",
  },
  { tag: [tags.typeName, tags.className, tags.namespace], class: "syntax-type" },
  { tag: [tags.propertyName, tags.attributeName], class: "syntax-property" },
  { tag: tags.tagName, class: "syntax-tag" },
]);

const textOf = (ctx: Context, node: SyntaxNode) => ctx.source.slice(node.from, node.to);

function* childrenOf(node: SyntaxNode): Generator<SyntaxNode> {
  for (let child = node.firstChild; child; child = child.nextSibling) yield child;
}

/** Un lien entre notes `[[titre|texte]]` : sa portion, crochets compris, et le texte montré. */
function noteLink(ctx: Context, node: SyntaxNode): [number, number, string] | null {
  const bracketed = ctx.source[node.from - 1] === "[" && ctx.source[node.to] === "]";
  if (node.name !== "Link" || !bracketed) return null;
  const inside = ctx.source.slice(node.from + 1, node.to - 1);
  return [node.from - 1, node.to + 1, escaped(inside.slice(inside.indexOf("|") + 1))];
}

/** Le texte mis en forme entre `from` et `to` dans le nœud : sa syntaxe retirée. */
function inline(ctx: Context, node: SyntaxNode, from = node.from, to = node.to): string {
  let html = "";
  let at = from;
  // Les marques d'ouverture d'un lien, avant `from`, ne donnent rien : seule la fin compte.
  for (const child of [...childrenOf(node)].filter((c) => c.to <= to)) {
    const [start, end, rendered] = noteLink(ctx, child) ?? [
      child.from,
      child.to,
      element(ctx, child),
    ];
    html += escaped(ctx.source.slice(at, start)) + rendered;
    at = end;
  }
  return html + escaped(ctx.source.slice(at, to));
}

/** Un lien `[texte](adresse)` ; un lien sans adresse (référence) ne garde que son texte. */
function link(ctx: Context, node: SyntaxNode): string {
  const [open, close] = node.getChildren("LinkMark");
  // Stryker disable next-line OptionalChaining: un lien a toujours ses crochets ; garde exigée par TypeScript.
  const label = inline(ctx, node, open?.to, close?.from);
  const url = node.getChild("URL");
  return url ? `<a href="${escaped(textOf(ctx, url))}">${label}</a>` : label;
}

function image(ctx: Context, node: SyntaxNode): string {
  const [open, close] = node.getChildren("LinkMark");
  // Stryker disable next-line OptionalChaining: une image a toujours ses crochets ; garde exigée par TypeScript.
  const alt = escaped(ctx.source.slice(open?.to, close?.from));
  const url = node.getChild("URL");
  if (!url) return alt;
  return `<img src="${escaped(ctx.options.resolveImage(textOf(ctx, url)))}" alt="${alt}">`;
}

/** Les éléments du texte qui ne sont pas une simple mise en forme. */
const ELEMENTS: Readonly<Record<string, (ctx: Context, node: SyntaxNode) => string>> = {
  Link: link,
  Image: image,
  URL: (ctx, node) => `<a href="${escaped(textOf(ctx, node))}">${escaped(textOf(ctx, node))}</a>`,
  HardBreak: () => "<br>",
  Escape: (ctx, node) => escaped(ctx.source.slice(node.from + 1, node.to)),
  Entity: textOf,
  TaskMarker: (ctx, node) =>
    `<input type="checkbox" disabled${/x/i.test(textOf(ctx, node)) ? " checked" : ""}>`,
};

/** Un élément dans le texte. */
function element(ctx: Context, node: SyntaxNode): string {
  const special = ELEMENTS[node.name];
  if (special) return special(ctx, node);
  if (MARKS.has(node.name)) return "";
  const tag = INLINES[node.name];
  return tag ? `<${tag}>${inline(ctx, node)}</${tag}>` : inline(ctx, node);
}

function highlighted(code: string, language: Language): string {
  let html = "";
  highlightCode(
    code,
    language.parser.parse(code),
    HIGHLIGHTER,
    (text, classes) => {
      html += classes ? `<span class="${classes}">${escaped(text)}</span>` : escaped(text);
    },
    () => (html += "\n"),
  );
  return html;
}

function codeBlock(ctx: Context, node: SyntaxNode): string {
  const code = node
    .getChildren("CodeText")
    .map((text) => textOf(ctx, text))
    .join("");
  const info = node.getChild("CodeInfo");
  const language = info && ctx.languages.get(textOf(ctx, info));
  return `<pre><code>${language ? highlighted(code, language) : escaped(code)}</code></pre>`;
}

function table(ctx: Context, node: SyntaxNode): string {
  const row = (line: SyntaxNode, cell: string) =>
    `<tr>${line
      .getChildren("TableCell")
      .map((c) => `<${cell}>${inline(ctx, c)}</${cell}>`)
      .join("")}</tr>`;
  const header = node.getChildren("TableHeader").map((line) => row(line, "th"));
  const rows = node.getChildren("TableRow").map((line) => row(line, "td"));
  // Stryker disable next-line StringLiteral: un tableau n'a qu'une ligne d'en-tête ; le séparateur ne sert pas.
  return `<table><thead>${header.join("")}</thead><tbody>${rows.join("")}</tbody></table>`;
}

/** Un bloc ; la syntaxe (marques de citation, de liste) et les commentaires ne donnent rien. */
function block(ctx: Context, node: SyntaxNode): string {
  switch (node.name) {
    case "FencedCode":
    case "CodeBlock":
      return codeBlock(ctx, node);
    case "Table":
      return table(ctx, node);
    case "HorizontalRule":
      return "<hr>";
    case "Task":
      return inline(ctx, node);
  }
  const container = CONTAINERS[node.name];
  if (container) return `<${container}>${blocks(ctx, node)}</${container}>`;
  const tag = TEXT_BLOCKS[node.name];
  return tag ? `<${tag}>${inline(ctx, node).trim()}</${tag}>` : "";
}

function blocks(ctx: Context, node: SyntaxNode): string {
  return [...childrenOf(node)].map((child) => block(ctx, child)).join("");
}

/** Charge la langue de chaque bloc de code dont le nom est connu. */
async function codeLanguages(tree: Tree, source: string): Promise<Map<string, Language>> {
  const names = new Set<string>();
  tree.iterate({
    enter: (node) => {
      // Stryker disable next-line ConditionalExpression: lire d'autres nœuds chargerait des langues en trop, sans rien changer au rendu.
      if (node.name === "CodeInfo") names.add(source.slice(node.from, node.to));
    },
  });
  const found = new Map<string, Language>();
  for (const name of names) {
    const description = LanguageDescription.matchLanguageName(languages, name);
    if (description) found.set(name, (await description.load()).language);
  }
  return found;
}

/** La note mise en forme en HTML, sans son en-tête ni sa syntaxe Markdown. */
export async function noteHtml(markdown: string, options: RenderOptions): Promise<string> {
  const source = withoutFrontMatter(markdown);
  const tree = markdownLanguage.parser.parse(source);
  const ctx = { source, options, languages: await codeLanguages(tree, source) };
  return blocks(ctx, tree.topNode);
}
