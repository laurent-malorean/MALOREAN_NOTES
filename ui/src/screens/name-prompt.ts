// Demande d'un nom : petite fenêtre avec un champ déjà rempli. Échap ou « Annuler » ne fait rien ;
// Entrée ou le bouton de l'action valide le nom tapé.

export interface NamePromptOptions {
  readonly question: string;
  /** Le nom proposé, déjà écrit dans le champ. */
  readonly initial: string;
  /** Le nom du bouton qui valide. */
  readonly confirm: string;
}

function button(text: string, className: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.className = className;
  element.textContent = text;
  return element;
}

/** Ouvre la demande ; rend le nom tapé, ou `null` si elle est annulée. */
export function askName(
  dialog: HTMLDialogElement,
  { question, initial, confirm }: NamePromptOptions,
): Promise<string | null> {
  const label = document.createElement("label");
  label.className = "confirmation-question";
  label.textContent = question;
  const input = document.createElement("input");
  input.className = "name-prompt-input";
  input.value = initial;
  input.spellcheck = false;
  label.append(input);
  const buttons = document.createElement("div");
  buttons.className = "confirmation-buttons";
  const cancel = button("Annuler", "link");
  cancel.type = "button";
  cancel.addEventListener("click", () => dialog.close());
  buttons.append(cancel, button(confirm, "primary"));
  // Le bouton de l'action est le seul qui envoie le formulaire « dialog » : lui ou Entrée valident
  // et ferment la fenêtre. Échap et « Annuler » la ferment sans rien valider.
  const form = document.createElement("form");
  form.method = "dialog";
  form.append(label, buttons);
  let confirmed = false;
  form.addEventListener("submit", () => (confirmed = true));
  dialog.className = "confirmation";
  dialog.setAttribute("aria-label", question);
  dialog.replaceChildren(form);
  dialog.showModal();
  input.select();
  return new Promise((resolve) => {
    dialog.onclose = () => resolve(confirmed ? input.value : null);
  });
}
