// L'écran affiché : son état présent, redessiné à chaque changement.
import { type Screen, welcome } from "../state/screen";

export interface CurrentScreen {
  /** L'état de l'écran tel qu'il est maintenant. */
  get(): Screen;
  /** Passe à cet état, et le dessine. */
  show(next: Screen): void;
  /** Applique une réponse de Rust à l'écran tel qu'il est à son arrivée, pas tel qu'il était à la demande. */
  answer<T>(answer: Promise<T>, next: (now: Screen, answer: T) => Screen): Promise<void>;
}

export function createCurrentScreen(render: (screen: Screen) => void): CurrentScreen {
  let screen: Screen = welcome;
  const show = (next: Screen) => {
    screen = next;
    render(screen);
  };
  return {
    get: () => screen,
    show,
    answer: async (answer, next) => {
      const value = await answer;
      show(next(screen, value));
    },
  };
}
