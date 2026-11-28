// L'en-tête technique de la note d'un événement d'un agenda 12 (`type`, `mois`, `jour`…) : la bande de l'événement
// édite déjà ces champs, l'éditeur le replie donc sur une seule ligne « Propriétés » (spécification § 4.2). Un clic
// la déplie ; l'en-tête se modifie alors comme du texte. Le fichier ne change jamais : seul l'affichage est replié.
import {
  type AnnotationType,
  EditorState,
  type Extension,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { isAgenda12EventContent } from "../state/agenda-12";
import { frontMatterEnd } from "./front-matter";

export const PROPERTIES_TEXT = "Propriétés";

/** Déplier (vrai) ou replier (faux) l'en-tête. */
const unfold = StateEffect.define<boolean>();

/** La ligne « Propriétés » : un bouton, avant l'en-tête déplié ou à sa place s'il est replié. */
class PropertiesLine extends WidgetType {
  constructor(private readonly open: boolean) {
    super();
  }

  override eq(other: PropertiesLine): boolean {
    return other.open === this.open;
  }

  override toDOM(view: EditorView): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "agenda-properties";
    button.textContent = `${this.open ? "▾" : "▸"} ${PROPERTIES_TEXT}`;
    button.setAttribute("aria-expanded", String(this.open));
    button.addEventListener("click", () => view.dispatch({ effects: unfold.of(!this.open) }));
    return button;
  }

  /** Le bouton garde ses clics et son focus : l'éditeur n'y touche pas. */
  override ignoreEvent(): boolean {
    return true;
  }
}

interface Properties {
  readonly open: boolean;
  /** Où finit l'en-tête de l'événement ; 0 pour une note qui n'en est pas un. */
  readonly end: number;
  readonly decorations: DecorationSet;
}

function properties(state: EditorState, open: boolean): Properties {
  const end = frontMatterEnd(state.doc);
  if (end === 0 || !isAgenda12EventContent(state.doc.sliceString(0, end))) {
    return { open, end: 0, decorations: Decoration.none };
  }
  const line = open
    ? Decoration.widget({ widget: new PropertiesLine(true), block: true, side: -1 }).range(0)
    : Decoration.replace({ widget: new PropertiesLine(false), block: true }).range(0, end);
  return { open, end, decorations: Decoration.set([line]) };
}

/**
 * Replie l'en-tête d'un événement d'un agenda 12 sur la ligne « Propriétés » ; les autres notes ne sont pas touchées.
 * Replié, l'en-tête est protégé : aucune frappe, aucun collage, aucun remplacement ne l'atteint (le curseur y est invisible) ; seules
 * passent les transactions marquées `allowed` (version relue sur le disque, quand la bande réécrit une clé).
 */
export function agendaEventProperties(allowed: AnnotationType<boolean>): Extension {
  const field = StateField.define<Properties>({
    create: (state) => properties(state, false),
    update: (value, transaction) => {
      let open = value.open;
      for (const effect of transaction.effects) if (effect.is(unfold)) open = effect.value;
      if (!transaction.docChanged && open === value.open) return value;
      return properties(transaction.state, open);
    },
    provide: (f) => [
      EditorView.decorations.from(f, (value) => value.decorations),
      EditorView.atomicRanges.of((view) => view.state.field(f).decorations),
    ],
  });
  return [
    field,
    EditorState.changeFilter.of((transaction) => {
      const { open, end } = transaction.startState.field(field);
      if (open || end === 0 || transaction.annotation(allowed) === true) return true;
      // Une transaction qui commence dans l'en-tête, ou à son bord, est refusée en entier.
      let touches = false;
      transaction.changes.iterChangedRanges((from) => void (touches ||= from <= end));
      return !touches;
    }),
  ];
}
