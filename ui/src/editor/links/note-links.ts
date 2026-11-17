// Liens entre notes : `[[titre]]` dans le texte, mis en forme ; Cmd+clic ouvre la note visée.
import { type Extension, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

const OPENING = "[[";
const CLOSING = "]]";
/** Sépare le titre visé du texte montré : `[[titre|texte]]`. */
const SHOWN_TEXT = "|";

/** Un lien du texte : sa place, crochets compris, le titre visé et la place du texte montré. */
export interface NoteLink {
  readonly from: number;
  readonly to: number;
  readonly title: string;
  readonly textFrom: number;
  readonly textTo: number;
}

/**
 * Les liens du texte, dans l'ordre. Mêmes règles que côté Rust (domaine, `links`) : un lien
 * vide ou coupé par un retour à la ligne n'en est pas un ; l'ouverture la plus proche compte.
 */
export function noteLinksIn(text: string): NoteLink[] {
  const links: NoteLink[] = [];
  let searchFrom = 0;
  for (let end = text.indexOf(CLOSING); end !== -1; end = text.indexOf(CLOSING, searchFrom)) {
    // L'ouverture se cherche après le lien précédent, jamais à cheval sur lui.
    const opening = text.lastIndexOf(OPENING, end - OPENING.length);
    const segmentStart = searchFrom;
    searchFrom = end + CLOSING.length;
    if (opening < segmentStart) continue;
    const insideFrom = opening + OPENING.length;
    const inside = text.slice(insideFrom, end);
    const bar = inside.indexOf(SHOWN_TEXT);
    const title = (bar === -1 ? inside : inside.slice(0, bar)).trim();
    if (title === "" || inside.includes("\n")) continue;
    // Sans barre, `indexOf` rend -1 : le texte montré commence alors au titre.
    const textFrom = insideFrom + bar + SHOWN_TEXT.length;
    links.push({ from: opening, to: searchFrom, title, textFrom, textTo: end });
  }
  return links;
}

/** Le titre visé par le lien qui contient la position `pos` du texte, ou rien. */
export function noteLinkAt(text: string, pos: number): string | null {
  return noteLinksIn(text).find((link) => link.from <= pos && pos <= link.to)?.title ?? null;
}

const linkMark = Decoration.mark({ class: "cm-note-link-mark" });
const linkText = Decoration.mark({ class: "cm-note-link" });

function decorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const line = view.state.doc.lineAt(from);
    const start = line.from;
    const text = view.state.sliceDoc(start, view.state.doc.lineAt(to).to);
    for (const link of noteLinksIn(text)) {
      builder.add(start + link.from, start + link.textFrom, linkMark);
      builder.add(start + link.textFrom, start + link.textTo, linkText);
      builder.add(start + link.textTo, start + link.to, linkMark);
    }
  }
  return builder.finish();
}

const linkStyle = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorations(view);
    }
    update(update: ViewUpdate) {
      // Stryker disable next-line ConditionalExpression: optimisation — tout redécorer à chaque mise à jour donnerait le même affichage.
      if (update.docChanged || update.viewportChanged) this.decorations = decorations(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Les liens entre notes : mis en forme ; Cmd+clic sur l'un d'eux appelle `open` avec son titre. */
export function noteLinks(open: (title: string) => void): Extension {
  return [
    linkStyle,
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (!event.metaKey) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        // Stryker disable next-line ConditionalExpression,BooleanLiteral: un clic reçu par l'éditeur a toujours une position ; TypeScript exige le cas contraire.
        if (pos === null) return false;
        const line = view.state.doc.lineAt(pos);
        const title = noteLinkAt(line.text, pos - line.from);
        if (title === null) return false;
        open(title);
        return true;
      },
    }),
  ];
}
