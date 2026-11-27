import { describe, expect, it } from "vitest";
import { createFavoriteStar } from "./favorite-star";

function mount() {
  const button = document.createElement("button");
  document.body.replaceChildren(button);
  const clicks: string[] = [];
  const star = createFavoriteStar(button, () => clicks.push("clic"));
  return { button, star, clicks };
}

describe("étoile des favoris", () => {
  it("est cachée tant qu'on ne sait rien", () => {
    const { button } = mount();
    expect(button.hidden).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Étoile");
    expect(button.type).toBe("button");
  });

  it("creuse : propose d'ajouter aux favoris, non pressée", () => {
    const { button, star } = mount();
    star.show("empty");
    expect(button.hidden).toBe(false);
    expect(button.title).toBe("Ajouter aux favoris");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("pleine : propose de retirer des favoris, pressée", () => {
    const { button, star } = mount();
    star.show("filled");
    expect(button.hidden).toBe(false);
    expect(button.title).toBe("Retirer des favoris");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("se cache de nouveau, et un clic la signale", () => {
    const { button, star, clicks } = mount();
    star.show("filled");
    star.show("hidden");
    expect(button.hidden).toBe(true);
    star.show("empty");
    button.click();
    expect(clicks).toEqual(["clic"]);
  });

  it("n'ajoute son dessin qu'une fois", () => {
    const { button, star } = mount();
    star.show("empty");
    star.show("filled");
    expect(button.querySelectorAll("svg")).toHaveLength(1);
  });
});
