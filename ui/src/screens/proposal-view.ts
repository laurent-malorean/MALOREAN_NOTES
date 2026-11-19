// Proposition de l'aide à l'écriture : la sélection et la proposition côte à côte, leurs
// différences surlignées ; « Remplacer », « Insérer dessous » ou « Annuler ». Rien ne change dans
// la note sans l'un des deux premiers boutons (fiche 0031).
import type { DifferenceItem, ProposalItem } from "../bridge";

export interface ProposalOptions {
  /** Le nom de l'action : « Corriger », « Reformuler », « Résumer ». */
  readonly action: string;
  /** La proposition, attendue de Rust. */
  readonly proposal: Promise<ProposalItem>;
  /** Mettre la proposition à la place de la sélection ; la fenêtre est déjà fermée. */
  readonly replace: (text: string) => void;
  /** Ajouter la proposition sous la sélection ; la fenêtre est déjà fermée. */
  readonly insertBelow: (text: string) => void;
  /** La demande a échoué ; la fenêtre est déjà fermée. */
  readonly error: (error: unknown) => void;
}

export const PENDING = "Proposition en cours…";

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  ...children: (string | Node)[]
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.className = className;
  created.append(...children);
  return created;
}

/** Une moitié de la fenêtre : son titre et son texte. */
function side(title: string, content: HTMLElement): HTMLElement {
  return element("section", "proposal-side", element("h3", "proposal-side-title", title), content);
}

/** Les morceaux d'un côté : les communs, et ceux de `kind` surlignés. */
function parts(differences: readonly DifferenceItem[], kind: "removed" | "added"): HTMLElement[] {
  return differences
    .filter((part) => part.kind === "same" || part.kind === kind)
    .map((part) => element("span", `proposal-part ${part.kind}`, part.text));
}

/** Ouvre la fenêtre de la proposition dans `dialog` ; elle attend la réponse de Rust. */
export function showProposal(dialog: HTMLDialogElement, options: ProposalOptions): void {
  const selection = element("pre", "proposal-text");
  const proposal = element("pre", "proposal-text", PENDING);
  proposal.setAttribute("role", "status");
  const body = element(
    "div",
    "proposal-body",
    side("Sélection", selection),
    side("Proposition", proposal),
  );
  const cancel = element("button", "link", "Annuler");
  const insert = element("button", "", "Insérer dessous");
  const replace = element("button", "", "Remplacer");
  insert.disabled = replace.disabled = true;
  const buttons = element("div", "confirmation-buttons", cancel, insert, replace);
  // Chaque bouton d'un formulaire « dialog » ferme la fenêtre, comme Échap.
  const form = document.createElement("form");
  form.method = "dialog";
  form.append(element("h2", "proposal-title", `${options.action} la sélection`), body, buttons);
  // Fermée pendant la demande (Annuler, Échap), peut-être rouverte pour autre chose : la réponse
  // est oubliée.
  const waiting = () => dialog.open && form.isConnected;
  options.proposal.then(
    ({ text, differences }) => {
      if (!waiting()) return;
      selection.replaceChildren(...parts(differences, "removed"));
      proposal.replaceChildren(...parts(differences, "added"));
      proposal.removeAttribute("role");
      insert.disabled = replace.disabled = false;
      const chosen = (choose: (text: string) => void) => () => {
        dialog.onclose = () => choose(text);
      };
      insert.addEventListener("click", chosen(options.insertBelow));
      replace.addEventListener("click", chosen(options.replace));
      replace.focus();
    },
    (error: unknown) => {
      if (!waiting()) return;
      dialog.close();
      options.error(error);
    },
  );
  dialog.className = "proposal";
  dialog.setAttribute("aria-label", `${options.action} la sélection`);
  dialog.replaceChildren(form);
  dialog.onclose = null;
  // La fenêtre modale donne le focus à son premier bouton : « Annuler ».
  dialog.showModal();
}
