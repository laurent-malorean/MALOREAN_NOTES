// Une pression, une bascule (fiche 0112) : le raccourci de la saisie vocale démarre si rien n'écoute et arrête sinon. Sur le Mac, une
// même pression peut être livrée deux fois (par la page, puis par la barre des menus si la page ne l'a pas prise à temps), et une
// touche maintenue se répète : sans garde, la seconde livraison arrête ce que la première vient de démarrer et « rien ne se passe ».
/** Deux livraisons du même raccourci dans ce délai (ms) sont une seule pression : un doigt ne peut pas en faire deux. */
export const SHORTCUT_ONCE_MS = 100;

/** Les commandes qui sont des bascules : le même geste les fait aller et venir, une livraison de trop les défait. */
const TOGGLES: ReadonlySet<string> = new Set(["voice-input"]);

export interface Landing {
  /**
   * Cette livraison du raccourci de `id` compte-t-elle ? Une commande qui n'est pas une bascule compte toujours. Une bascule ne
   * compte pas si elle est la répétition d'une touche maintenue (`repeat`), ni si elle suit de moins de `SHORTCUT_ONCE_MS` une
   * livraison qui a compté.
   */
  accepts(id: string, repeat?: boolean): boolean;
}

/** Une garde qui lit l'heure par `now` (en ms). */
export function createLanding(now: () => number): Landing {
  const last = new Map<string, number>();
  return {
    accepts(id, repeat = false) {
      if (!TOGGLES.has(id)) return true;
      if (repeat) return false;
      const at = now();
      const before = last.get(id);
      if (before !== undefined && at - before < SHORTCUT_ONCE_MS) return false;
      last.set(id, at);
      return true;
    },
  };
}

/** La garde de l'application : le clavier de la fenêtre et la barre des menus la partagent. */
export const landing: Landing = createLanding(() => performance.now());
