// Saisie vocale dans l'éditeur (spécification « saisie-vocale », §§ 5 et 10) : le texte provisoire est un
// décor grisé à la suite du curseur (jamais du contenu, ni de l'historique d'annulation) ; le texte fixé
// entre dans la note comme s'il avait été tapé, et une écoute forme une seule étape d'annulation.
import { isolateHistory } from "@codemirror/commands";
import {
  Annotation,
  type AnnotationType,
  type Extension,
  StateEffect,
  StateField,
  type TransactionSpec,
} from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import "./provisional.css";

/** Ce que l'éditeur offre à la saisie vocale ; le texte est celui du moteur, tel quel. */
export interface Dictation {
  /** L'écoute commence au curseur ; l'éditeur prend le focus. */
  begin(): void;
  /** Le texte provisoire en entier : il remplace le précédent ; vide, le décor s'efface. */
  provisional(text: string): void;
  /** Le texte fixé : il entre dans la note au curseur, qui passe à sa suite. */
  fixed(text: string): void;
  /** Fin de l'écoute : le texte provisoire en cours est fixé tel quel, l'étape d'annulation est close. */
  end(): void;
  /** Abandon sans rien écrire (l'éditeur change de note ou disparaît). */
  drop(): void;
  /** Une écoute est-elle en cours dans cet éditeur ? */
  listening(): boolean;
}

/**
 * Le texte tel qu'il s'écrit après `before` (le caractère qui précède le curseur, vide au début de la note) :
 * aucun blanc au début si le curseur suit un blanc, un début de ligne ou de note ; un blanc de séparation
 * sinon, sauf si le texte commence déjà par un blanc.
 */
export function spaced(before: string, text: string): string {
  if (text === "") return "";
  if (before === "" || /\s/.test(before)) return text.trimStart();
  return /^\s/.test(text) ? text : ` ${text}`;
}

/** Le texte provisoire montré : où, et quoi. */
interface Shown {
  readonly pos: number;
  readonly text: string;
}

const shownSet = StateEffect.define<Shown | null>();

class ProvisionalText extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }

  override eq(other: ProvisionalText): boolean {
    return other.text === this.text;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-voice-provisional";
    span.textContent = this.text;
    return span;
  }
}

/** Le décor : suit les changements (un autre texte tapé avant lui le déplace), et ne fait pas partie du contenu. */
const shownField = StateField.define<Shown | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(shownSet)) return effect.value;
    return value && { pos: transaction.changes.mapPos(value.pos, 1), text: value.text };
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) =>
      value
        ? Decoration.set([
            Decoration.widget({ widget: new ProvisionalText(value.text), side: 1 }).range(
              value.pos,
            ),
          ])
        : Decoration.none,
    ),
});

/** Marque ce que la saisie vocale écrit : ce n'est pas un geste de l'utilisateur. */
const ours = Annotation.define<boolean>();

/** Un texte tapé à la main (fixé ou pas) ouvre une étape d'annulation ; la suite de l'écoute la rejoint. */
const FIRST_WRITE = "input.type";
const NEXT_WRITE = "input.type.compose";

class VoiceDictation implements Dictation {
  private view: EditorView | null = null;
  private active = false;
  /** Une nouvelle étape d'annulation s'ouvre à la prochaine écriture. */
  private fresh = true;
  /** Le texte du moteur déjà écrit par l'interface (§ 5.2) : le moteur le répète dans ses textes suivants. */
  private consumed = "";
  /** Le dernier texte provisoire reçu du moteur. */
  private last = "";
  readonly extension: Extension;

  constructor(private readonly fromElsewhere: AnnotationType<boolean>) {
    this.extension = [shownField, EditorView.updateListener.of((update) => this.watch(update))];
  }

  bind(view: EditorView): void {
    this.view = view;
  }

  listening(): boolean {
    return this.active;
  }

  begin(): void {
    this.view?.focus();
    this.active = true;
    this.fresh = true;
    this.consumed = "";
    this.last = "";
  }

  provisional(text: string): void {
    const view = this.view;
    if (!this.active || view === null) return;
    this.last = text;
    const { head } = view.state.selection.main;
    const shown = spaced(this.before(head), this.rest(text));
    view.dispatch({
      effects: shownSet.of(shown === "" ? null : { pos: head, text: shown }),
      annotations: ours.of(true),
      scrollIntoView: true,
    });
  }

