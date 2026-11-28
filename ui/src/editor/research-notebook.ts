// Cahier de recherche dans l'éditeur (fiche 0041) : en lecture seule, avec en bas la zone de saisie.
// Seul Rust y ajoute des entrées ; l'éditeur montre sa nouvelle version.
import { syntaxTree } from "@codemirror/language";
import {
  type AnnotationType,
  EditorState,
  type Extension,
  type Range,
  StateEffect,
  StateField,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type Panel,
  showPanel,
  WidgetType,
} from "@codemirror/view";
import { formatEntryNumber } from "../state/research-notebook";
import { frontMatterEnd } from "./front-matter";
import type { EntryDictation } from "./voice/entry-dictation";

/** Le nom du type de contenu des cahiers de recherche, tel que l'écrit leur en-tête. */
const NOTEBOOK_TYPE = "cahier-de-recherche";
/** Les lignes visibles de la zone de saisie ; au-delà, elle défile. */
const ENTRY_ROWS = 8;
/** La première clé `type:` au premier niveau de l'en-tête, sa valeur jusqu'au commentaire. */
const TYPE_LINE = /^type[ \t]*:([^#\n]*)/m;

/**
 * La note est un cahier de recherche : la première clé `type:` de son en-tête le déclare,
 * guillemets permis, comme Rust le lit.
 */
export function isResearchNotebook(doc: Text): boolean {
  const value = TYPE_LINE.exec(doc.sliceString(0, frontMatterEnd(doc)))?.[1];
  return value !== undefined && value.trim().replace(/^["']|["']$/g, "") === NOTEBOOK_TYPE;
}

/** Le jour sous lequel une entrée ajoutée à `date` est rangée, en toutes lettres : « Lundi 23 novembre ». */
export function entryDayLabel(date: Date): string {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("fr-FR", options).format(date);
  const weekday = part({ weekday: "long" });
  const day = date.getDate() === 1 ? "1er" : String(date.getDate());
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day} ${part({ month: "long" })}`;
}

/** Ajoute l'entrée au cahier ; dit si elle l'a été (sinon le texte saisi est gardé). */
export type AddEntry = (text: string) => Promise<boolean>;

/** La zone de saisie en bas de la page d'un cahier : le message, le texte, le bouton « Ajouter l'entrée ». */
function entryArea(addEntry: AddEntry, today: () => Date, dictation?: EntryDictation): Panel {
  const dom = document.createElement("div");
  dom.className = "notebook-entry";
  const message = document.createElement("p");
  message.className = "notebook-entry-message";
  const showDay = () => {
    message.textContent = `Nouvelle entrée — elle sera datée au moment de l'ajout et rangée sous « ${entryDayLabel(today())} »`;
  };
  showDay();
  const text = document.createElement("textarea");
  text.className = "notebook-entry-text";
  text.rows = ENTRY_ROWS;
  text.setAttribute("aria-label", "Nouvelle entrée");
  text.addEventListener("focus", showDay);
  // La saisie vocale écrit dans ce champ tant que le cahier le montre.
  dictation?.bind(text);
  const footer = document.createElement("div");
  footer.className = "notebook-entry-footer";
  const readOnly = document.createElement("span");
  readOnly.textContent = "Le reste du cahier est en lecture seule.";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "primary";
  add.textContent = "Ajouter l'entrée";
  add.addEventListener("click", () => {
    add.disabled = true;
    void addEntry(text.value)
      .then((added) => {
        if (added) {
          text.value = "";
          dictation?.cleared();
        }
      })
      .finally(() => (add.disabled = false));
  });
  footer.append(readOnly, add);
  dom.append(message, text, footer);
  return { dom, top: false, destroy: () => dictation?.unbind() };
}

/** Copie la référence de l'entrée de ce numéro d'entrée (sa position dans le cahier, à partir de 1). */
export type CopyReference = (number: number) => void;

/** Le numéro d'entrée, dans la marge gauche : un bouton qui copie la référence de l'entrée. */
class EntryNumber extends WidgetType {
  constructor(
    private readonly number: number,
    private readonly copy: CopyReference,
  ) {
    super();
  }

  override eq(other: EntryNumber): boolean {
    return other.number === this.number;
  }

  override toDOM(): HTMLElement {
    const text = formatEntryNumber(this.number);
    const label = `Copier la référence de l'entrée ${text}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "entry-number";
    button.textContent = text;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => this.copy(this.number));
    return button;
  }

  /** Le bouton garde ses clics et son focus : l'éditeur n'y touche pas. */
  override ignoreEvent(): boolean {
    return true;
  }
}

const ENTRY_LINE = Decoration.line({ class: "entry-bar" });
const ENTRY_FIRST_LINE = Decoration.line({ class: "entry-bar entry-bar-first" });

/** Une entrée du cahier : où elle commence et finit dans le texte. */
interface EntrySpan {
  readonly from: number;
  readonly to: number;
}

/**
 * Les entrées du cahier, dans l'ordre : chaque élément de liste du premier niveau (hors en-tête).
 * Leur rang, à partir de 1, est leur numéro d'entrée.
 */
function entrySpans(state: EditorState): EntrySpan[] {
  if (!isResearchNotebook(state.doc)) return [];
  const headerEnd = frontMatterEnd(state.doc);
  const spans: EntrySpan[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.to <= headerEnd) return false;
      if (node.name !== "ListItem") return node.name === "Document" || node.name === "BulletList";
      if (node.node.parent?.parent?.name === "Document")
        spans.push({ from: node.from, to: node.to });
      return false;
    },
  });
  return spans;
}

/**
 * Les barres d'entrée : toutes les lignes d'une entrée portent la barre, la première en plus la
 * marque `entry-bar-first`. Avec `copy`, la première ligne porte aussi le numéro d'entrée de
 * l'entrée : sa position, à partir de 1.
 */
function entryBars(state: EditorState, copy: CopyReference | undefined): DecorationSet {
  const { doc } = state;
  const ranges: Range<Decoration>[] = [];
  entrySpans(state).forEach((span, index) => {
    const first = doc.lineAt(span.from).number;
    if (copy)
      ranges.push(
        Decoration.widget({ widget: new EntryNumber(index + 1, copy), side: -1 }).range(span.from),
      );
    for (let n = first; n <= doc.lineAt(span.to).number; n++) {
      ranges.push((n === first ? ENTRY_FIRST_LINE : ENTRY_LINE).range(doc.line(n).from));
    }
  });
  return Decoration.set(ranges, true);
}

/** L'entrée à mettre en évidence (le début de son texte), ou plus aucune. */
const flashEntry = StateEffect.define<EntrySpan | null>();

const ENTRY_FLASH_LINE = Decoration.line({ class: "entry-flash" });

/**
 * L'entrée mise en évidence : toutes ses lignes portent `entry-flash`, dont l'animation (couleur et
 * durée du thème) l'éteint ; l'éditeur la retire à la fin de l'animation.
 */
const entryFlash = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(flash, transaction) {
    const effects = transaction.effects.filter((effect) => effect.is(flashEntry));
    if (effects.length === 0) return flash.map(transaction.changes);
    const span = effects[effects.length - 1]?.value as EntrySpan | null;
    if (span === null) return Decoration.none;
    const { doc } = transaction.state;
    const lines: Range<Decoration>[] = [];
    for (let n = doc.lineAt(span.from).number; n <= doc.lineAt(span.to).number; n++) {
      lines.push(ENTRY_FLASH_LINE.range(doc.line(n).from));
    }
    return Decoration.set(lines);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Montre l'entrée de ce numéro d'entrée (à partir de 1) : le curseur à son début, l'entrée en haut
 * de l'écran et mise en évidence. Faux, sans rien changer, si le cahier n'a pas cette entrée
 * (numéro 0, au-delà de la dernière, ou note qui n'est pas un cahier).
 */
export function revealEntryIn(view: EditorView, number: number): boolean {
  const span = entrySpans(view.state)[number - 1];
  if (span === undefined) return false;
  view.dispatch({
    selection: { anchor: span.from },
    effects: [EditorView.scrollIntoView(span.from, { y: "start" }), flashEntry.of(span)],
  });
  return true;
}

/**
 * Un cahier de recherche se lit sans se modifier : aucune frappe, aucun collage, aucune mise en
 * forme ; seules passent les transactions marquées `allowed` (version relue sur le disque, frappe
 * d'une autre colonne). Avec `addEntry`, la zone de saisie s'affiche en bas ; avec `copy`, chaque
 * entrée montre son numéro d'entrée dans la marge ; avec `dictation`, la saisie vocale écrit dans la zone de saisie (fiche 0111). Une note ordinaire n'est pas touchée.
 */
export function researchNotebook(
  allowed: AnnotationType<boolean>,
  addEntry: AddEntry | undefined,
  today: () => Date,
  copy?: CopyReference,
  dictation?: EntryDictation,
): Extension {
  const notebook = (state: EditorState) => isResearchNotebook(state.doc);
  const bar = addEntry && (() => entryArea(addEntry, today, dictation));
  return [
    EditorState.readOnly.compute(["doc"], notebook),
    EditorState.changeFilter.of(
      (transaction) =>
        transaction.annotation(allowed) === true || !notebook(transaction.startState),
    ),
    StateField.define<DecorationSet>({
      create: (state) => entryBars(state, copy),
      update: (_, transaction) => entryBars(transaction.state, copy),
      provide: (field) => EditorView.decorations.from(field),
    }),
    entryFlash,
    EditorView.domEventHandlers({
      animationend: (event, view) => {
        if (!(event.target instanceof Element) || !event.target.classList.contains("entry-flash"))
          return false;
        view.dispatch({ effects: flashEntry.of(null) });
        return false;
      },
    }),
    // La marge gauche du cahier est élargie pour que les numéros ne recouvrent jamais le texte.
    EditorView.contentAttributes.compute(["doc"], (state): Record<string, string> =>
      copy && notebook(state) ? { class: "cm-numbered-entries" } : {},
    ),
    bar ? showPanel.compute(["doc"], (state) => (notebook(state) ? bar : null)) : [],
  ];
}
