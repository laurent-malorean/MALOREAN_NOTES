// Les blocs de texte d'une note (spécification « deplacer-un-bloc », § 3) : lus dans l'arbre syntaxique du
// Markdown, au premier niveau, jamais par une expression régulière sur le texte.
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";
import { frontMatterEnd } from "../front-matter";

/** Le temps (millisecondes) laissé à l'analyse d'une note longue avant de lire l'arbre tel qu'il est. */
const PARSE_TIMEOUT = 1000;

export type BlockKind =
  "paragraph" | "heading" | "list-item" | "quote" | "code" | "table" | "rule" | "other";

/** Ce que dit un élément de liste de sa place dans sa liste. */
export interface ListItemInfo {
  readonly ordered: boolean;
  /** Le nombre de caractères avant sa marque. */
  readonly indent: number;
  /** Le numéro écrit d'un élément numéroté ; 0 pour une puce. */
  readonly number: number;
  /** Le nombre de chiffres de ce numéro ; 0 pour une puce. */
  readonly digits: number;
  /** La liste du premier niveau qui le contient : deux éléments de la même liste ont le même `listId`. */
  readonly listId: number;
  /** Le numéro du premier élément de sa liste (celle des éléments voisins de son niveau) ; 0 pour une puce. */
  readonly start: number;
  /** Une case à cocher suit la marque : un nouvel élément à sa suite en a une aussi. */
  readonly task: boolean;
}

/**
 * Un bloc de texte : ses lignes (numérotées à partir de 1, comme CodeMirror), ses positions, et pour un
 * élément de liste son retrait et son numéro. Les blocs viennent dans l'ordre de la note ; un élément de
 * liste vient avant ses sous-éléments, qui sont aussi des blocs : `descendants` en donne le nombre, ils
 * suivent aussitôt.
 */
export interface TextBlock {
  readonly kind: BlockKind;
  readonly first: number;
  readonly last: number;
  readonly from: number;
  readonly to: number;
  readonly descendants: number;
  readonly list?: ListItemInfo;
}

const KINDS: Readonly<Record<string, BlockKind>> = {
  Paragraph: "paragraph",
  Blockquote: "quote",
  FencedCode: "code",
  CodeBlock: "code",
  Table: "table",
  HorizontalRule: "rule",
};
const HEADING = /^(?:ATX|Setext)Heading/;
const LISTS = new Set(["BulletList", "OrderedList"]);

function kindOf(name: string): BlockKind {
  return HEADING.test(name) ? "heading" : (KINDS[name] ?? "other");
}

/** Les éléments (directs) d'une liste, dans l'ordre. */
function itemsOf(list: SyntaxNode): SyntaxNode[] {
  const items: SyntaxNode[] = [];
  for (let child = list.firstChild; child; child = child.nextSibling) {
    if (child.name === "ListItem") items.push(child);
  }
  return items;
}

/** Les listes (directes) d'un élément : ses sous-éléments. */
function listsOf(item: SyntaxNode): SyntaxNode[] {
  const lists: SyntaxNode[] = [];
  for (let child = item.firstChild; child; child = child.nextSibling) {
    if (LISTS.has(child.name)) lists.push(child);
  }
  return lists;
}

function reader(state: EditorState) {
  const { doc } = state;
  const blocks: TextBlock[] = [];

  const push = (node: SyntaxNode, kind: BlockKind, list?: ListItemInfo): number => {
    const first = doc.lineAt(node.from);
    const last = doc.lineAt(node.to);
    const at = blocks.length;
    blocks.push({
      kind,
      first: first.number,
      last: last.number,
      from: first.from,
      to: last.to,
      descendants: 0,
      ...(list && { list }),
    });
    return at;
  };

  /** Un élément et, à sa suite, ses sous-éléments. */
  const addItem = (item: SyntaxNode, listId: number, start: number): void => {
    const mark = item.getChild("ListMark") as SyntaxNode;
    const ordered = (item.parent as SyntaxNode).name === "OrderedList";
    const indent = mark.from - doc.lineAt(mark.from).from;
    const digits = ordered ? mark.to - mark.from - 1 : 0;
    const number = ordered ? Number.parseInt(state.sliceDoc(mark.from, mark.to), 10) : 0;
    const task = item.getChild("Task") !== null;
    const at = push(item, "list-item", { ordered, indent, number, digits, listId, start, task });
    for (const list of listsOf(item)) addList(list, listId);
    const block = blocks[at] as TextBlock;
    blocks[at] = { ...block, descendants: blocks.length - at - 1 };
  };

  const addList = (list: SyntaxNode, listId: number): void => {
    const items = itemsOf(list);
    const first = items[0] as SyntaxNode;
    const start =
      list.name === "OrderedList" ? Number.parseInt(state.sliceDoc(first.from, first.to), 10) : 0;
    for (const item of items) addItem(item, listId, start);
  };

  return { blocks, push, addList };
}

/** L'arbre syntaxique de toute la note (l'analyse d'une longue note se termine ici, plutôt qu'en tâche de fond). */
export function wholeTree(state: EditorState): Tree {
  return ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT) ?? syntaxTree(state);
}

/** Les blocs de texte de la note, dans l'ordre ; l'en-tête YAML n'en est pas un. */
export function readBlocks(state: EditorState): readonly TextBlock[] {
  const tree = wholeTree(state);
  const headerEnd = frontMatterEnd(state.doc);
  const { blocks, push, addList } = reader(state);
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.from < headerEnd) continue;
    if (LISTS.has(node.name)) addList(node, node.from);
    else push(node, kindOf(node.name));
  }
  return blocks;
}
