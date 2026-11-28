import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { detailOf } from "../../test-support/agenda-12-fixture";
import { createEventBand } from "./agenda-12-event-band";
import { askClosing } from "./confirmation";
import "../theme.css";
import "../style.css";

// Les couleurs des boutons de la bande d'un événement et de la fenêtre de clôture (spécification § 4.2) : « Clore »
// en orange d'avertissement du thème, la corbeille en icône rouge au survol et au focus, « Rouvrir » à bordure neutre.

afterEach(() => {
  document.body.replaceChildren();
  delete document.documentElement.dataset.appearance;
});

async function mountBand(closed = false) {
  const band = createEventBand({
    path: "pro/salons/embedded.md",
    currentYear: () => 2026,
    error: () => {},
    errorText: String,
    flush: async () => {},
    followText: async () => {},
    open: async () => {},
    askClosing: async () => null,
    trashEvent: async () => {},
    backend: {
      readAgenda12Event: async () => detailOf(undefined, closed),
      changeAgenda12Event: async () => null,
      closeAgenda12Event: async () => ({ closed: "", successor: null }),
      reopenAgenda12Event: async () => ({ path: "" }),
      listCountries: async () => [],
    },
  });
  document.body.replaceChildren(band.element);
  await band.reload();
}

const named = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  ) as HTMLButtonElement;
const style = (element: Element) => getComputedStyle(element);
/** Une couleur du thème, telle que le navigateur la calcule. */
function themed(name: string, property: "color" | "backgroundColor" = "color"): string {
  const probe = document.createElement("i");
  probe.style[property] = `var(--${name})`;
  document.body.append(probe);
  const value = getComputedStyle(probe)[property];
  probe.remove();
  return value;
}
const channels = (color: string): number[] => color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
function luminance(color: string): number {
  const raw = channels(color);
  const unit = color.startsWith("color(") ? raw.slice(0, 3) : raw.slice(0, 3).map((c) => c / 255);
  const [r, g, b] = unit.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

for (const appearance of ["light", "dark"]) {
  describe(`couleurs des boutons de la bande et de la fenêtre de clôture (thème ${appearance})`, () => {
    const dark = () => {
      if (appearance === "dark") document.documentElement.dataset.appearance = "dark";
    };

    it("« Clore » est orange d'avertissement, pas bleu, avec un texte lisible", async () => {
      dark();
      await mountBand();
      const close = style(named("Clore"));
      expect(close.backgroundColor).toBe(themed("warning", "backgroundColor"));
      expect(close.backgroundColor).not.toBe(themed("accent", "backgroundColor"));
      expect(close.color).toBe(themed("on-warning"));
      expect(contrast(close.color, close.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    });

    it("au survol « Clore » s'assombrit ou s'éclaircit sans changer de teinte, et garde un texte lisible ; au focus il a un contour orange", async () => {
      dark();
      await mountBand();
      const close = named("Clore");
      const rest = style(close).backgroundColor;
      await userEvent.hover(close);
      const hovered = style(close).backgroundColor;
      expect(hovered).not.toBe(rest);
      expect(contrast(style(close).color, hovered)).toBeGreaterThanOrEqual(4.5);
      await userEvent.unhover(close);
      await userEvent.keyboard("{Tab}");
      close.focus({ focusVisible: true } as FocusOptions);
      expect(style(close).outlineColor).toBe(themed("warning"));
    });

    it("la corbeille reste une icône seule, grise, rouge au survol et au focus", async () => {
      dark();
      await mountBand();
      const trash = named("Placer dans la corbeille");
      expect(trash.textContent).toBe("");
      expect(style(trash).color).toBe(themed("muted"));
      await userEvent.hover(trash);
      expect(style(trash).color).toBe(themed("danger"));
      await userEvent.unhover(trash);
      expect(style(trash).color).toBe(themed("muted"));
      await userEvent.keyboard("{Tab}");
      trash.focus({ focusVisible: true } as FocusOptions);
      expect(style(trash).color).toBe(themed("danger"));
    });

    it("« Rouvrir » reste un bouton à bordure neutre, ni orange ni bleu plein", async () => {
      dark();
      await mountBand(true);
      const reopen = style(named("Rouvrir"));
      expect(reopen.backgroundColor).toBe(themed("bg", "backgroundColor"));
      expect(reopen.borderTopColor).toBe(themed("border"));
      expect(reopen.color).toBe(themed("text"));
    });

    it("la fenêtre de clôture : les deux « Clore » reprennent le même orange, « Annuler » reste neutre", () => {
      dark();
      const dialog = document.createElement("dialog");
      document.body.replaceChildren(dialog);
      void askClosing(dialog, "Salon A");
      const orange = themed("warning", "backgroundColor");
      for (const text of ["Clore", "Clore et préparer le suivant"]) {
        const button = style(named(text));
        expect(button.backgroundColor).toBe(orange);
        expect(button.color).toBe(themed("on-warning"));
        expect(contrast(button.color, button.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      }
      const cancel = style(named("Annuler"));
      expect(cancel.backgroundColor).toBe(themed("bg", "backgroundColor"));
      expect(cancel.color).toBe(themed("text"));
      expect(cancel.borderTopColor).toBe(themed("border"));
    });
  });
}
