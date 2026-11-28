import { describe, expect, it } from "vitest";
import { createLanding, SHORTCUT_ONCE_MS } from "./shortcut-landing";

function landingAt() {
  const clock = { now: 1000 };
  return { clock, landing: createLanding(() => clock.now) };
}

describe("une pression, une bascule", () => {
  it("la fenêtre est de 100 ms", () => {
    expect(SHORTCUT_ONCE_MS).toBe(100);
  });

  it("la première livraison du raccourci de la saisie vocale compte", () => {
    const { landing } = landingAt();
    expect(landing.accepts("voice-input")).toBe(true);
  });

  it("la seconde, livrée par l'autre chemin dans la même pression, ne compte pas", () => {
    const { clock, landing } = landingAt();
    expect(landing.accepts("voice-input")).toBe(true);
    clock.now += 5;
    expect(landing.accepts("voice-input")).toBe(false);
    clock.now += SHORTCUT_ONCE_MS - 6;
    expect(landing.accepts("voice-input")).toBe(false);
  });

  it("une pression suivante, au bout de la fenêtre, compte", () => {
    const { clock, landing } = landingAt();
    expect(landing.accepts("voice-input")).toBe(true);
    clock.now += SHORTCUT_ONCE_MS;
    expect(landing.accepts("voice-input")).toBe(true);
    clock.now += SHORTCUT_ONCE_MS;
    expect(landing.accepts("voice-input")).toBe(true);
  });

  it("une livraison refusée ne prolonge pas la fenêtre", () => {
    const { clock, landing } = landingAt();
    expect(landing.accepts("voice-input")).toBe(true);
    clock.now += 60;
    expect(landing.accepts("voice-input")).toBe(false);
    clock.now += 60;
    expect(landing.accepts("voice-input")).toBe(true);
  });

  it("la répétition d'une touche maintenue ne compte jamais, et ne commence pas de fenêtre", () => {
    const { clock, landing } = landingAt();
    expect(landing.accepts("voice-input", true)).toBe(false);
    clock.now += 1000;
    expect(landing.accepts("voice-input", true)).toBe(false);
    expect(landing.accepts("voice-input", false)).toBe(true);
  });

  it("une autre commande compte toujours, même répétée ou livrée deux fois : elle n'est pas une bascule", () => {
    const { landing } = landingAt();
    expect(landing.accepts("bold")).toBe(true);
    expect(landing.accepts("bold")).toBe(true);
    expect(landing.accepts("bold", true)).toBe(true);
  });
});
