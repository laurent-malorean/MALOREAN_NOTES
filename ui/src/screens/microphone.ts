// Le micro de la bande du haut : un bouton de la barre de mise en forme (même taille, même survol) qui montre
// l'état de la saisie vocale. Couleurs et tailles viennent du thème (`theme.css`, `style.css`).
import { formatButtonName } from "../state/format-bar";
import type { Microphone } from "../state/voice-input";
import { formatIcon } from "./format-icons";

/** Le nom de la commande du micro dans la barre : le bouton qui la lance. */
export const MICROPHONE_COMMAND = "voice-input";

const LEVEL_PROPERTY = "--voice-level";

/** Le bouton du micro de cette barre ; rien si la barre n'est pas construite. */
export function microphoneButton(bar: HTMLElement): HTMLButtonElement | null {
  return bar.querySelector<HTMLButtonElement>(`[data-command="${MICROPHONE_COMMAND}"]`);
}

/** Le témoin de niveau sonore, dans le bouton : posé à la première écoute. */
function levelGauge(button: HTMLElement): HTMLElement {
  const existing = button.querySelector<HTMLElement>(".voice-level");
  if (existing) return existing;
  const gauge = document.createElement("span");
  gauge.className = "voice-level";
  gauge.setAttribute("aria-hidden", "true");
  button.append(gauge);
  return gauge;
}

/** Donne au bouton l'aspect de `microphone` : icône, bulle d'aide, grisé, enfoncé en écoute, et le niveau sonore (de 0 à 1). */
export function showMicrophone(button: HTMLElement, microphone: Microphone, level = 0): void {
  const { kind } = microphone;
  const icon = kind === "preparing" ? "spinner" : "microphone";
  if (button.dataset.icon !== icon) {
    button.querySelector("svg")?.remove();
    button.prepend(formatIcon(icon));
    button.dataset.icon = icon;
  }
  button.title = microphone.title;
  button.setAttribute("aria-label", formatButtonName(MICROPHONE_COMMAND));
  button.setAttribute("aria-pressed", String(kind === "listening" || kind === "preparing"));
  button.classList.add("voice-button");
  for (const each of ["idle", "preparing", "listening", "unavailable"])
    button.classList.toggle(`voice-${each}`, each === kind);
  (button as HTMLButtonElement).disabled = !microphone.enabled;
  const gauge = levelGauge(button);
  gauge.hidden = kind !== "listening";
  gauge.style.setProperty(LEVEL_PROPERTY, String(level));
}
