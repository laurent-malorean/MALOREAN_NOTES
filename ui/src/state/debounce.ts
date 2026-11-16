import type { Scheduler } from "./autosave";

/** Délai sans frappe avant de lancer une recherche. */
export const SEARCH_DELAY_MS = 200;

/** Programme une action après une pause ; une nouvelle demande remplace la précédente. */
export interface Debouncer {
  (run: () => void): void;
  /** Abandonne l'action en attente. */
  cancel(): void;
}

export function createDebouncer(scheduler: Scheduler): Debouncer {
  let cancelPending = () => {};
  const debounced = (run: () => void) => {
    cancelPending();
    cancelPending = scheduler.schedule(run);
  };
  return Object.assign(debounced, { cancel: () => cancelPending() });
}
