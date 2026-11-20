// Réglages d'affichage : posés sur l'interface, que le thème traduit en polices, tailles et couleurs.
import type { Appearance, Settings } from "../state/settings";

/** Claire ou sombre : en automatique, comme le Mac. */
export function resolvedAppearance(appearance: Appearance, systemDark: boolean): "light" | "dark" {
  if (appearance === "auto") return systemDark ? "dark" : "light";
  return appearance;
}

/** Pose les réglages d'affichage sur `root` ; le thème (theme.css) fait le reste. */
export function showDisplay(root: HTMLElement, settings: Settings, systemDark: boolean): void {
  root.dataset.font = settings.font;
  root.dataset.textSize = settings.textSize;
  root.dataset.textWidth = settings.textWidth;
  root.dataset.appearance = resolvedAppearance(settings.appearance, systemDark);
}
