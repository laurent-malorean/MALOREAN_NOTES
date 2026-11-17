import { describe, expect, it } from "vitest";
import { libraryScreen, listed } from "../../test-support/app-fixture";
import { notesRefreshed, type Screen, welcome } from "../state/screen";
import { createCurrentScreen } from "./current-screen";

describe("écran affiché", () => {
  it("commence sur l'accueil, sans rien dessiner", () => {
    const drawn: Screen[] = [];
    const screen = createCurrentScreen((next) => drawn.push(next));
    expect(screen.get()).toBe(welcome);
    expect(drawn).toEqual([]);
  });

  it("dessine chaque nouvel état", () => {
    const drawn: Screen[] = [];
    const screen = createCurrentScreen((next) => drawn.push(next));
    const library = libraryScreen();
    screen.show(library);
    expect(screen.get()).toBe(library);
    expect(drawn).toEqual([library]);
  });

  it("applique une réponse à l'écran tel qu'il est à son arrivée", async () => {
    const drawn: Screen[] = [];
    const screen = createCurrentScreen((next) => drawn.push(next));
    let answer: (paths: string[]) => void = () => {};
    const pending = screen.answer(
      new Promise<string[]>((resolve) => (answer = resolve)),
      (now, paths) =>
        notesRefreshed(
          now,
          paths.map((path) => listed(path)),
        ),
    );
    const later = libraryScreen([listed("a.md")]);
    screen.show(later);
    answer(["b.md"]);
    await pending;
    expect(screen.get()).toEqual(notesRefreshed(later, [listed("b.md")]));
    expect(drawn).toHaveLength(2);
  });
});
