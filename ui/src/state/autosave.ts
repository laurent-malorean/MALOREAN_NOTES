import type { SavedNote } from "../bridge/generated/SavedNote";

/** Délai sans frappe avant d'enregistrer. */
export const AUTOSAVE_DELAY_MS = 600;

/** Programme une exécution différée ; rend de quoi l'annuler. */
export interface Scheduler {
  schedule(run: () => void): () => void;
}

export const timerScheduler = (delayMs = AUTOSAVE_DELAY_MS): Scheduler => ({
  schedule: (run) => {
    const id = setTimeout(run, delayMs);
    return () => clearTimeout(id);
  },
});

export interface AutosaveOptions {
  readonly path: string;
  readonly scheduler: Scheduler;
  readonly save: (path: string, content: string) => Promise<SavedNote>;
  /** Appelé après chaque enregistrement, avec le nom de fichier (peut-être renommé). */
  readonly onSaved: (path: string) => void;
  readonly onError?: (error: unknown) => void;
}

export interface Autosave {
  /** Signale une modification ; l'enregistrement suit après une pause. */
  edit(content: string): void;
  /** Enregistre tout de suite ce qui ne l'est pas encore. */
  flush(): Promise<void>;
}

/**
 * Enregistrement automatique d'une note : un seul enregistrement à la fois,
 * toujours la dernière version, sous le nom de fichier le plus récent.
 */
export function createAutosave(options: AutosaveOptions): Autosave {
  let path = options.path;
  let unsaved: string | null = null;
  let cancelTimer: (() => void) | null = null;
  let running: Promise<void> | null = null;

  const saveUntilDone = async () => {
    while (unsaved !== null) {
      const content = unsaved;
      unsaved = null;
      try {
        path = (await options.save(path, content)).path;
        options.onSaved(path);
      } catch (error) {
        unsaved ??= content;
        options.onError?.(error);
        return;
      }
    }
  };

  const start = (): Promise<void> => {
    cancelTimer?.();
    cancelTimer = null;
    running ??= saveUntilDone().finally(() => {
      running = null;
    });
    return running;
  };

  return {
    edit(content) {
      unsaved = content;
      cancelTimer?.();
      cancelTimer = options.scheduler.schedule(() => void start());
    },
    flush: start,
  };
}
