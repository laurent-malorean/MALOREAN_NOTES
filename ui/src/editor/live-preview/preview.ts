// Aperçu en direct : ce qu'il faut masquer ou dessiner, calculé sans toucher à l'écran.
// Le fichier n'est jamais modifié : seule l'apparence change, sauf sur les lignes où l'on écrit.
import type { Text } from "@codemirror/state";
import type { SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";

export type Conceal =
  | { kind: "hide"; from: number; to: number }
  | { kind: "bullet"; from: number; to: number }
  | { kind: "checkbox"; from: number; to: number; checked: boolean }
  | { kind: "rule"; from: number; to: number };

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

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const UNTOUCHED_BLOCKS = new Set(["FencedCode", "CodeBlock", "HTMLBlock", "CommentBlock"]);
const LINK_PARTS = new Set(["LinkMark", "URL", "LinkTitle", "LinkLabel"]);
const CHECKED = /\[[xX]\]/;

/** La case cochée devient décochée, et inversement. */
export function toggledTaskMarker(marker: string): string {
  return CHECKED.test(marker) ? "[ ]" : "[x]";
}

interface Context {
  doc: Text;
  preview: Preview;
}

type Handler = (node: SyntaxNode, context: Context) => void;

const withSpace = (doc: Text, to: number) => (doc.sliceString(to, to + 1) === " " ? to + 1 : to);
const parentName = (node: SyntaxNode) => node.parent?.name ?? "";

function hide(context: Context, from: number, to: number) {
  context.preview.conceals.push({ kind: "hide", from, to });
}

const HANDLERS: Record<string, Handler> = {
  HeaderMark: (node, c) => {
    if (parentName(node).startsWith("ATXHeading")) hide(c, node.from, withSpace(c.doc, node.to));
  },
  EmphasisMark: (node, c) => hide(c, node.from, node.to),
  StrikethroughMark: (node, c) => hide(c, node.from, node.to),
  CodeMark: (node, c) => {
    if (parentName(node) === "InlineCode") hide(c, node.from, node.to);
  },
  QuoteMark: (node, c) => hide(c, node.from, withSpace(c.doc, node.to)),
  ListMark: (node, c) => listMark(node, c),
  TaskMarker: (node, c) => {
    const checked = CHECKED.test(c.doc.sliceString(node.from, node.to));
    c.preview.conceals.push({ kind: "checkbox", from: node.from, to: node.to, checked });
  },
  HorizontalRule: (node, c) =>
    c.preview.conceals.push({ kind: "rule", from: node.from, to: node.to }),
};

function listMark(node: SyntaxNode, context: Context) {
  const item = node.parent;
  const to = withSpace(context.doc, node.to);
  if (item?.getChild("Task")) return hide(context, node.from, to);
  if (parentName(item ?? node) === "BulletList") {
    context.preview.conceals.push({ kind: "bullet", from: node.from, to });
  }
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
  if (node.to <= frontMatterEnd && node.name !== "Document") return false;
  if (UNTOUCHED_BLOCKS.has(node.name)) return false;
  if (node.name === "Blockquote") styleLines(context, node.from, node.to, QUOTE_CLASS);
  if (isActive(input, node)) return true;
  const handler = LINK_PARTS.has(node.name) ? linkPart : HANDLERS[node.name];
  handler?.(node.node, context);
  return true;
}

const linkPart: Handler = (node, c) => {
  if (parentName(node) === "Link") hide(c, node.from, node.to);
};

/** Ce qu'il faut masquer ou dessiner entre `from` et `to`, triés par position. */
export function computePreview(input: PreviewInput): Preview {
  const context: Context = { doc: input.doc, preview: { conceals: [], lineStyles: [] } };
  const frontMatter = FRONT_MATTER.exec(
    input.doc.sliceString(0, Math.min(input.doc.length, 10_000)),
  );
  const frontMatterEnd = frontMatter ? frontMatter[0].replace(/\r?\n$/, "").length : -1;
  if (frontMatter) styleLines(context, 0, frontMatterEnd, FRONT_MATTER_CLASS);
  input.tree.iterate({
    from: input.from ?? 0,
    to: input.to ?? input.doc.length,
    enter: (node) => visit(node, input, context, frontMatterEnd),
  });
  context.preview.conceals.sort((a, b) => a.from - b.from);
  return context.preview;
}
