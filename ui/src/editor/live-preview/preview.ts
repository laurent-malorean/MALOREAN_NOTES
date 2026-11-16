// Aperçu en direct : ce qu'il faut masquer ou dessiner, calculé sans toucher à l'écran.
// Le fichier n'est jamais modifié : seule l'apparence change, sauf sur les lignes où l'on écrit.
import type { Text } from "@codemirror/state";
import type { SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";

export type Conceal =
  | { kind: "hide"; from: number; to: number }
  | { kind: "bullet"; from: number; to: number }
  | { kind: "checkbox"; from: number; to: number; checked: boolean }
  | { kind: "rule"; from: number; to: number }
  | { kind: "image"; from: number; to: number; src: string; alt: string };

export interface LineStyle {
  readonly from: number;
  readonly className: string;
}

export interface Preview {
  conceals: Conceal[];
  lineStyles: LineStyle[];
}

export interface PreviewInput {
  readonly doc: Text;
  readonly tree: Tree;
  /** Numéros des lignes où se trouve le curseur : leur syntaxe reste visible. */
  readonly activeLines: ReadonlySet<number>;
  readonly from?: number;
  readonly to?: number;
}

export const FRONT_MATTER_CLASS = "cm-lp-front-matter";
export const QUOTE_CLASS = "cm-lp-quote";
export const CODE_BLOCK_CLASS = "cm-lp-code-block";
export const CODE_FENCE_CLASS = "cm-lp-code-fence";

/** Un en-tête YAML doit se fermer dans ces premiers caractères : au-delà, ce n'en est pas un. */
const FRONT_MATTER_SCAN_LIMIT = 10_000;
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
// Seul un bloc de code délimité a des marques à cacher (ses ```), et rien d'autre en lui :
// les blocs indentés, HTML et commentaires ne contiennent aucune marque Markdown.
const FENCED_CODE = "FencedCode";
const LINK_TEXT_END = "]";
const CHECKED = /\[[xX]\]/;

/** La case cochée devient décochée, et inversement. */
export function toggledTaskMarker(marker: string): string {
  return CHECKED.test(marker) ? "[ ]" : "[x]";
}

interface Context {
  doc: Text;
  preview: Preview;
}

/** `"skip"` : l'élément est dessiné en entier, son contenu n'est pas parcouru. */
type Handler = (node: SyntaxNode, context: Context) => "skip" | undefined;

const withSpace = (doc: Text, to: number) => (doc.sliceString(to, to + 1) === " " ? to + 1 : to);
// Stryker disable next-line OptionalChaining,StringLiteral: une marque a toujours un parent ; TypeScript exige le cas contraire.
const parentName = (node: SyntaxNode) => node.parent?.name ?? "";

function draw(context: Context, conceal: Conceal): undefined {
  context.preview.conceals.push(conceal);
  return undefined;
}

function hide(context: Context, from: number, to: number): undefined {
  return draw(context, { kind: "hide", from, to });
}

const HANDLERS: Record<string, Handler> = {
  HeaderMark: (node, c) => {
    if (parentName(node).startsWith("ATXHeading")) hide(c, node.from, withSpace(c.doc, node.to));
    return undefined;
  },
  EmphasisMark: (node, c) => hide(c, node.from, node.to),
  StrikethroughMark: (node, c) => hide(c, node.from, node.to),
  // Les blocs de code ne sont jamais parcourus : il ne reste que le code en ligne.
  CodeMark: (node, c) => hide(c, node.from, node.to),
  QuoteMark: (node, c) => hide(c, node.from, withSpace(c.doc, node.to)),
  ListMark: (node, c) => listMark(node, c),
  TaskMarker: (node, c) => {
    const checked = CHECKED.test(c.doc.sliceString(node.from, node.to));
    return draw(c, { kind: "checkbox", from: node.from, to: node.to, checked });
  },
  Link: (node, c) => link(node, c),
  Image: (node, c) => image(node, c),
  HorizontalRule: (node, c) => draw(c, { kind: "rule", from: node.from, to: node.to }),
};

function listMark(node: SyntaxNode, context: Context): undefined {
  const item = node.parent;
  const to = withSpace(context.doc, node.to);
  // Stryker disable next-line OptionalChaining: une marque de liste a toujours un élément parent.
  if (item?.getChild("Task")) return hide(context, node.from, to);
  if (parentName(item ?? node) === "BulletList")
    draw(context, { kind: "bullet", from: node.from, to });
  return undefined;
}

function styleLines(context: Context, from: number, to: number, className: string) {
  const last = context.doc.lineAt(to).number;
  for (let n = context.doc.lineAt(from).number; n <= last; n++) {
    context.preview.lineStyles.push({ from: context.doc.line(n).from, className });
  }
}

function isActive(input: PreviewInput, node: SyntaxNodeRef): boolean {
  return input.activeLines.has(input.doc.lineAt(node.from).number);
}

function visit(node: SyntaxNodeRef, input: PreviewInput, context: Context, frontMatterEnd: number) {
  // Stryker disable next-line BooleanLiteral: descendre ne changerait rien, chaque enfant serait écarté à son tour.
  if (node.to <= frontMatterEnd) return false;
  if (node.name === FENCED_CODE) return codeBlock(node.node, input, context);
  if (node.name === "Blockquote") styleLines(context, node.from, node.to, QUOTE_CLASS);
  if (isActive(input, node)) return true;
  return HANDLERS[node.name]?.(node.node, context) !== "skip";
}

/**
 * Un bloc de code est mis en forme sur toutes ses lignes ; ses délimiteurs (et la langue)
 * sont cachés, sauf si le curseur est dans le bloc. Son contenu n'est jamais parcouru.
 */
function codeBlock(node: SyntaxNode, input: PreviewInput, context: Context): false {
  styleLines(context, node.from, node.to, CODE_BLOCK_CLASS);
  const first = input.doc.lineAt(node.from).number;
  const last = input.doc.lineAt(node.to).number;
  for (let n = first; n <= last; n++) if (input.activeLines.has(n)) return false;
  for (const fence of node.getChildren("CodeMark")) {
    const line = input.doc.lineAt(fence.from);
    hide(context, fence.from, line.to);
    context.preview.lineStyles.push({ from: line.from, className: CODE_FENCE_CLASS });
  }
  return false;
}

/** Un lien ne montre que son texte : `[` caché, et tout ce qui suit `]` (adresse, titre, référence). */
function link(node: SyntaxNode, context: Context): undefined {
  const opening = node.firstChild;
  const textEnd = node
    .getChildren("LinkMark")
    .find((mark) => context.doc.sliceString(mark.from, mark.to) === LINK_TEXT_END);
  // Stryker disable next-line ConditionalExpression,LogicalOperator: un lien a toujours `[` et `]` ; TypeScript exige le cas contraire.
  if (!opening || !textEnd) return undefined;
  hide(context, opening.from, opening.to);
  return hide(context, textEnd.from, node.to);
}

/** Une image avec son adresse est dessinée ; une image par référence garde sa syntaxe. */
function image(node: SyntaxNode, context: Context): "skip" | undefined {
  const url = node.getChild("URL");
  if (!url) return undefined;
  const marks = node.getChildren("LinkMark");
  const altFrom = node.from + "![".length;
  // Les marques d'une image : `![`, `]`, `(`, `)` ; la deuxième ferme le texte de remplacement.
  // Stryker disable next-line OptionalChaining: une image a toujours `]` ; TypeScript exige le cas contraire.
  const altTo = marks[1]?.from ?? altFrom;
  draw(context, {
    kind: "image",
    from: node.from,
    to: node.to,
    src: context.doc.sliceString(url.from, url.to),
    alt: context.doc.sliceString(altFrom, altTo),
  });
  return "skip";
}

/** Ce qu'il faut masquer ou dessiner entre `from` et `to`, triés par position. */
export function computePreview(input: PreviewInput): Preview {
  const context: Context = { doc: input.doc, preview: { conceals: [], lineStyles: [] } };
  const frontMatter = FRONT_MATTER.exec(
    input.doc.sliceString(0, Math.min(input.doc.length, FRONT_MATTER_SCAN_LIMIT)),
  );
  const frontMatterEnd = frontMatter ? frontMatter[0].trimEnd().length : -1;
  if (frontMatter) styleLines(context, 0, frontMatterEnd, FRONT_MATTER_CLASS);
  input.tree.iterate({
    from: input.from,
    to: input.to,
    enter: (node) => visit(node, input, context, frontMatterEnd),
  });
  context.preview.conceals.sort((a, b) => a.from - b.from);
  return context.preview;
}
