import type { SaveResult } from "../bridge/generated/SaveResult";

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
  /** L'empreinte de la note telle qu'elle a été lue : Rust y voit si elle a changé ailleurs. */
  readonly fingerprint: string;
  readonly scheduler: Scheduler;
  readonly save: (path: string, content: string, fingerprint: string) => Promise<SaveResult>;
  /** Appelé après chaque enregistrement : chemin (peut-être renommé), copie de conflit éventuelle. */
  readonly onSaved: (result: SaveResult) => void;
  readonly onError?: (error: unknown) => void;
}

export interface Autosave {
  /** Signale une modification ; l'enregistrement suit après une pause. */
  edit(content: string): void;
  /** Enregistre tout de suite ce qui ne l'est pas encore. */
  flush(): Promise<void>;
  /** Rien n'attend d'être enregistré, et aucun enregistrement n'est en cours. */
  isIdle(): boolean;
  /** L'empreinte de la note telle qu'elle a été lue ou enregistrée en dernier. */
  fingerprint(): string;
  /** La note a été relue sur le disque : c'est désormais cette version que l'on connaît. */
  adopt(fingerprint: string): void;
}

/**
 * Enregistrement automatique d'une note : un seul enregistrement à la fois,
 * toujours la dernière version, sous le nom de fichier le plus récent.
 */
export function createAutosave(options: AutosaveOptions): Autosave {
  let path = options.path;
  let fingerprint = options.fingerprint;
  let unsaved: string | null = null;
  let cancelTimer: (() => void) | null = null;
  let running: Promise<void> | null = null;

  const saveUntilDone = async () => {
    while (unsaved !== null) {
      const content = unsaved;
      unsaved = null;
      try {
        const result = await options.save(path, content, fingerprint);
        path = result.path;
        fingerprint = result.fingerprint;
        options.onSaved(result);
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
    isIdle: () => unsaved === null && running === null,
    fingerprint: () => fingerprint,
    adopt(known) {
      fingerprint = known;
    },
  };
}
