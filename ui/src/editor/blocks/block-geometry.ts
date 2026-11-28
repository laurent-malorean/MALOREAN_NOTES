// Où sont les blocs à l'écran : les repères de l'éditeur (boutons de la marge, repère de dépôt, retrait grisé)
// sont posés dans la zone défilante, en coordonnées de son contenu, pour défiler avec le texte.
import type { EditorView } from "@codemirror/view";
import type { TextBlock } from "./read-blocks";

/** Un trait vertical dans la zone défilante, de `top` à `bottom`. */
export interface Span {
  readonly top: number;
  readonly bottom: number;
}

/** La position à l'écran de `clientY`, comptée dans le contenu de la zone défilante. */
export function inScroller(view: EditorView, clientY: number): number {
  const { scrollDOM } = view;
  return (
    clientY - scrollDOM.getBoundingClientRect().top + scrollDOM.scrollTop - scrollDOM.clientTop
  );
}

/** De la première à la dernière ligne du bloc, dans le contenu de la zone défilante. */
export function spanOf(view: EditorView, block: TextBlock): Span {
  const first = view.lineBlockAt(block.from);
  const last = view.lineBlockAt(block.to);
  const top = inScroller(view, view.documentTop + first.top);
  return { top, bottom: inScroller(view, view.documentTop + last.bottom) };
}

/** Le haut et la hauteur de la première ligne du bloc, dans le contenu de la zone défilante. */
export function firstLineOf(view: EditorView, block: TextBlock): Span {
  const line = view.lineBlockAt(block.from);
  const top = inScroller(view, view.documentTop + line.top);
  return { top, bottom: top + line.height };
}

/** Les bords gauche et droit du texte (sans la marge), dans le contenu de la zone défilante. */
export function textColumn(view: EditorView): { readonly left: number; readonly width: number } {
  const { scrollDOM, contentDOM } = view;
  const style = getComputedStyle(contentDOM);
  const box = contentDOM.getBoundingClientRect();
  const origin =
    scrollDOM.getBoundingClientRect().left - scrollDOM.scrollLeft + scrollDOM.clientLeft;
  const left = box.left + Number.parseFloat(style.paddingLeft) - origin;
  const right = box.right - Number.parseFloat(style.paddingRight) - origin;
  return { left, width: right - left };
}

/** Le bloc dont une ligne est à la hauteur `clientY` : le plus profond, ou `null` entre deux blocs. */
export function blockAtHeight(
  view: EditorView,
  blocks: readonly TextBlock[],
  clientY: number,
): number | null {
  const height = clientY - view.documentTop;
  if (height < 0 || height > view.contentHeight) return null;
  const line = view.state.doc.lineAt(view.lineBlockAtHeight(height).from).number;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i] as TextBlock;
    if (block.first <= line && line <= block.last) return i;
  }
  return null;
}
