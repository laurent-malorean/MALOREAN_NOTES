// Cahier de recherche dans l'éditeur (fiche 0041) : en lecture seule, avec en bas la zone de saisie.
// Seul Rust y ajoute des entrées ; l'éditeur montre sa nouvelle version.
import { type AnnotationType, EditorState, type Extension, type Text } from "@codemirror/state";
import { type Panel, showPanel } from "@codemirror/view";
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

/**
 * Un cahier de recherche se lit sans se modifier : aucune frappe, aucun collage, aucune mise en
 * forme ; seules passent les transactions marquées `allowed` (version relue sur le disque, frappe
 * d'une autre colonne). Avec `addEntry`, la zone de saisie s'affiche en bas. Une note ordinaire
 * n'est pas touchée.
 */
export function researchNotebook(
  allowed: AnnotationType<boolean>,
  addEntry: AddEntry | undefined,
  today: () => Date,
): Extension {
  const notebook = (state: EditorState) => isResearchNotebook(state.doc);
  const bar = addEntry && (() => entryArea(addEntry, today));
  return [
    EditorState.readOnly.compute(["doc"], notebook),
    EditorState.changeFilter.of(
      (transaction) =>
        transaction.annotation(allowed) === true || !notebook(transaction.startState),
    ),
    bar ? showPanel.compute(["doc"], (state) => (notebook(state) ? bar : null)) : [],
  ];
}
