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
    expect(frame.className).toBe("index-settings");
    expect([...frame.querySelectorAll("p")].map((p) => p.className)).toEqual([
      "setting-help",
      "setting-help",
    ]);
    const button = frame.querySelector("button");
    expect(button?.className).toBe("tool");
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

  it("montre la barre orange de l'index des notes avant l'état, avec son pourcentage écrit à côté", () => {
    const frame = indexSettingsGroup();
    document.body.append(frame);
    renderIndexSettings(frame, ["631 notes indexées"], () => {}, {
      percent: 97,
      written: "631 sur 645, 97 %",
    });
    const bar = frame.querySelector(".index-bar") as HTMLElement;
    const track = bar.querySelector("[role=progressbar]") as HTMLElement;
    expect(bar.parentElement).toBe(frame);
    expect(bar.nextElementSibling?.textContent).toBe("631 notes indexées");
    expect(track.getAttribute("aria-label")).toBe("Index des notes");
    expect(track.getAttribute("aria-valuenow")).toBe("97");
    expect(bar.querySelector(".index-bar-percent")?.textContent).toBe("631 sur 645, 97 %");
    expect((bar.querySelector(".index-bar-fill") as HTMLElement).style.width).toBe("97%");
  });

  it("n'a pas de barre sans elle : ni quand le total est inconnu, ni pendant la lecture", () => {
    const frame = indexSettingsGroup();
    renderIndexSettings(frame, ["0 note indexée"], () => {}, null);
    expect(frame.querySelector(".index-bar")).toBeNull();
    renderIndexSettings(frame, null, () => {});
    expect(frame.querySelector(".index-bar")).toBeNull();
  });
});
