// Demande d'un nom : petite fenêtre avec un champ déjà rempli. Échap ou « Annuler » ne fait rien ;
// Entrée ou le bouton de l'action valide le nom tapé.

export interface NamePromptOptions {
  readonly question: string;
  /** Le nom proposé, déjà écrit dans le champ. */
  readonly initial: string;
  /** Le nom du bouton qui valide. */
  readonly confirm: string;
  /**
   * Vérifie le nom tapé avant de fermer : un message (« Ce titre existe déjà. ») garde la fenêtre
   * ouverte et s'écrit sous le champ ; `null` accepte le nom.
   */
  readonly refuse?: (name: string) => Promise<string | null>;
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
  { question, initial, confirm, refuse }: NamePromptOptions,
): Promise<string | null> {
  const label = document.createElement("label");
  label.className = "confirmation-question";
  label.textContent = question;
  const input = document.createElement("input");
  input.className = "name-prompt-input";
  input.value = initial;
  input.spellcheck = false;
  label.append(input);
  const error = document.createElement("p");
  error.className = "name-prompt-error";
  error.setAttribute("role", "alert");
  input.addEventListener("input", () => (error.textContent = ""));
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
  if (refuse) label.append(error);
  form.append(label, buttons);
  let confirmed = false;
  let checking = false;
  form.addEventListener("submit", (event) => {
    if (!refuse) {
      confirmed = true;
      return;
    }
    // Le formulaire ne ferme pas la fenêtre : elle se ferme quand le nom est accepté.
    event.preventDefault();
    if (checking) return;
    checking = true;
    void refuse(input.value)
      .then((message) => {
        error.textContent = message ?? "";
        if (message === null) {
          confirmed = true;
          dialog.close();
        } else input.focus();
      })
      .finally(() => (checking = false));
  });
  dialog.className = "confirmation";
  dialog.setAttribute("aria-label", question);
  dialog.replaceChildren(form);
  dialog.showModal();
  input.select();
  return new Promise((resolve) => {
    dialog.onclose = () => resolve(confirmed ? input.value : null);
  });
}
