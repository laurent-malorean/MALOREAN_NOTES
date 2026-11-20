// Cahier de recherche dans l'éditeur (fiche 0041) : en lecture seule, avec en haut un « + » qui
// ouvre la fenêtre de saisie. Seul Rust y ajoute des entrées ; l'éditeur montre sa nouvelle version.
import { type AnnotationType, EditorState, type Extension, type Text } from "@codemirror/state";
import { type Panel, showPanel } from "@codemirror/view";
import { frontMatterEnd } from "./front-matter";

/** Le nom du type de contenu des cahiers de recherche, tel que l'écrit leur en-tête. */
const NOTEBOOK_TYPE = "cahier-de-recherche";
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

/** La barre en haut d'un cahier : ce qu'il est, et le « + » qui ajoute une entrée. */
function notebookBar(addEntry: () => void): Panel {
  const dom = document.createElement("div");
  dom.className = "notebook-bar";
  const label = document.createElement("span");
  label.className = "notebook-bar-label";
  label.textContent = "Cahier de recherche : on n'y fait qu'ajouter";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "notebook-add";
  add.textContent = "+";
  add.title = "Ajouter une entrée";
  add.setAttribute("aria-label", "Ajouter une entrée");
  add.addEventListener("click", addEntry);
  dom.append(label, add);
  return { dom, top: true };
}

/**
 * Un cahier de recherche se lit sans se modifier : aucune frappe, aucun collage, aucune mise en
 * forme ; seules passent les transactions marquées `allowed` (version relue sur le disque, frappe
 * d'une autre colonne). Avec `addEntry`, la barre du « + » s'affiche en haut. Une note ordinaire
 * n'est pas touchée.
 */
export function researchNotebook(
  allowed: AnnotationType<boolean>,
  addEntry: (() => void) | undefined,
): Extension {
  const notebook = (state: EditorState) => isResearchNotebook(state.doc);
  const bar = addEntry && (() => notebookBar(addEntry));
  return [
    EditorState.readOnly.compute(["doc"], notebook),
    EditorState.changeFilter.of(
      (transaction) =>
        transaction.annotation(allowed) === true || !notebook(transaction.startState),
    ),
    bar ? showPanel.compute(["doc"], (state) => (notebook(state) ? bar : null)) : [],
  ];
}
