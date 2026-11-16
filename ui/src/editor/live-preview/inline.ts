// Texte Markdown d'une ligne rendu en éléments mis en forme, sans les marques de syntaxe.
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { SyntaxNode } from "@lezer/common";

const ELEMENT_FOR: Readonly<Record<string, string>> = {
  StrongEmphasis: "strong",
  Emphasis: "em",
  Strikethrough: "s",
  InlineCode: "code",
};

/** Ce qui n'est jamais montré : les marques. */
const HIDDEN = new Set(["EmphasisMark", "StrikethroughMark", "CodeMark", "LinkMark"]);
/** D'un lien ou d'une image, seul le texte entre crochets est montré : tout ce qui suit `]` est caché. */
const LINKS = new Set(["Link", "Image"]);
const TEXT_END = "]";

function append(target: Node, node: SyntaxNode, text: string) {
  if (HIDDEN.has(node.name)) return;
  const tag = ELEMENT_FOR[node.name];
  const container = tag ? document.createElement(tag) : target;
  let position = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    container.appendChild(document.createTextNode(text.slice(position, child.from)));
    if (LINKS.has(node.name) && text.slice(child.from, child.to) === TEXT_END) return;
    append(container, child, text);
    position = child.to;
  }
  container.appendChild(document.createTextNode(text.slice(position, node.to)));
  if (container !== target) target.appendChild(container);
}

/** Le texte `text` mis en forme : gras, italique, barré, code ; liens et images réduits à leur texte. */
export function renderInline(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const tree = markdownLanguage.parser.parse(text);
  const paragraph = tree.topNode.firstChild;
  if (paragraph) append(fragment, paragraph, text);
  return fragment;
}
