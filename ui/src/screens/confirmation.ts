// Confirmation : petite fenêtre qui pose une question avant une action. Échap ou « Annuler » ne
// fait rien ; Entrée ou le bouton de l'action la lance.

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

/** Demande avant de placer une note ou un dossier, nommé par `name`, dans la corbeille. */
export const askTrash = (dialog: HTMLDialogElement, name: string) =>
  askConfirmation(dialog, {
    question: `Placer « ${name} » dans la corbeille ?`,
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
