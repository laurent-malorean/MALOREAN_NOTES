// Clic sur un lien : un simple clic sur son texte l'ouvre, comme dans Obsidian, sans placer le
// curseur ; un clic qui glisse sélectionne du texte ; un clic à côté du texte place le curseur.
import type { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** Un lien sous le pointeur : la place de son texte montré, et ce qui l'ouvre. */
export interface ClickedLink {
  readonly from: number;
  readonly to: number;
  open(): void;
}

/**
 * Les liens qui peuvent être sous le pointeur, près de la position `pos` ; celui dont le texte
 * est vraiment sous le pointeur est choisi à l'écran.
 */
export type LinkFinder = (state: EditorState, pos: number) => readonly ClickedLink[];

/** Au-delà de ce déplacement, en pixels, le bouton enfoncé, le clic devient une sélection. */
export const DRAG_DISTANCE = 4;

interface Point {
  readonly clientX: number;
  readonly clientY: number;
}

const coords = (event: Point) => ({ x: event.clientX, y: event.clientY });

/** Le pointeur est-il sur le texte montré du lien, et pas seulement à côté ? */
function onText(view: EditorView, link: ClickedLink, event: Point): boolean {
  const start = view.domAtPos(link.from);
  const end = view.domAtPos(link.to);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  // Stryker disable EqualityOperator: un pointeur exactement sur le bord d'une boîte de texte — les deux lectures conviennent.
  return [...range.getClientRects()].some(
    (box) =>
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom,
  );
  // Stryker restore EqualityOperator
}

/**
 * Le bouton relâché sans avoir bougé : le lien s'ouvre. Bougé de plus de `DRAG_DISTANCE` :
 * l'éditeur prend le focus et la sélection suit le pointeur, du point de départ, sans rien ouvrir.
 */
function follow(view: EditorView, down: MouseEvent, link: ClickedLink) {
  // Stryker disable next-line BooleanLiteral: le bouton s'est enfoncé sur le texte du lien, où les deux modes donnent la même position.
  const anchor = view.posAtCoords(coords(down), false);
  let dragging = false;
  const move = (event: MouseEvent) => {
    if (!dragging) {
      const distance = Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY);
      if (distance <= DRAG_DISTANCE) return;
      dragging = true;
      view.focus();
    }
    // Stryker disable next-line BooleanLiteral: dans WebKit, les deux modes donnent la position la plus proche, même après la fin de la ligne ou sous le texte (mesuré par les tests).
    view.dispatch({ selection: { anchor, head: view.posAtCoords(coords(event), false) } });
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    if (!dragging) link.open();
  };
  document.addEventListener("mousemove", move);
  // Stryker disable next-line ObjectLiteral,BooleanLiteral: un relâchement de plus ne rouvre rien, le glissement étant fini.
  document.addEventListener("mouseup", up, { once: true });
}

/**
 * Un clic sans touche : Cmd, Maj, Alt et Ctrl gardent leur effet. Les autres boutons que le
 * principal n'arrivent pas jusqu'ici : CodeMirror ne les transmet pas (mesuré par les tests).
 */
const plainClick = (event: MouseEvent) =>
  !event.metaKey && !event.shiftKey && !event.altKey && !event.ctrlKey;

/** Un simple clic sur le texte d'un lien trouvé par `find` l'ouvre au relâchement du bouton. */
export function linkClicks(find: LinkFinder): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!plainClick(event)) return false;
      const pos = view.posAtCoords(coords(event));
      // Stryker disable next-line ConditionalExpression,BooleanLiteral: un clic reçu par l'éditeur a toujours une position ; TypeScript exige le cas contraire.
      if (pos === null) return false;
      const link = find(view.state, pos).find((candidate) => onText(view, candidate, event));
      if (link === undefined) return false;
      follow(view, event, link);
      return true;
    },
  });
}
