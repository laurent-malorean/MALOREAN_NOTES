// Fenêtre de saisie (fiche 0041) : le cahier de recherche (s'il y a à choisir), l'entrée corrigée,
// le texte sur plusieurs lignes. Échap ou « Annuler » ne fait rien ; « Ajouter » rend la saisie.
import type { EntryItem, WorkspaceNoteItem } from "../bridge";

export interface EntryWindowOptions {
  /**
   * Les cahiers où ajouter, au moins un ; la liste ne s'affiche que s'il y en a plusieurs.
   * `null` : pas de choix, le cahier est celui d'où l'on vient (son « + »).
   */
  readonly notebooks: readonly WorkspaceNoteItem[] | null;
  /** Le chemin du cahier choisi d'abord. */
  readonly chosen: string;
  /** Les entrées d'un cahier, que la nouvelle peut corriger. */
  readonly entriesOf: (path: string) => Promise<readonly EntryItem[]>;
  error(error: unknown): void;
}

/** Ce qui a été saisi : le cahier, le texte, et l'ancre de l'entrée corrigée s'il y en a une. */
export interface EntryInput {
  readonly notebook: string;
  readonly text: string;
  readonly corrected: string | null;
}

export const ENTRY_WINDOW_TITLE = "Ajouter au cahier";
const NO_CORRECTION = "Aucune : nouvelle entrée";
/** Au-delà, le début du texte d'une entrée est coupé dans la liste des entrées à corriger. */
const ENTRY_PREVIEW_LENGTH = 40;

function labelled(text: string, field: HTMLElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "entry-field";
  const name = document.createElement("span");
  name.textContent = text;
  label.append(name, field);
  return label;
}

function option(value: string, text: string): HTMLOptionElement {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = text;
  return element;
}

/** Le moment de l'entrée et le début de son texte, sur une ligne. */
export function entryChoice(entry: EntryItem): string {
  const line = entry.text.replace(/\s+/g, " ");
  const start =
    line.length > ENTRY_PREVIEW_LENGTH ? `${line.slice(0, ENTRY_PREVIEW_LENGTH)}…` : line;
  return `${entry.label} — ${start}`;
}

function button(text: string, className: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.className = className;
  element.textContent = text;
  return element;
}

/** La liste des cahiers, ou rien s'il n'y a pas à choisir. */
function notebookField(options: EntryWindowOptions): HTMLSelectElement | null {
  const { notebooks } = options;
  if (notebooks === null || notebooks.length < 2) return null;
  const select = document.createElement("select");
  select.className = "entry-notebook";
  select.append(...notebooks.map((n) => option(n.path, n.title)));
  select.value = options.chosen;
  return select;
}

/** Remplit la liste des entrées à corriger avec celles du cahier, la plus récente d'abord. */
async function fillCorrections(
  select: HTMLSelectElement,
  notebook: string,
  options: EntryWindowOptions,
) {
  select.replaceChildren(option("", NO_CORRECTION));
  try {
    const entries = await options.entriesOf(notebook);
    select.append(...[...entries].reverse().map((e) => option(e.anchor, entryChoice(e))));
  } catch (error) {
    options.error(error);
  }
}

/** Ouvre la fenêtre de saisie ; rend ce qui a été saisi, ou `null` si elle est annulée. */
export function askEntry(
  dialog: HTMLDialogElement,
  options: EntryWindowOptions,
): Promise<EntryInput | null> {
  const title = document.createElement("p");
  title.className = "confirmation-question";
  title.textContent = ENTRY_WINDOW_TITLE;
  const notebooks = notebookField(options);
  const corrections = document.createElement("select");
  corrections.className = "entry-corrected";
  const text = document.createElement("textarea");
  text.className = "entry-text";
  text.rows = 6;
  const chosen = () => notebooks?.value ?? options.chosen;
  void fillCorrections(corrections, chosen(), options);
  notebooks?.addEventListener("change", () => void fillCorrections(corrections, chosen(), options));
  const buttons = document.createElement("div");
  buttons.className = "confirmation-buttons";
  const cancel = button("Annuler", "link");
  cancel.type = "button";
  cancel.addEventListener("click", () => dialog.close());
  buttons.append(cancel, button("Ajouter", "primary"));
  // Le bouton « Ajouter » est le seul qui envoie le formulaire « dialog » ; Entrée, dans le texte,
  // passe à la ligne. Échap et « Annuler » ferment la fenêtre sans rien rendre.
  const form = document.createElement("form");
  form.method = "dialog";
  form.className = "entry-window";
  form.append(
    title,
    ...(notebooks ? [labelled("Cahier", notebooks)] : []),
    labelled("Corrige", corrections),
    labelled("Entrée", text),
    buttons,
  );
  let confirmed = false;
  form.addEventListener("submit", () => (confirmed = true));
  dialog.className = "confirmation";
  dialog.setAttribute("aria-label", ENTRY_WINDOW_TITLE);
  dialog.replaceChildren(form);
  dialog.showModal();
  text.focus();
  return new Promise((resolve) => {
    dialog.onclose = () =>
      resolve(
        confirmed
          ? { notebook: chosen(), text: text.value, corrected: corrections.value || null }
          : null,
      );
  });
}
