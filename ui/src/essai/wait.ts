// Essai de l'application réelle (fiche 0054) : attendre qu'un état de la fenêtre soit atteint.

export const POLL_MS = 50;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Attend que `ready` rende une valeur (autre que `null` ou `undefined`) et la rend ; au bout de
 * `timeoutMs` elle échoue en disant ce qu'on attendait (`what`).
 */
export async function until<T>(
  what: string,
  ready: () => T | null | undefined | Promise<T | null | undefined>,
  timeoutMs = 10_000,
): Promise<T> {
  const limit = Date.now() + timeoutMs;
  for (;;) {
    const value = await ready();
    if (value !== null && value !== undefined) return value;
    if (Date.now() >= limit) throw new Error(`délai dépassé (${timeoutMs} ms) : ${what}`);
    await pause(POLL_MS);
  }
}

export { pause };
