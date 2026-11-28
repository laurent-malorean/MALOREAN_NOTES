// Touche seule (fiche 0113) : le raccourci de la saisie vocale peut être une touche de modificateur prise seule (Cmd droite,
// Option droite…). Elle se déclenche au tapotement : à son relâchement, si rien d'autre n'a été pressé pendant ce temps
// (sinon c'est une combinaison ordinaire, Cmd+C par exemple, qui garde son effet) et qu'elle n'est pas restée enfoncée.
// Les écouteurs sont ceux de la fenêtre, en phase de capture : ils marchent dans l'éditeur, dans un champ de formulaire et
// hors éditeur. Aucun événement n'est retenu (`preventDefault`) : une touche de modificateur seule n'a pas d'autre effet.
import { shortcutOf } from "../state/commands";
import { TAP_LIMIT_MS, TapDetector, tapCodeOf } from "../state/tap-shortcut";
import type { VoiceInput } from "./voice-input";

export interface TapShortcutDeps {
  /** La saisie vocale : le tapotement fait ce que fait le clic sur le micro. */
  readonly voice: Pick<VoiceInput, "toggle">;
  /** Une fenêtre de l'interface est ouverte : elle garde le clavier, rien ne se déclenche. */
  readonly blocked: () => boolean;
  /** Où écouter ; la fenêtre par défaut. */
  readonly target?: EventTarget;
}

/** La touche physique du raccourci de la saisie vocale s'il est une touche seule (`MetaRight`), sinon rien. */
function chosenTap(): string | null {
  return tapCodeOf(shortcutOf({ id: "voice-input" }) ?? "");
}

/** Branche l'écoute des touches seules ; le raccourci choisi est relu à chaque relâchement. */
export function connectTapShortcut(deps: TapShortcutDeps): void {
  const target = deps.target ?? window;
  const detector = new TapDetector(TAP_LIMIT_MS);
  target.addEventListener("keydown", (event) => detector.keydown(event as KeyboardEvent), true);
  target.addEventListener(
    "keyup",
    (event) => {
      const tapped = detector.keyup(event as KeyboardEvent);
      if (tapped !== null && tapped === chosenTap() && !deps.blocked()) deps.voice.toggle();
    },
    true,
  );
  // Cmd + clic est une combinaison ; un focus perdu entre l'appui et le relâchement n'aura pas de relâchement.
  target.addEventListener("pointerdown", () => detector.interrupt(), true);
  target.addEventListener("blur", () => detector.interrupt());
}
