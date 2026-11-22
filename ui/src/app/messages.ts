// Messages de l'application : de petites cartes en haut à droite, qui paraissent un moment, et
// les erreurs qui s'y lisent. Un type par gravité : succès, information, avertissement, erreur.

/** Durée pendant laquelle un message reste visible. */
export const STATUS_DURATION_MS = 5000;
/** Le nombre de messages visibles à la fois ; le plus ancien part quand un cinquième arrive. */
export const MAX_TOASTS = 4;

/** La gravité d'un message : elle donne sa couleur et son icône. */
export type MessageKind = "success" | "info" | "warning" | "error";

export interface Messages {
  /** Montre un message quelques secondes ; un succès sauf indication contraire. */
  show(message: string, kind?: MessageKind): void;
  /** Montre une erreur, dite avec les mots de l'utilisateur. */
  error(error: unknown): void;
  /** Lance une action sans l'attendre ; son erreur éventuelle est montrée. */
  run(action: Promise<unknown>): void;
}

/** Un message à l'écran : sa carte, et de quoi la retirer. */
function toastFor(message: string, kind: MessageKind, remove: () => void): HTMLElement {
  const toast = document.createElement("div");
  toast.className = `toast toast-${kind}`;
  if (kind === "error") toast.setAttribute("role", "alert");
  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  const close = document.createElement("button");
  close.className = "toast-close";
  close.type = "button";
  close.setAttribute("aria-label", "Fermer");
  close.addEventListener("click", remove);
  toast.append(text, close);
  return toast;
}

export function createMessages(
  status: HTMLElement,
  describe: (error: unknown) => string,
): Messages {
  const show = (message: string, kind: MessageKind = "success") => {
    const toast = toastFor(message, kind, () => toast.remove());
    setTimeout(() => toast.remove(), STATUS_DURATION_MS);
    status.prepend(toast);
    [...status.children].slice(MAX_TOASTS).forEach((oldest) => oldest.remove());
  };
  const error = (failure: unknown) => show(describe(failure), "error");
  return { show, error, run: (action) => void action.catch(error) };
}
