// Messages de l'application : une ligne d'état qui paraît un moment, et les erreurs qui s'y lisent.

/** Durée pendant laquelle un message reste visible. */
export const STATUS_DURATION_MS = 4000;

export interface Messages {
  /** Montre un message quelques secondes. */
  show(message: string): void;
  /** Montre une erreur, dite avec les mots de l'utilisateur. */
  error(error: unknown): void;
  /** Lance une action sans l'attendre ; son erreur éventuelle est montrée. */
  run(action: Promise<unknown>): void;
}

export function createMessages(
  status: HTMLElement,
  describe: (error: unknown) => string,
): Messages {
  const show = (message: string) => {
    status.textContent = message;
    status.classList.add("visible");
    setTimeout(() => status.classList.remove("visible"), STATUS_DURATION_MS);
  };
  const error = (failure: unknown) => show(describe(failure));
  return { show, error, run: (action) => void action.catch(error) };
}
