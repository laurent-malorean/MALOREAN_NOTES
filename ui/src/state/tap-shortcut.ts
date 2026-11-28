// Touche seule (fiche 0110) : une touche de modificateur prise seule comme raccourci de la saisie vocale, côté gauche ou
// droit, déclenchée au tapotement. La logique est pure (événements clavier en entrée, rien du document) : elle se joue sans fenêtre.

/** Un modificateur seul est un tapotement s'il est relâché dans ce délai (ms) ; au-delà, c'est un maintien. */
export const TAP_LIMIT_MS = 500;

/** Ce que la détection lit d'un événement clavier. */
export interface TapEvent {
  /** La touche physique : `MetaRight`, `AltLeft`… (elle distingue le côté). */
  readonly code: string;
  readonly timeStamp: number;
  /** La répétition d'une touche maintenue. */
  readonly repeat: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** Les touches physiques des modificateurs, leur nom écrit dans le raccourci et leur côté. */
const TAPS: readonly (readonly [code: string, written: string])[] = [
  ["ControlLeft", "Ctrl gauche"],
  ["ControlRight", "Ctrl droite"],
  ["AltLeft", "Alt gauche"],
  ["AltRight", "Alt droite"],
  ["MetaLeft", "Cmd gauche"],
  ["MetaRight", "Cmd droite"],
  ["ShiftLeft", "Maj gauche"],
  ["ShiftRight", "Maj droite"],
];
const WRITTEN_BY_CODE: ReadonlyMap<string, string> = new Map(TAPS);
const CODE_BY_WRITTEN: ReadonlyMap<string, string> = new Map(
  TAPS.map(([code, text]) => [text, code]),
);

/** Le raccourci écrit (`Cmd droite`) de la touche physique d'un modificateur ; rien pour une autre touche. */
export function tapShortcutOf(code: string): string | null {
  return WRITTEN_BY_CODE.get(code) ?? null;
}

/** La touche physique (`MetaRight`) d'un raccourci écrit `Cmd droite` ; rien si ce n'est pas une touche seule. */
export function tapCodeOf(shortcut: string): string | null {
  return CODE_BY_WRITTEN.get(shortcut) ?? null;
}

/** Ce raccourci est-il une touche seule ? */
export function isTapShortcut(shortcut: string): boolean {
  return CODE_BY_WRITTEN.has(shortcut);
}

/** Le genre d'un modificateur : `MetaLeft` et `MetaRight` sont du même genre. */
function kindOf(code: string): "meta" | "ctrl" | "alt" | "shift" | null {
  if (code.startsWith("Meta")) return "meta";
  if (code.startsWith("Control")) return "ctrl";
  if (code.startsWith("Alt")) return "alt";
  if (code.startsWith("Shift")) return "shift";
  return null;
}

/** Un autre modificateur que celui de `event` est déjà enfoncé (d'après les drapeaux de l'événement). */
function otherModifierHeld(event: TapEvent): boolean {
  const kind = kindOf(event.code);
  return (
    (event.metaKey && kind !== "meta") ||
    (event.ctrlKey && kind !== "ctrl") ||
    (event.altKey && kind !== "alt") ||
    (event.shiftKey && kind !== "shift")
  );
}

/**
 * Reconnaît le tapotement d'une touche de modificateur : pressée et relâchée sans qu'aucune autre touche, ni aucun clic, soit
 * venue entre les deux, et dans la limite de temps. Sinon c'est le début d'une combinaison ordinaire (Cmd+C, Cmd droite + une
 * lettre) ou un maintien : rien ne se déclenche.
 */
export class TapDetector {
  private pending: { readonly code: string; readonly at: number } | null = null;

  /** `limit` : la durée au plus d'un tapotement, en ms (infinie pour la capture dans les réglages). */
  constructor(private readonly limit: number) {}

  /** Une touche est pressée. */
  keydown(event: TapEvent): void {
    // La répétition d'une touche maintenue n'est pas un nouvel appui.
    if (event.repeat) return;
    // Une touche pressée pendant qu'une autre attendait son relâchement fait des deux une combinaison ; un appui resté sans relâchement vu (focus perdu) est périmé.
    const waiting = this.pending !== null && event.timeStamp - this.pending.at <= this.limit;
    this.pending = null;
    if (waiting || kindOf(event.code) === null || otherModifierHeld(event)) return;
    this.pending = { code: event.code, at: event.timeStamp };
  }

  /** Une touche est relâchée : sa touche physique si c'était un tapotement, sinon rien. */
  keyup(event: TapEvent): string | null {
    const { pending } = this;
    if (pending === null || pending.code !== event.code) return null;
    this.pending = null;
    return event.timeStamp - pending.at <= this.limit ? event.code : null;
  }

  /** Un clic, ou la perte du focus : l'appui en attente devient une combinaison (Cmd + clic) ou n'aura pas de relâchement. */
  interrupt(): void {
    this.pending = null;
  }
}
