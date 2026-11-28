// Bips de la saisie vocale (fiche 0109) : un court son au début de l'écoute (deux notes qui montent) et un autre à la fin (deux
// notes qui descendent), fabriqués par Web Audio : aucune ressource à livrer. Le son sort d'un petit objet qu'on peut remplacer par un
// faux dans les tests.

export type BeepKind = "start" | "end";

/** Ce que le bip attend d'un contexte audio (un sous-ensemble de `AudioContext`). */
export interface BeepContext {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state: string;
  resume(): Promise<void>;
  createOscillator(): {
    readonly frequency: { value: number };
    connect(node: unknown): unknown;
    start(at: number): void;
    stop(at: number): void;
  };
  createGain(): {
    readonly gain: {
      setValueAtTime(value: number, at: number): unknown;
      linearRampToValueAtTime(value: number, at: number): unknown;
    };
    connect(node: unknown): unknown;
  };
}

export interface Beeper {
  /** À appeler dans un geste de l'utilisateur (clic, raccourci) : le navigateur ne laisse pas un son partir sans cela. */
  unlock(): void;
  /** Joue le bip ; sans audio, la saisie vocale continue sans lui. */
  play(kind: BeepKind): void;
}

/** Les deux notes, en hertz : une quinte (660 puis 880). */
export const LOW_NOTE = 660;
export const HIGH_NOTE = 880;
/** Une note dure 80 ms ; le volume reste modéré. */
export const NOTE_SECONDS = 0.08;
export const BEEP_VOLUME = 0.12;
/** Montée et descente du volume de chaque note, pour éviter le claquement. */
const FADE_SECONDS = 0.01;

/** Les notes du bip, dans l'ordre. */
export function notesOf(kind: BeepKind): readonly number[] {
  return kind === "start" ? [LOW_NOTE, HIGH_NOTE] : [HIGH_NOTE, LOW_NOTE];
}

function playNote(context: BeepContext, frequency: number, at: number): void {
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.frequency.value = frequency;
  volume.gain.setValueAtTime(0, at);
  volume.gain.linearRampToValueAtTime(BEEP_VOLUME, at + FADE_SECONDS);
  volume.gain.setValueAtTime(BEEP_VOLUME, at + NOTE_SECONDS - FADE_SECONDS);
  volume.gain.linearRampToValueAtTime(0, at + NOTE_SECONDS);
  oscillator.connect(volume);
  volume.connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + NOTE_SECONDS);
}

/** Le bip, qui crée son contexte audio au premier besoin avec `newContext`. */
export function createBeeper(newContext: () => BeepContext): Beeper {
  let context: BeepContext | null = null;
  const ready = (): BeepContext => {
    context ??= newContext();
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    return context;
  };
  return {
    unlock: () => {
      try {
        ready();
      } catch {
        // Pas d'audio dans cette fenêtre : la saisie vocale marche sans bip.
      }
    },
    play: (kind) => {
      try {
        const now = ready();
        notesOf(kind).forEach((frequency, index) =>
          playNote(now, frequency, now.currentTime + index * NOTE_SECONDS),
        );
      } catch {
        // Pas d'audio dans cette fenêtre : la saisie vocale marche sans bip.
      }
    },
  };
}
