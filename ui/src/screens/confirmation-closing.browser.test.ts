import { describe, expect, it } from "vitest";
import { askClosing } from "./confirmation";
import "../theme.css";
import "../style.css";
import "./agenda-12.css";

function open() {
  const element = document.createElement("dialog");
  document.body.replaceChildren(element);
  void askClosing(element, "Salon A");
  return element;
}

const box = (element: HTMLElement, text: string) =>
  [...element.querySelectorAll<HTMLButtonElement>("button")]
    .find((b) => b.textContent === text)
    ?.getBoundingClientRect() as DOMRect;

describe("fenêtre de clôture : sa présentation", () => {
  it("les trois choix sont l'un sous l'autre, l'action principale en haut, « Annuler » en bas, à la largeur de la fenêtre", () => {
    const element = open();
    const [successor, alone, cancel] = ["Clore et préparer le suivant", "Clore", "Annuler"].map(
      (text) => box(element, text),
    ) as [DOMRect, DOMRect, DOMRect];
    expect(successor.bottom).toBeLessThanOrEqual(alone.top);
    expect(alone.bottom).toBeLessThanOrEqual(cancel.top);
    expect(Math.round(successor.width)).toBe(Math.round(alone.width));
    expect(Math.round(alone.width)).toBe(Math.round(cancel.width));
    const dialog = element.getBoundingClientRect();
    expect(successor.left).toBeGreaterThanOrEqual(dialog.left);
    expect(successor.right).toBeLessThanOrEqual(dialog.right);
  });

  it("les boutons ont la forme de ceux de l'application : 36 points de haut, mêmes rayons ; seule l'action principale est pleine", () => {
    const element = open();
    const style = (text: string) => {
      const button = [...element.querySelectorAll("button")].find((b) => b.textContent === text);
      return getComputedStyle(button as Element);
    };
    for (const text of ["Clore et préparer le suivant", "Clore", "Annuler"]) {
      expect(style(text).borderTopLeftRadius).toBe("8px");
      expect(box(element, text).height).toBeGreaterThanOrEqual(36);
    }
    expect(style("Clore et préparer le suivant").backgroundColor).not.toBe(
      style("Clore").backgroundColor,
    );
    expect(style("Clore").backgroundColor).toBe(style("Annuler").backgroundColor);
  });
});
