// Messages de l'application : de petites cartes en haut à droite, qui paraissent un moment, et
// les erreurs qui s'y lisent. Un type par gravité : succès, information, avertissement, erreur.

/** Durée pendant laquelle un message reste visible. */
export const STATUS_DURATION_MS = 5000;
/** Le nombre de messages visibles à la fois ; le plus ancien part quand un cinquième arrive. */
export const MAX_TOASTS = 4;

/** La gravité d'un message : elle donne sa couleur et son icône. */
export type MessageKind = "success" | "info" | "warning" | "error";

/** Un bouton du message (« Annuler ») : son nom, et ce qu'il lance ; une erreur de l'action est montrée. */
export interface MessageAction {
  readonly label: string;
  readonly run: () => Promise<unknown>;
}

export interface Messages {
  /** Montre un message quelques secondes ; un succès sauf indication contraire, avec un bouton d'action si on en donne un. */
  show(message: string, kind?: MessageKind, action?: MessageAction): void;
  /** Montre une erreur, dite avec les mots de l'utilisateur. */
  error(error: unknown): void;
  /** Lance une action sans l'attendre ; son erreur éventuelle est montrée. */
  run(action: Promise<unknown>): void;
}

/** Un message à l'écran : sa carte, et de quoi la retirer. */
function toastFor(
  message: string,
  kind: MessageKind,
  remove: () => void,
  action?: { readonly label: string; readonly click: () => void },
): HTMLElement {
  const toast = document.createElement("div");
  toast.className = `toast toast-${kind}`;
  if (kind === "error") toast.setAttribute("role", "alert");
  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  if (action) {
    const button = document.createElement("button");
    button.className = "toast-action";
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => (remove(), action.click()));
    toast.append(text, button);
  } else toast.append(text);
  const close = document.createElement("button");
  close.className = "toast-close";
  close.type = "button";
  close.setAttribute("aria-label", "Fermer");
  close.addEventListener("click", remove);
  toast.append(close);
  return toast;
}

export function createMessages(
  status: HTMLElement,
  describe: (error: unknown) => string,
): Messages {
  const show = (message: string, kind: MessageKind = "success", action?: MessageAction) => {
    const toast = toastFor(
      message,
      kind,
      () => toast.remove(),
      action && { label: action.label, click: () => run(action.run()) },
    );
    setTimeout(() => toast.remove(), STATUS_DURATION_MS);
    status.prepend(toast);
    [...status.children].slice(MAX_TOASTS).forEach((oldest) => oldest.remove());
  };
  const error = (failure: unknown) => show(describe(failure), "error");
  const run = (action: Promise<unknown>) => void action.catch(error);
  return { show, error, run };
}
