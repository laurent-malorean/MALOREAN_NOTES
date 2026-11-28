// Glisser la poignée d'un bloc (spécification « deplacer-un-bloc », § 5) : aux événements du pointeur, comme le
// glisser du CRM (fiche 0060), pour marcher aussi dans la fenêtre de l'application. Le geste commence après
// 4 points de mouvement ; avant, c'est un clic, qui ne fait rien. Le bloc se grise à sa place, le repère de
// dépôt suit le pointeur entre les blocs, Échap abandonne, la note défile près de ses bords.
import { isolateHistory } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { inScroller, spanOf, textColumn } from "./block-geometry";
import { canDrop, changeBetween, moveBlock } from "./move-block";
import type { TextBlock } from "./read-blocks";

/** Le mouvement, en points, avant lequel un appui reste un clic. */
const THRESHOLD = 4;
/** À moins de ce nombre de points du haut ou du bas de la zone visible, la note défile. */
const EDGE = 48;
/** De combien de points la note défile à chaque pas, et le délai entre deux pas (millisecondes). */
const SCROLL_STEP = 20;
const SCROLL_DELAY = 16;

/** Un glissement en cours : on peut l'abandonner. */
export interface BlockDrag {
  cancel(): void;
}

/** Le haut de la place `slot` : la première ligne du bloc devant lequel on dépose, ou le bas de la note. */
function slotTop(view: EditorView, blocks: readonly TextBlock[], slot: number): number {
  const next = blocks[slot];
  return next
    ? view.lineBlockAt(next.from).top
    : view.lineBlockAt((blocks.at(-1) as TextBlock).to).bottom;
}

function overlay(view: EditorView, className: string): HTMLElement {
  const element = document.createElement("div");
  element.className = className;
  view.scrollDOM.append(element);
  return element;
}

/** Pose un repère sur toute la largeur du texte, à `top` ; `height` si le repère n'a pas sa hauteur propre. */
function place(view: EditorView, element: HTMLElement, top: number, height?: number): void {
  const { left, width } = textColumn(view);
  element.style.top = `${String(top)}px`;
  if (height !== undefined) element.style.height = `${String(height)}px`;
  element.style.left = `${String(left)}px`;
  element.style.width = `${String(width)}px`;
}

class Dragging implements BlockDrag {
  private readonly text: string;
  private readonly origin: { readonly x: number; readonly y: number };
  private pointerY: number;
  private veil: HTMLElement | null = null;
  private mark: HTMLElement | null = null;
  private target: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private over = false;

  constructor(
    private readonly view: EditorView,
    private readonly blocks: readonly TextBlock[],
    private readonly index: number,
    event: PointerEvent,
    private readonly end: () => void,
  ) {
    this.text = view.state.doc.toString();
    this.origin = { x: event.clientX, y: event.clientY };
    this.pointerY = event.clientY;
    document.addEventListener("pointermove", this.move);
    document.addEventListener("pointerup", this.up);
    document.addEventListener("pointercancel", this.cancelled);
    document.addEventListener("keydown", this.key, true);
  }

  /** La place de dépôt la plus proche du pointeur ; elle n'est visée que si le bloc peut y être posé. */
  private aim(): void {
    const { view, blocks } = this;
    const pointer = this.pointerY - view.documentTop;
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    for (let slot = 0; slot <= blocks.length; slot++) {
      const away = Math.abs(slotTop(view, blocks, slot) - pointer);
      if (away < distance) [nearest, distance] = [slot, away];
    }
    const accepted = canDrop(blocks, this.index, nearest);
    this.target = accepted ? nearest : null;
    if (this.mark === null) return;
    this.mark.hidden = !accepted;
    if (accepted) {
      place(view, this.mark, inScroller(view, view.documentTop + slotTop(view, blocks, nearest)));
    }
  }

  private begin(): void {
    const { view } = this;
    this.veil = overlay(view, "cm-block-dragged");
    this.mark = overlay(view, "cm-block-drop-mark");
    const span = spanOf(view, this.blocks[this.index] as TextBlock);
    place(view, this.veil, span.top, span.bottom - span.top);
    view.dom.classList.add("cm-block-dragging");
  }

  private stopScrolling(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** La note défile tant que le pointeur reste contre le haut ou le bas de la zone visible. */
  private scrollNearEdge(): void {
    const box = this.view.scrollDOM.getBoundingClientRect();
    const direction =
      this.pointerY < box.top + EDGE ? -1 : this.pointerY > box.bottom - EDGE ? 1 : 0;
    if (direction === 0) return this.stopScrolling();
    this.timer ??= setInterval(() => {
      this.view.scrollDOM.scrollTop += direction * SCROLL_STEP;
      this.aim();
    }, SCROLL_DELAY);
  }

  private readonly move = (event: PointerEvent): void => {
    this.pointerY = event.clientY;
    if (this.veil === null) {
      if (Math.hypot(event.clientX - this.origin.x, event.clientY - this.origin.y) < THRESHOLD)
        return;
      this.begin();
    }
    this.aim();
    this.scrollNearEdge();
  };

  private readonly up = (event: PointerEvent): void => {
    this.pointerY = event.clientY;
    const dragging = this.veil !== null;
    if (dragging) this.aim();
    const slot = this.target;
    this.cancel();
    if (!dragging || slot === null) return;
    this.drop(slot);
  };

  /** Pose le bloc : une seule transaction, une seule étape d'annulation, le curseur dans le bloc déplacé. */
  private drop(slot: number): void {
    const { view, text } = this;
    const moved = moveBlock(text, this.blocks, this.index, slot);
    if (moved === null) return;
    view.dispatch({
      changes: changeBetween(text, moved.text),
      selection: { anchor: moved.cursor },
      scrollIntoView: true,
      userEvent: "move.block",
      annotations: isolateHistory.of("full"),
    });
    view.focus();
  }

  private readonly cancelled = (): void => this.cancel();

  private readonly key = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    this.cancel();
  };

  /** Efface les repères et rend la main ; sans effet la seconde fois. */
  cancel(): void {
    if (this.over) return;
    this.over = true;
    this.stopScrolling();
    document.removeEventListener("pointermove", this.move);
    document.removeEventListener("pointerup", this.up);
    document.removeEventListener("pointercancel", this.cancelled);
    document.removeEventListener("keydown", this.key, true);
    this.veil?.remove();
    this.mark?.remove();
    this.view.dom.classList.remove("cm-block-dragging");
    this.end();
  }
}

/**
 * Suit le pointeur à partir de l'appui `event` sur la poignée du bloc `index`. `end` est appelé une seule
 * fois, quand le glissement ou l'appui s'achève, déposé ou abandonné. `null` pour un autre bouton que le
 * premier.
 */
export function startBlockDrag(
  view: EditorView,
  blocks: readonly TextBlock[],
  index: number,
  event: PointerEvent,
  end: () => void,
): BlockDrag | null {
  return event.button === 0 ? new Dragging(view, blocks, index, event, end) : null;
}
