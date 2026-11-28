// Confirmation : petite fenêtre qui pose une question avant une action. Échap ou « Annuler » ne
// fait rien ; Entrée ou le bouton de l'action la lance.
import type { Agenda12ClosingItem } from "../bridge";

export interface ConfirmationOptions {
  readonly question: string;
  /** Le nom du bouton qui lance l'action. */
  readonly confirm: string;
}

function button(text: string, className: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.className = className;
  element.textContent = text;
  return element;
}

/** Ouvre la confirmation ; rend vrai si l'action est acceptée, faux si elle est refusée. */
export function askConfirmation(
  dialog: HTMLDialogElement,
  { question, confirm }: ConfirmationOptions,
): Promise<boolean> {
  const text = document.createElement("p");
  text.className = "confirmation-question";
  text.textContent = question;
  const accept = button(confirm, "danger");
  let accepted = false;
  accept.addEventListener("click", () => (accepted = true));
  const buttons = document.createElement("div");
  buttons.className = "confirmation-buttons";
  buttons.append(button("Annuler", "link"), accept);
  // Chaque bouton d'un formulaire « dialog » ferme la fenêtre, comme Échap.
  const form = document.createElement("form");
  form.method = "dialog";
  form.append(text, buttons);
  dialog.className = "confirmation";
  dialog.setAttribute("aria-label", "Confirmation");
  dialog.replaceChildren(form);
  dialog.showModal();
  accept.focus();
  return new Promise((resolve) => {
    dialog.onclose = () => resolve(accepted);
  });
}

export const CLOSE_ALONE = "Clore";
export const CLOSE_WITH_SUCCESSOR = "Clore et préparer le suivant";

/** Demande comment clore l'événement `title` d'un agenda 12 (spécification § 7) : seul, avec son suivant, ou pas du tout (`null`). */
export function askClosing(
  dialog: HTMLDialogElement,
  title: string,
): Promise<Agenda12ClosingItem | null> {
  const text = document.createElement("p");
  text.className = "confirmation-question";
  text.textContent = `Clore « ${title} » ? Il passe dans les archives.`;
  let chosen: Agenda12ClosingItem | null = null;
  const alone = button(CLOSE_ALONE, "agenda-closing-choice agenda-closing-alone");
  const withSuccessor = button(
    CLOSE_WITH_SUCCESSOR,
    "agenda-closing-choice agenda-closing-successor",
  );
  alone.addEventListener("click", () => (chosen = "alone"));
  withSuccessor.addEventListener("click", () => (chosen = "withSuccessor"));
  const buttons = document.createElement("div");
  buttons.className = "confirmation-buttons agenda-closing-buttons";
  buttons.append(button("Annuler", "link"), alone, withSuccessor);
  const form = document.createElement("form");
  form.method = "dialog";
  form.append(text, buttons);
  dialog.className = "confirmation";
  dialog.setAttribute("aria-label", "Confirmation");
  dialog.replaceChildren(form);
  dialog.showModal();
  withSuccessor.focus();
  return new Promise((resolve) => {
    dialog.onclose = () => resolve(chosen);
  });
}

/** Ce qui part avec un CRM : « et sa fiche », « et ses 3 fiches » ; rien sans fiche. */
const withFiches = (fiches: number) =>
  fiches === 0 ? "" : fiches === 1 ? " et sa fiche" : ` et ses ${fiches} fiches`;

/** Demande avant de placer une note ou un dossier, nommé par `name`, dans la corbeille ; un CRM dit combien de `fiches` partent avec lui. */
export const askTrash = (dialog: HTMLDialogElement, name: string, fiches = 0) =>
  askConfirmation(dialog, {
    question: `Placer « ${name} »${withFiches(fiches)} dans la corbeille ?`,
    confirm: "Placer dans la corbeille",
  });

/** Demande avant de retirer l'espace de travail `name` de la liste ; ses fichiers restent. */
export const askWorkspaceRemoval = (dialog: HTMLDialogElement, name: string) =>
  askConfirmation(dialog, {
    question: `Retirer « ${name} » de la liste des espaces de travail ? Ses notes restent dans leur dossier.`,
    confirm: "Retirer",
  });

/** Demande avant de supprimer du Mac le modèle de sens `name` : il faudrait le télécharger de nouveau. */
export const askModelRemoval = (dialog: HTMLDialogElement, name: string) =>
  askConfirmation(dialog, {
    question: `Supprimer le modèle « ${name} » du Mac ? Pour l'utiliser de nouveau, il faudra le télécharger.`,
    confirm: "Supprimer",
  });
