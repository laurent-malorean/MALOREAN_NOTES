// Texte brut d'une note : ce qu'on lit, sans la syntaxe Markdown ni l'en-tête, pour l'application
// qui colle du texte sans mise en forme. Lu par le même analyseur que l'éditeur et le rendu HTML.
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { SyntaxNode } from "@lezer/common";
import { withoutFrontMatter } from "../editor/front-matter";

/** La syntaxe Markdown, qui ne se lit pas. */
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

/** Les blocs de texte, lus ligne à ligne. */
const TEXT_BLOCKS = new Set([
  "Paragraph",
  "HTMLBlock",
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "SetextHeading1",
  "SetextHeading2",
]);

/** Ce qui sépare un séparateur des blocs voisins. */
const RULE = "———";

function* childrenOf(node: SyntaxNode): Generator<SyntaxNode> {
  for (let child = node.firstChild; child; child = child.nextSibling) yield child;
}

/** Les éléments du texte qui se lisent autrement que leur source. */
const ELEMENTS: Readonly<Record<string, (source: string, node: SyntaxNode) => string>> = {
  // Un lien et une image se lisent par leur texte, sans leur adresse, leur titre ou leur renvoi.
  Link: label,
  Image: label,
  HardBreak: () => "\n",
  Escape: (source, node) => source.slice(node.from + 1, node.to),
  TaskMarker: (source, node) => (/x/i.test(source.slice(node.from, node.to)) ? "☑" : "☐"),
};

/** Le texte entre `from` et `to` dans le nœud, sa syntaxe retirée. */
function inline(source: string, node: SyntaxNode, from = node.from, to = node.to): string {
  let text = "";
  let at = from;
  // Les marques d'ouverture d'un lien, avant `from`, ne donnent rien : seule la fin compte.
  for (const child of [...childrenOf(node)].filter((c) => c.to <= to)) {
    // Un lien entre notes `[[titre|texte]]` se lit par son texte.
    const bracketed = source[child.from - 1] === "[" && source[child.to] === "]";
    const inside = source.slice(child.from + 1, child.to - 1);
    const [start, end, read] =
      child.name === "Link" && bracketed
        ? [child.from - 1, child.to + 1, inside.slice(inside.indexOf("|") + 1)]
        : [child.from, child.to, element(source, child)];
    text += source.slice(at, start) + read;
    at = end;
  }
  return text + source.slice(at, to);
}

function label(source: string, node: SyntaxNode): string {
  const [open, close] = node.getChildren("LinkMark");
  return inline(source, node, (open as SyntaxNode).to, (close as SyntaxNode).from);
}

function element(source: string, node: SyntaxNode): string {
  const special = ELEMENTS[node.name];
  if (special) return special(source, node);
  return MARKS.has(node.name) ? "" : inline(source, node);
}

/** Un élément de liste : sa marque devant la première ligne, les suivantes décalées d'autant. */
function item(source: string, node: SyntaxNode, bullet: boolean): string {
  const children = [...childrenOf(node)];
  const mark = children[0] as SyntaxNode;
  const marker = bullet ? "• " : `${source.slice(mark.from, mark.to)} `;
  // Une case à cocher tient lieu de puce.
  const shown = children[1]?.name === "Task" ? "" : marker;
  const lines = children
    .slice(1)
    .map((child) => block(source, child))
    .join("\n")
    .split("\n");
  return lines.map((line, i) => (i === 0 ? shown : " ".repeat(marker.length)) + line).join("\n");
}

function list(source: string, node: SyntaxNode): string {
  const bullet = node.name === "BulletList";
  return [...childrenOf(node)].map((child) => item(source, child, bullet)).join("\n");
}

function table(source: string, node: SyntaxNode): string {
  return [...childrenOf(node)]
    .filter((line) => line.name !== "TableDelimiter")
    .map((line) =>
      line
        .getChildren("TableCell")
        .map((cell) => inline(source, cell))
        .join("\t"),
    )
    .join("\n");
}

/** Un bloc ; les commentaires et ce qui n'a pas de texte ne donnent rien. */
function block(source: string, node: SyntaxNode): string {
  switch (node.name) {
    case "FencedCode":
    case "CodeBlock":
      return node
        .getChildren("CodeText")
        .map((text) => source.slice(text.from, text.to))
        .join("");
    case "Table":
      return table(source, node);
    case "HorizontalRule":
      return RULE;
    case "Task":
      return inline(source, node);
    case "Blockquote":
      return blocks(source, node);
    case "BulletList":
    case "OrderedList":
      return list(source, node);
  }
  if (!TEXT_BLOCKS.has(node.name)) return "";
  return inline(source, node)
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function blocks(source: string, node: SyntaxNode): string {
  return [...childrenOf(node)]
    .map((child) => block(source, child))
    .filter((text) => text !== "")
    .join("\n\n");
}

/** La note en texte brut, sans son en-tête ni sa syntaxe Markdown. */
export function plainText(markdown: string): string {
  const source = withoutFrontMatter(markdown);
  return blocks(source, markdownLanguage.parser.parse(source).topNode);
}
