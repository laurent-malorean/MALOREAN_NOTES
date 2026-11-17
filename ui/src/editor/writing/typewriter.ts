// Mode machine à écrire : la ligne où l'on écrit reste au milieu de l'écran.
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";

/** Le mode machine à écrire est-il en marche ? */
export type Typewriter = "on" | "off";

/** Chaque déplacement du curseur ou chaque frappe ramène la ligne en cours au centre. */
const centredCursor = EditorState.transactionExtender.of((transaction) =>
  transaction.selection || transaction.docChanged
    ? { effects: EditorView.scrollIntoView(transaction.newSelection.main.head, { y: "center" }) }
    : null,
);

/**
 * Marge en haut et en bas du texte, juste assez pour que la première et la dernière ligne
 * puissent venir au centre : la moitié de la hauteur visible, moins ce qui est déjà en marge.
 */
const centringMargin = ViewPlugin.fromClass(
  class {
    /** La hauteur visible change avec la fenêtre : la marge suit. */
    private readonly resizing = new ResizeObserver(() => this.measure());
    constructor(readonly view: EditorView) {
      this.resizing.observe(view.scrollDOM);
    }
    measure() {
      this.view.requestMeasure({
        read: (view) => {
          const scrollerPadding = Number.parseFloat(getComputedStyle(view.scrollDOM).paddingTop);
          const half = view.scrollDOM.clientHeight / 2;
          return `${Math.max(0, half - scrollerPadding - view.defaultLineHeight / 2)}px`;
        },
        write: (margin, view) => {
          view.contentDOM.style.paddingTop = margin;
          view.contentDOM.style.paddingBottom = margin;
        },
      });
    }
    destroy() {
      // Sans quoi une mesure arrivée après l'arrêt remettrait la marge.
      this.resizing.disconnect();
      this.view.contentDOM.style.paddingTop = "";
      this.view.contentDOM.style.paddingBottom = "";
    }
  },
);

/** L'extension du mode : le curseur centré, et la marge qui le permet jusqu'aux bords du texte. */
export function typewriterMode(mode: Typewriter): Extension {
  return mode === "off" ? [] : [centredCursor, centringMargin];
}
