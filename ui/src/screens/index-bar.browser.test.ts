import { afterEach, describe, expect, it } from "vitest";
import "../theme.css";
import "../style.css";
import { indexBar } from "./index-bar";

afterEach(() => document.body.replaceChildren());

describe("barre de progression d'un index", () => {
  it("a son nom, un rôle de barre de progression et sa valeur", () => {
    const element = indexBar("Index de sens", 62);
    const track = element.querySelector<HTMLElement>("[role=progressbar]");
    expect(element.className).toBe("index-bar");
    expect(element.querySelector(".index-bar-name")?.textContent).toBe("Index de sens");
    expect(track?.className).toBe("index-bar-track");
    expect(
      ["aria-label", "aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext"].map((a) =>
        track?.getAttribute(a),
      ),
    ).toEqual(["Index de sens", "0", "100", "62", "62 %"]);
    expect(element.querySelector(".index-bar-percent")?.textContent).toBe("62 %");
  });

  it("remplit sa piste du pourcentage, en orange sur du gris, aux couleurs de la palette", () => {
    document.body.append(indexBar("Index de sens", 40));
    const track = document.querySelector<HTMLElement>(".index-bar-track");
    const fill = document.querySelector<HTMLElement>(".index-bar-fill");
    if (!track || !fill) throw new Error("barre introuvable");
    expect(fill.style.width).toBe("40%");
    const probe = document.createElement("span");
    probe.style.color = "var(--palette-orange)";
    document.body.append(probe);
    expect(getComputedStyle(fill).backgroundColor).toBe(getComputedStyle(probe).color);
    expect(getComputedStyle(track).backgroundColor).not.toBe(
      getComputedStyle(fill).backgroundColor,
    );
    expect(
      Math.round((fill.getBoundingClientRect().width / track.getBoundingClientRect().width) * 100),
    ).toBe(40);
  });

  it("peut être vide ou pleine", () => {
    const widths = [0, 100].map(
      (p) => indexBar("x", p).querySelector<HTMLElement>(".index-bar-fill")?.style.width,
    );
    expect(widths).toEqual(["0%", "100%"]);
  });
});
