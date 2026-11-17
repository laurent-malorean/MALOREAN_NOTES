// Que faire quand la note ouverte a changé hors de l'application (voir la fiche de décision 0014).
import type { NoteContent } from "../bridge/generated/NoteContent";

export type Reaction =
  /** Le disque a la version que l'on connaît : c'est notre propre enregistrement. */
  | { readonly kind: "ignore" }
  /** Rien n'attend d'être enregistré : on montre la nouvelle version. */
  | {
      readonly kind: "reload";
      readonly content: string;
      readonly title: string;
      readonly fingerprint: string;
    }
  /** Changée des deux côtés : on enregistre ce qui est tapé, Rust garde l'autre version à côté. */
  | { readonly kind: "conflict" }
  /** Supprimée : le texte reste à l'écran, la note est recréée à la prochaine modification. */
  | { readonly kind: "deleted" };

/**
 * La réaction à un changement de la note ouverte, d'après ce qu'il y a sur le disque
 * (`null` si elle n'y est plus), l'empreinte que l'on connaît, et s'il reste de quoi enregistrer.
 */
export function reactionToChange(disk: NoteContent | null, known: string, idle: boolean): Reaction {
  if (disk === null) return { kind: "deleted" };
  if (disk.fingerprint === known) return { kind: "ignore" };
  if (!idle) return { kind: "conflict" };
  return {
    kind: "reload",
    content: disk.content,
    title: disk.title,
    fingerprint: disk.fingerprint,
  };
}

/** Le changement annoncé concerne-t-il la note ouverte ? */
export const touchesNote = (changed: readonly string[], open: string | null): boolean =>
  changed.some((path) => path === open);

/** La position, dans `content`, de la ligne `line` (à partir de 1) et de la colonne `column`, ramenées dans le texte. */
export function keptPosition(content: string, line: number, column: number): number {
  const lines = content.split(/\r?\n/);
  const target = Math.min(line, lines.length);
  const before = lines.slice(0, target - 1).reduce((total, text) => total + text.length + 1, 0);
  // Stryker disable next-line OptionalChaining: la ligne visée existe toujours ; TypeScript exige le cas contraire.
  return before + Math.min(column, lines[target - 1]?.length ?? 0);
}
