// L'icône de Claude : douze rayons autour d'un centre vide, dans une grille de 24 sur 24. Une seule
// géométrie, pour l'en-tête de la colonne Claude Code et pour le bouton de la barre du haut.
export const CLAUDE_RAY_COUNT = 12;
const RAY_INNER = 4;
const RAY_OUTER = 10.5;
const CENTER = 12;

export interface ClaudeRay {
  /** Le bout du côté du centre, « x », « y » pour les attributs d'une ligne. */
  readonly from: readonly [string, string];
  readonly to: readonly [string, string];
}

/** Le point à `radius` du centre, sur le rayon `ray`. */
function onRay(ray: number, radius: number): [string, string] {
  const angle = (ray * 2 * Math.PI) / CLAUDE_RAY_COUNT;
  return [CENTER + radius * Math.sin(angle), CENTER - radius * Math.cos(angle)].map((v) =>
    v.toFixed(2),
  ) as [string, string];
}

export function claudeRay(ray: number): ClaudeRay {
  return { from: onRay(ray, RAY_INNER), to: onRay(ray, RAY_OUTER) };
}
