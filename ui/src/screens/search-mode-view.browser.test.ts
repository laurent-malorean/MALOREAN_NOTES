import { describe, expect, it } from "vitest";
import type { SearchModeView } from "../state/meaning";
import { renderSearchMode } from "./search-mode-view";

const quiet: SearchModeView = {
  ...{ mode: "words", meaningAvailable: true, explanation: null },
  ...{ offer: null, download: null, compute: null },
};

function render(view: SearchModeView) {
  const container = document.createElement("div");
  const asked: string[] = [];
  renderSearchMode(container, view, {
    choose: (mode) => asked.push(`mode ${mode}`),
    download: (model) => asked.push(`télécharger ${model}`),
    cancelDownload: () => asked.push("annuler"),
  });
  const buttons = () => [...container.querySelectorAll("button")];
  return { container, asked, buttons };
}

describe("choix du mode de recherche", () => {
  it("propose « Par les mots » et « Par le sens » dans un groupe nommé, le mode en cours enfoncé", () => {
    const { container, buttons } = render(quiet);
    const group = container.querySelector(".search-mode-choice");
    expect(group?.getAttribute("role")).toBe("group");
    expect(group?.getAttribute("aria-label")).toBe("Mode de recherche");
    expect(buttons().map((b) => b.textContent)).toEqual(["Par les mots", "Par le sens"]);
    expect(buttons().map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    expect(buttons().map((b) => b.disabled)).toEqual([false, false]);
    expect(buttons().map((b) => b.className)).toEqual(["search-mode-button", "search-mode-button"]);
    expect(container.querySelector("p")).toBeNull();
  });

  it("marque « Par le sens » quand c'est le mode en cours", () => {
    const { buttons } = render({ ...quiet, mode: "meaning" });
    expect(buttons().map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("demande le mode cliqué", () => {
    const { buttons, asked } = render(quiet);
    buttons()[1]?.click();
    buttons()[0]?.click();
    expect(asked).toEqual(["mode meaning", "mode words"]);
  });

  it("grise seulement « Par le sens » quand le sens manque, et dit pourquoi", () => {
    const { container, buttons } = render({
      ...quiet,
      meaningAvailable: false,
      explanation: "Le modèle n'est pas téléchargé.",
    });
    expect(buttons().map((b) => b.disabled)).toEqual([false, true]);
    const note = container.querySelector("p.search-mode-note");
    expect(note?.textContent).toBe("Le modèle n'est pas téléchargé.");
  });

  it("propose le téléchargement du modèle", () => {
    const { buttons, asked } = render({
      ...quiet,
      offer: { label: "Télécharger le modèle (449 Mo)", model: "e5-small" },
    });
    const offer = buttons()[2];
    expect(offer?.textContent).toBe("Télécharger le modèle (449 Mo)");
    expect(offer?.className).toBe("tool search-mode-download");
    offer?.click();
    expect(asked).toEqual(["télécharger e5-small"]);
  });

  it("montre la progression du téléchargement, qu'on peut annuler", () => {
    const { container, asked } = render({
      ...quiet,
      download: { text: "224 Mo sur 449 Mo (50 %)", percent: 50 },
    });
    expect(container.querySelector("progress")?.value).toBe(50);
    expect(container.querySelector(".download-text")?.textContent).toBe("224 Mo sur 449 Mo (50 %)");
    expect(container.querySelector("progress")?.getAttribute("aria-label")).toBe(
      "Téléchargement du modèle",
    );
    const cancel = container.querySelector<HTMLButtonElement>(".download-progress button");
    expect(cancel?.className).toBe("link");
    expect(cancel?.textContent).toBe("Annuler le téléchargement");
    cancel?.click();
    expect(asked).toEqual(["annuler"]);
  });

  it("dit où en est le calcul", () => {
    const { container } = render({ ...quiet, compute: "Calcul du sens : 120 / 411 segments" });
    expect(container.querySelector("p.search-mode-note")?.textContent).toBe(
      "Calcul du sens : 120 / 411 segments",
    );
  });

  it("remplace ce qu'il montrait", () => {
    const { container } = render({ ...quiet, explanation: "Un" });
    renderSearchMode(container, quiet, { choose() {}, download() {}, cancelDownload() {} });
    expect(container.querySelector("p")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(2);
  });
});
