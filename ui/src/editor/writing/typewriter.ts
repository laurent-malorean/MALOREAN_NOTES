// Mode machine à écrire : la ligne où l'on écrit reste au milieu de l'écran.
import {
  EditorState,
  type Extension,
  StateEffect,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/** Le mode machine à écrire est-il en marche ? */
export type Typewriter = "on" | "off";

/** Le mode vient d'être mis en marche : la ligne du curseur va au centre sans attendre. */
const started = StateEffect.define<null>();

/** On a tapé, ou déplacé le curseur. */
const moved = (transaction: Transaction) => transaction.selection || transaction.docChanged;

/** On a tapé, déplacé le curseur, ou mis le mode en marche. */
const centringAsked = (transaction: Transaction) =>
  moved(transaction) || transaction.effects.some((effect) => effect.is(started));

/** Ramène la ligne du curseur au centre de l'éditeur. */
const centred = (head: number) => EditorView.scrollIntoView(head, { y: "center" });

/** Chaque déplacement du curseur ou chaque frappe ramène la ligne en cours au centre. */
const centredCursor = EditorState.transactionExtender.of((transaction) =>
  moved(transaction) ? { effects: centred(transaction.newSelection.main.head) } : null,
);

/**
 * Marge en haut et en bas du texte, juste assez pour que la première et la dernière ligne
 * puissent venir au centre : la moitié de la hauteur visible, moins ce qui est déjà en marge.
 */
function margin(view: EditorView): string {
  const scrollerPadding = Number.parseFloat(getComputedStyle(view.scrollDOM).paddingTop);
  const half = view.scrollDOM.clientHeight / 2;
  return `${Math.max(0, half - scrollerPadding - view.defaultLineHeight / 2)}px`;
}

/**
 * Le centrage commence quand on met le mode en marche, à la première frappe ou au premier
 * déplacement du curseur : une note qu'on ouvre se montre d'abord depuis son début.
 */
const centring = ViewPlugin.fromClass(
  class {
    private started = false;
    /** La taille visible à la dernière mesure, pour ne réagir qu'à un vrai changement. */
    private size: string;
    /** La hauteur ou la largeur visible change : la marge suit, la ligne revient au centre. */
    private readonly resizing = new ResizeObserver(() => this.resized());
    constructor(readonly view: EditorView) {
      this.size = this.measuredSize();
      this.resizing.observe(view.scrollDOM);
    }
    measuredSize() {
      return `${this.view.scrollDOM.clientWidth}x${this.view.scrollDOM.clientHeight}`;
    }
    update(update: ViewUpdate) {
      if (this.started || !update.transactions.some(centringAsked)) return;
      this.started = true;
      this.setMargin(margin(this.view));
    }
    resized() {
      const size = this.measuredSize();
      const changed = size !== this.size;
      this.size = size;
      if (!this.started || !changed) return;
      this.setMargin(margin(this.view));
      this.view.dispatch({ effects: centred(this.view.state.selection.main.head) });
    }
    setMargin(value: string) {
      this.view.contentDOM.style.paddingTop = value;
      this.view.contentDOM.style.paddingBottom = value;
    }
    destroy() {
      this.resizing.disconnect();
      // La marge du haut s'en va : le défilement recule d'autant, et le texte reste en place.
      const shift = Number.parseFloat(this.view.contentDOM.style.paddingTop) || 0;
      this.setMargin("");
      this.view.scrollDOM.scrollTop -= shift;
    }
  },
);

/** À envoyer juste après la mise en marche : la marge apparaît, la ligne du curseur va au centre. */
export function typewriterStarted(state: EditorState): TransactionSpec {
  return { effects: [started.of(null), centred(state.selection.main.head)] };
}

/** L'extension du mode : le curseur centré, et la marge qui le permet jusqu'aux bords du texte. */
export function typewriterMode(mode: Typewriter): Extension {
  return mode === "off" ? [] : [centredCursor, centring];
}