  fixed(text: string): void {
    const view = this.view;
    if (!this.active || view === null) return;
    const rest = this.rest(text);
    this.consumed = "";
    this.last = "";
    const { from, to } = view.state.selection.main;
    const insert = spaced(this.before(from), rest);
    this.write(view, { from, to, insert }, from + insert.length);
  }

  end(): void {
    const view = this.view;
    if (!this.active || view === null) return;
    this.settle(view);
    this.active = false;
    // La frappe qui suit n'est pas dans l'étape de la saisie vocale.
    view.dispatch({ annotations: [ours.of(true), isolateHistory.of("full")] });
  }

  drop(): void {
    this.active = false;
  }

  /** Le texte du moteur, sans ce que l'interface a déjà écrit ; s'il n'en est plus la suite, tel quel. */
  private rest(text: string): string {
    if (this.consumed === "" || !text.startsWith(this.consumed)) {
      this.consumed = "";
      return text;
    }
    return text.slice(this.consumed.length);
  }

  private before(pos: number): string {
    return pos === 0 ? "" : (this.view as EditorView).state.sliceDoc(pos - 1, pos);
  }

  /** Écrit `change` (si le texte n'est pas vide), efface le décor, et amène le curseur à `cursor` (`null` : il suit les changements). */
  private write(
    view: EditorView,
    change: { readonly from: number; readonly to: number; readonly insert: string },
    cursor: number | null,
  ): void {
    const annotations: Annotation<unknown>[] = [ours.of(true)];
    if (this.fresh) annotations.push(isolateHistory.of("before"));
    const written = change.insert !== "";
    const spec: TransactionSpec = {
      effects: shownSet.of(null),
      annotations,
      scrollIntoView: true,
      ...(written && {
        changes: change,
        ...(cursor !== null && { selection: { anchor: cursor } }),
        userEvent: this.fresh ? FIRST_WRITE : NEXT_WRITE,
      }),
    };
    view.dispatch(spec);
    if (written) this.fresh = false;
  }

  /** Le texte provisoire en cours devient du texte fixé, tel que l'utilisateur le voit. */
  private settle(view: EditorView): void {
    const shown = view.state.field(shownField);
    if (shown === null) return;
    const { main } = view.state.selection;
    const cursorHere = main.empty && main.head === shown.pos;
    this.write(
      view,
      { from: shown.pos, to: shown.pos, insert: shown.text },
      cursorHere ? shown.pos + shown.text.length : null,
    );
    this.consumed = this.last;
  }

  /**
   * L'utilisateur tape ou déplace le curseur : le texte provisoire est fixé tel quel et l'écoute continue
   * à la nouvelle place du curseur (§ 5.2). Il ne se fait pas pendant la mise à jour : à la fin de la tâche.
   */
  private watch(update: ViewUpdate): void {
    if (!this.active) return;
    const gesture = update.transactions.some(
      (tr) =>
        !tr.annotation(ours) &&
        !tr.annotation(this.fromElsewhere) &&
        (tr.docChanged || tr.selection !== undefined),
    );
    if (!gesture) return;
    this.fresh = true;
    queueMicrotask(() => {
      if (this.active && this.view !== null) this.settle(this.view);
    });
  }
}

/** La saisie vocale d'un éditeur : son extension, et de quoi lui donner la vue (`parts`). */
export function createDictation(fromElsewhere: AnnotationType<boolean>): {
  readonly extension: Extension;
  /** Une écoute est-elle en cours ? (Les boutons de bloc s'effacent pendant ce temps.) */
  readonly listening: () => boolean;
  readonly parts: (view: EditorView) => { dictation: Dictation; writable: () => boolean };
} {
  const dictation = new VoiceDictation(fromElsewhere);
  // La vue est donnée à la création du greffon, et reprise quand une autre note la remplace.
  const extension = [
    dictation.extension,
    ViewPlugin.define((view) => {
      dictation.bind(view);
      return { destroy: () => dictation.drop() };
    }),
  ];
  return {
    extension,
    listening: () => dictation.listening(),
    parts: (view) => ({ dictation, writable: () => !view.state.readOnly }),
  };
}
