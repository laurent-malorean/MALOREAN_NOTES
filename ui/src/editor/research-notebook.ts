// Cahier de recherche dans l'éditeur (fiche 0041) : en lecture seule, avec en bas la zone de saisie.
// Seul Rust y ajoute des entrées ; l'éditeur montre sa nouvelle version.
import { syntaxTree } from "@codemirror/language";
import {
  type AnnotationType,
  EditorState,
  type Extension,
  type Range,
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
function entryArea(addEntry: AddEntry, today: () => Date): Panel {
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
        if (added) text.value = "";
      })
      .finally(() => (add.disabled = false));
  });
  footer.append(readOnly, add);
  dom.append(message, text, footer);
  return { dom, top: false };
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

/**
 * Les barres d'entrée : chaque élément de liste du premier niveau (hors en-tête) est une entrée,
 * dont toutes les lignes portent la barre, la première en plus la marque `entry-bar-first`. Avec
 * `copy`, la première ligne porte aussi le numéro d'entrée de l'entrée : sa position, à partir de 1.
 */
function entryBars(state: EditorState, copy: CopyReference | undefined): DecorationSet {
  if (!isResearchNotebook(state.doc)) return Decoration.none;
  const { doc } = state;
  const headerEnd = frontMatterEnd(doc);
  const ranges: Range<Decoration>[] = [];
  let number = 0;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.to <= headerEnd) return false;
      if (node.name !== "ListItem") return node.name === "Document" || node.name === "BulletList";
      if (node.node.parent?.parent?.name !== "Document") return false;
      const last = doc.lineAt(node.to).number;
      number += 1;
      if (copy)
        ranges.push(
          Decoration.widget({ widget: new EntryNumber(number, copy), side: -1 }).range(node.from),
        );
      for (let n = doc.lineAt(node.from).number; n <= last; n++) {
        ranges.push(
          (n === doc.lineAt(node.from).number ? ENTRY_FIRST_LINE : ENTRY_LINE).range(
            doc.line(n).from,
          ),
        );
      }
      return false;
    },
  });
  return Decoration.set(ranges, true);
}

/**
 * Un cahier de recherche se lit sans se modifier : aucune frappe, aucun collage, aucune mise en
 * forme ; seules passent les transactions marquées `allowed` (version relue sur le disque, frappe
 * d'une autre colonne). Avec `addEntry`, la zone de saisie s'affiche en bas ; avec `copy`, chaque
 * entrée montre son numéro d'entrée dans la marge. Une note ordinaire n'est pas touchée.
 */
export function researchNotebook(
  allowed: AnnotationType<boolean>,
  addEntry: AddEntry | undefined,
  today: () => Date,
  copy?: CopyReference,
): Extension {
  const notebook = (state: EditorState) => isResearchNotebook(state.doc);
  const bar = addEntry && (() => entryArea(addEntry, today));
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
    // La marge gauche du cahier est élargie pour que les numéros ne recouvrent jamais le texte.
    EditorView.contentAttributes.compute(["doc"], (state): Record<string, string> =>
      copy && notebook(state) ? { class: "cm-numbered-entries" } : {},
    ),
    bar ? showPanel.compute(["doc"], (state) => (notebook(state) ? bar : null)) : [],
  ];
}
