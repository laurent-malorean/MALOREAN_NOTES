// Saisie vocale dans la zone de saisie du cahier de recherche (fiche 0111, spécification « saisie-vocale » § 6) : la même
// dictée que dans l'éditeur, pour un champ de texte simple. Un champ de texte n'a pas de décor : le texte provisoire est écrit
// dans le champ lui-même, à la suite du curseur, et remplacé en entier à chaque mise à jour ; il est fixé tel quel à l'arrêt
// (jamais perdu). La dictée n'ajoute jamais d'entrée au cahier : seul le bouton « Ajouter l'entrée » le fait.
import { type Dictation, spaced } from "./dictation";

/** Ce que l'éditeur d'un cahier offre à la saisie vocale pour sa zone de saisie. */
export interface EntryDictation extends Dictation {
  /** La zone de saisie est montrée : c'est elle qui reçoit la dictée. */
  bind(field: HTMLTextAreaElement): void;
  /** La zone de saisie disparaît (autre note) : plus rien à dicter. */
  unbind(): void;
  /** La zone de saisie est montrée, la dictée peut y écrire. */
  available(): boolean;
  /** La zone de saisie vient d'être vidée (l'entrée est ajoutée) : le texte déjà écrit n'y est plus. */
  cleared(): void;
}

/** Un morceau du texte du champ : de `start` à `end`. */
interface Span {
  readonly start: number;
  readonly end: number;
}

/** La classe du champ pendant l'écoute (son liseré prend la couleur du micro à l'écoute). */
export const DICTATING_CLASS = "dictating";

class EntryFieldDictation implements EntryDictation {
  private field: HTMLTextAreaElement | null = null;
  private active = false;
  /** Où est le texte provisoire dans le champ ; rien s'il n'y en a pas. */
  private shown: Span | null = null;
  /** Le texte du moteur déjà écrit : le moteur le répète dans ses textes suivants. */
  private consumed = "";
  /** Le dernier texte provisoire reçu du moteur. */
  private last = "";
  /** L'écriture en cours est la nôtre, pas une frappe de l'utilisateur. */
  private writing = false;
  private readonly typed = () => {
    if (!this.writing) this.settle();
  };
  private readonly moved = () => {
    const { field, shown } = this;
    if (field && shown && (field.selectionStart !== shown.end || field.selectionEnd !== shown.end))
      this.settle();
  };

  bind(field: HTMLTextAreaElement): void {
    this.unbind();
    this.field = field;
    field.addEventListener("input", this.typed);
    field.addEventListener("keyup", this.moved);
    field.addEventListener("mouseup", this.moved);
  }

  unbind(): void {
    const { field } = this;
    if (field === null) return;
    field.removeEventListener("input", this.typed);
    field.removeEventListener("keyup", this.moved);
    field.removeEventListener("mouseup", this.moved);
    field.classList.remove(DICTATING_CLASS);
    this.field = null;
    this.active = false;
    this.shown = null;
  }

  available(): boolean {
    return this.field !== null && this.field.isConnected;
  }

  listening(): boolean {
    return this.active;
  }

  begin(): void {
    this.field?.focus();
    this.field?.classList.add(DICTATING_CLASS);
    this.active = true;
    this.shown = null;
    this.consumed = "";
    this.last = "";
  }

  provisional(text: string): void {
    if (!this.active || this.field === null) return;
    this.last = text;
    const base = this.shown ?? this.selection();
    const shownText = spaced(this.before(base.start), this.rest(text));
    this.show(base, shownText);
  }

  fixed(text: string): void {
    if (!this.active || this.field === null) return;
    const rest = this.rest(text);
    this.consumed = "";
    this.last = "";
    const base = this.shown ?? this.selection();
    this.show(base, spaced(this.before(base.start), rest));
    this.shown = null;
  }

  end(): void {
    if (!this.active) return;
    this.settle();
    this.active = false;
    this.field?.classList.remove(DICTATING_CLASS);
  }

  drop(): void {
    if (this.shown !== null) this.replace(this.shown, "");
    this.shown = null;
    this.active = false;
    this.field?.classList.remove(DICTATING_CLASS);
  }

  cleared(): void {
    this.shown = null;
    this.consumed = this.last;
  }

  /** Le texte provisoire reste où il est et devient du texte fixé ; l'écoute continue à la place du curseur. */
  private settle(): void {
    if (this.shown === null) return;
    this.shown = null;
    this.consumed = this.last;
  }

  /** Écrit `text` à la place de `base` ; c'est le texte provisoire s'il n'est pas vide, sinon il disparaît. */
  private show(base: Span, text: string): void {
    if (text === "" && this.shown === null) return;
    this.replace(base, text);
    this.shown = text === "" ? null : { start: base.start, end: base.start + text.length };
  }

  /** Le texte du moteur, sans ce qui a déjà été écrit ; s'il n'en est plus la suite, tel quel. */
  private rest(text: string): string {
    if (this.consumed === "" || !text.startsWith(this.consumed)) {
      this.consumed = "";
      return text;
    }
    return text.slice(this.consumed.length);
  }

  private selection(): Span {
    const field = this.field as HTMLTextAreaElement;
    return { start: field.selectionStart, end: field.selectionEnd };
  }

  private before(pos: number): string {
    return pos === 0 ? "" : (this.field as HTMLTextAreaElement).value.slice(pos - 1, pos);
  }

  /**
   * Remplace `base` par `text`, le curseur à sa suite. Dans un champ qui a le focus, par la commande d'édition du navigateur :
   * l'annulation (Cmd + Z) la connaît ; sinon directement.
   */
  private replace(base: Span, text: string): void {
    const field = this.field as HTMLTextAreaElement;
    this.writing = true;
    try {
      field.setSelectionRange(base.start, base.end);
      const done =
        document.activeElement === field &&
        (text === ""
          ? document.execCommand("delete")
          : document.execCommand("insertText", false, text));
      if (!done) field.setRangeText(text, base.start, base.end, "end");
    } finally {
      this.writing = false;
    }
  }
}

/** La saisie vocale de la zone de saisie d'un cahier : elle reçoit sa zone (`bind`) quand le cahier la montre. */
export function createEntryDictation(): EntryDictation {
  return new EntryFieldDictation();
}
