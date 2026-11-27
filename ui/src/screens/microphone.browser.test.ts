import { describe, expect, it } from "vitest";
import { buildFormatBar, showNoteShown } from "./format-bar";
import { microphoneButton, showMicrophone } from "./microphone";
import type { Microphone } from "../state/voice-input";
import "../theme.css";
import "../style.css";

function setup() {
  const bar = document.createElement("div");
  document.body.replaceChildren(bar);
  buildFormatBar(bar, () => undefined);
  const button = microphoneButton(bar) as HTMLButtonElement;
  return { bar, button };
}

const idle: Microphone = { kind: "idle", title: "Saisie vocale (Ctrl+Maj+D)", enabled: true };

describe("le micro de la bande du haut", () => {
  it("est un bouton de la barre de mise en forme, juste avant le sélecteur de date", () => {
    const { bar, button } = setup();
    const group = button.parentElement as HTMLElement;
    const names = [...group.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
    expect(names.at(-2)).toBe("Saisie vocale");
    expect(names.at(-1)).toBe("Insérer la date du jour");
    expect(group).toBe(bar.firstElementChild);
    expect(button.classList.contains("format-button")).toBe(true);
    expect(button.title).toBe("Saisie vocale (Ctrl+Maj+D)");
  });

  it("garde la taille de ses voisins", () => {
    const { button } = setup();
    showMicrophone(button, idle);
    const size = (element: Element) => {
      const box = element.getBoundingClientRect();
      return [box.width, box.height];
    };
    const neighbour = button.previousElementSibling as HTMLElement;
    expect(size(button)).toEqual(size(neighbour));
  });

  it("au repos : icône de micro, non enfoncé, cliquable", () => {
    const { button } = setup();
    showMicrophone(button, idle);
    expect(button.title).toBe("Saisie vocale (Ctrl+Maj+D)");
    expect(button.getAttribute("aria-label")).toBe("Saisie vocale");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.disabled).toBe(false);
    expect(button.dataset.icon).toBe("microphone");
    expect(button.classList.contains("voice-idle")).toBe(true);
    expect(button.querySelectorAll("svg")).toHaveLength(1);
  });

  it("en préparation : l'icône tourne et la bulle le dit", () => {
    const { button } = setup();
    showMicrophone(button, {
      kind: "preparing",
      title: "Saisie vocale : préparation de la langue…",
      enabled: true,
    });
    expect(button.dataset.icon).toBe("spinner");
    expect(button.title).toBe("Saisie vocale : préparation de la langue…");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.classList.contains("voice-preparing")).toBe(true);
    expect(getComputedStyle(button.querySelector("svg") as Element).animationName).toBe(
      "voice-spin",
    );
    expect(button.querySelectorAll("svg")).toHaveLength(1);
  });

  it("en écoute : icône pleine rouge, aria-pressed vrai, témoin de niveau qui suit la voix", () => {
    const { button } = setup();
    showMicrophone(
      button,
      { kind: "listening", title: "Arrêter la saisie vocale", enabled: true },
      0.6,
    );
    expect(button.title).toBe("Arrêter la saisie vocale");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    const gauge = button.querySelector<HTMLElement>(".voice-level") as HTMLElement;
    expect(gauge.hidden).toBe(false);
    expect(gauge.style.getPropertyValue("--voice-level")).toBe("0.6");
    const root = getComputedStyle(document.documentElement);
    const red = root.getPropertyValue("--danger").trim();
    expect(red).not.toBe("");
    const probe = document.createElement("i");
    probe.style.color = red;
    document.body.append(probe);
    expect(getComputedStyle(button).color).toBe(getComputedStyle(probe).color);
    expect(getComputedStyle(button.querySelector("path") as Element).fill).toBe(
      getComputedStyle(probe).color,
    );
    showMicrophone(
      button,
      { kind: "listening", title: "Arrêter la saisie vocale", enabled: true },
      0.2,
    );
    expect(gauge.style.getPropertyValue("--voice-level")).toBe("0.2");
    expect(button.querySelectorAll(".voice-level")).toHaveLength(1);
  });

  it("revenu au repos : le témoin disparaît", () => {
    const { button } = setup();
    showMicrophone(button, { kind: "listening", title: "Arrêter", enabled: true }, 0.5);
    showMicrophone(button, idle);
    expect((button.querySelector(".voice-level") as HTMLElement).hidden).toBe(true);
    expect(button.dataset.icon).toBe("microphone");
  });

  it("indisponible : grisé, la bulle dit pourquoi ; un accès refusé reste cliquable", () => {
    const { button } = setup();
    showMicrophone(button, {
      kind: "unavailable",
      title: "Saisie vocale : ouvrez une note",
      enabled: false,
    });
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Saisie vocale : ouvrez une note");
    expect(getComputedStyle(button).opacity).toBe(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--format-bar-disabled-opacity")
        .trim(),
    );
    showMicrophone(button, {
      kind: "unavailable",
      title: "Saisie vocale : accès au micro refusé",
      enabled: true,
    });
    expect(button.disabled).toBe(false);
    expect(button.classList.contains("voice-unavailable")).toBe(true);
  });

  it("la barre ne le grise ni ne le rend actif : il dit lui-même pourquoi", () => {
    const { bar, button } = setup();
    showMicrophone(button, idle);
    showNoteShown(bar, false);
    expect(button.disabled).toBe(false);
    expect((bar.querySelector('[data-command="bold"]') as HTMLButtonElement).disabled).toBe(true);
    showMicrophone(button, { kind: "unavailable", title: "x", enabled: false });
    showNoteShown(bar, true);
    expect(button.disabled).toBe(true);
  });

  it("n'existe pas dans une barre sans lui", () => {
    expect(microphoneButton(document.createElement("div"))).toBeNull();
  });
});
