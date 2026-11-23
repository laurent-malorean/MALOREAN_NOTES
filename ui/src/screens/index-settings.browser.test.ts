import { afterEach, describe, expect, it, vi } from "vitest";
import { indexSettingsGroup, renderIndexSettings } from "./index-settings";

afterEach(() => document.body.replaceChildren());

describe("réglages de l'index de mots", () => {
  it("montre son titre, l'état de l'index et le bouton pour le reconstruire", () => {
    const rebuild = vi.fn();
    const frame = indexSettingsGroup();
    document.body.append(frame);
    renderIndexSettings(frame, ["12 notes indexées", "Dernière reconstruction : aucune"], rebuild);
    expect(frame.querySelector("legend")?.textContent).toBe("Index");
    expect([...frame.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      "12 notes indexées",
      "Dernière reconstruction : aucune",
    ]);
    const button = frame.querySelector("button");
    expect([button?.textContent, button?.type]).toEqual(["Reconstruire l'index", "button"]);
    button?.click();
    expect(rebuild).toHaveBeenCalledOnce();
  });

  it("annonce la lecture tant que l'état n'est pas connu", () => {
    const frame = indexSettingsGroup();
    renderIndexSettings(frame, null, () => {});
    expect(frame.querySelector("legend")?.textContent).toBe("Index");
    expect(frame.querySelector("p")?.textContent).toBe("Lecture de l'état de l'index…");
    expect(frame.querySelector("button")?.textContent).toBe("Reconstruire l'index");
  });
});
