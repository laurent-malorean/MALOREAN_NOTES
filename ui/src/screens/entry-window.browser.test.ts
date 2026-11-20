import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type { EntryItem } from "../bridge";
import { askEntry, type EntryWindowOptions, entryChoice } from "./entry-window";

function dialog() {
  const element = document.createElement("dialog");
  document.body.replaceChildren(element);
  return element;
}

const entry = (anchor: string, text: string, line = 0): EntryItem => ({
  anchor,
  label: `16 novembre 2026 à ${anchor.slice(11, 13)}:${anchor.slice(14, 16)}`,
  text,
  line,
});

const ENTRIES: Record<string, EntryItem[]> = {
  "levures.md": [entry("2026-11-16-09h00", "un"), entry("2026-11-16-10h00", "deux")],
  "bieres.md": [entry("2026-11-16-11h00", "trois")],
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function options(extra: Partial<EntryWindowOptions> = {}): EntryWindowOptions {
  return {
    notebooks: [
      { path: "bieres.md", title: "Bières", folder: "" },
      { path: "levures.md", title: "Levures", folder: "" },
    ],
    chosen: "levures.md",
    entriesOf: async (path) => ENTRIES[path] ?? [],
    error: () => {},
    ...extra,
  };
}

const select = (element: HTMLElement, name: string) =>
  element.querySelector<HTMLSelectElement>(`.entry-${name}`) as HTMLSelectElement;
const optionTexts = (element: HTMLSelectElement) =>
  [...element.options].map((option) => option.textContent);
const text = (element: HTMLElement) =>
  element.querySelector<HTMLTextAreaElement>(".entry-text") as HTMLTextAreaElement;
const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement;

describe("fenêtre de saisie", () => {
  it("propose le cahier, l'entrée corrigée (la plus récente d'abord) et le texte", async () => {
    const element = dialog();
    void askEntry(element, options());
    await settle();
    expect(element.open).toBe(true);
    expect(element.className).toBe("confirmation");
    expect(element.getAttribute("aria-label")).toBe("Ajouter au cahier");
    expect(element.querySelector(".confirmation-question")?.textContent).toBe("Ajouter au cahier");
    expect([...element.querySelectorAll(".entry-field > span")].map((s) => s.textContent)).toEqual([
      "Cahier",
      "Corrige",
      "Entrée",
    ]);
    expect(optionTexts(select(element, "notebook"))).toEqual(["Bières", "Levures"]);
    expect(select(element, "notebook").value).toBe("levures.md");
    expect(optionTexts(select(element, "corrected"))).toEqual([
      "Aucune : nouvelle entrée",
      "16 novembre 2026 à 10:00 — deux",
      "16 novembre 2026 à 09:00 — un",
    ]);
    expect(document.activeElement).toBe(text(element));
    expect(text(element).rows).toBe(6);
    expect([...element.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Annuler",
      "Ajouter",
    ]);
    expect(button(element, "Ajouter").className).toBe("primary");
    expect(button(element, "Annuler").className).toBe("link");
    expect(element.querySelector(".confirmation-buttons")?.childElementCount).toBe(2);
    expect(element.querySelector("form")?.className).toBe("entry-window");
  });

  it("change la liste des entrées quand on choisit un autre cahier", async () => {
    const element = dialog();
    void askEntry(element, options());
    await settle();
    select(element, "notebook").value = "bieres.md";
    select(element, "notebook").dispatchEvent(new Event("change"));
    await settle();
    expect(optionTexts(select(element, "corrected"))).toEqual([
      "Aucune : nouvelle entrée",
      "16 novembre 2026 à 11:00 — trois",
    ]);
  });

  it("sans autre cahier, ou depuis le « + » d'un cahier, n'en propose pas", async () => {
    const element = dialog();
    void askEntry(element, options({ notebooks: null }));
    await settle();
    expect(element.querySelector(".entry-notebook")).toBeNull();
    expect(element.querySelector("form")?.childNodes).toHaveLength(4);
    void askEntry(element, options({ notebooks: [{ path: "a.md", title: "A", folder: "" }] }));
    await settle();
    expect(element.querySelector(".entry-notebook")).toBeNull();
    expect([...element.querySelectorAll(".entry-field > span")].map((s) => s.textContent)).toEqual([
      "Corrige",
      "Entrée",
    ]);
  });

  it("« Ajouter » rend le cahier, le texte sur plusieurs lignes et l'entrée corrigée", async () => {
    const element = dialog();
    const answer = askEntry(element, options());
    await settle();
    await userEvent.keyboard("première{Enter}seconde");
    expect(element.open).toBe(true);
    button(element, "Ajouter").click();
    await expect(answer).resolves.toEqual({
      notebook: "levures.md",
      text: "première\nseconde",
      corrected: null,
    });
    expect(element.open).toBe(false);
    const correction = askEntry(element, options());
    await settle();
    select(element, "notebook").value = "bieres.md";
    select(element, "corrected").value = "2026-11-16-09h00";
    text(element).value = "corrigé";
    button(element, "Ajouter").click();
    await expect(correction).resolves.toEqual({
      notebook: "bieres.md",
      text: "corrigé",
      corrected: "2026-11-16-09h00",
    });
  });

  it("Annuler ou Échap ne rend rien", async () => {
    const element = dialog();
    const cancelled = askEntry(element, options());
    button(element, "Annuler").click();
    await expect(cancelled).resolves.toBeNull();
    const escaped = askEntry(element, options());
    await userEvent.keyboard("{Escape}");
    await expect(escaped).resolves.toBeNull();
  });

  it("dit l'échec de la lecture des entrées, et garde « Aucune »", async () => {
    const element = dialog();
    const errors: unknown[] = [];
    void askEntry(
      element,
      options({
        entriesOf: () => Promise.reject(new Error("illisible")),
        error: (e) => errors.push(e),
      }),
    );
    await settle();
    expect(errors).toHaveLength(1);
    expect(optionTexts(select(element, "corrected"))).toEqual(["Aucune : nouvelle entrée"]);
  });

  it("montre une entrée à corriger par son moment et le début de son texte, sur une ligne", () => {
    expect(entryChoice(entry("2026-11-16-09h00", "a\n  b"))).toBe("16 novembre 2026 à 09:00 — a b");
    const long = "x".repeat(41);
    expect(entryChoice(entry("2026-11-16-09h00", long))).toBe(
      `16 novembre 2026 à 09:00 — ${"x".repeat(40)}…`,
    );
    expect(entryChoice(entry("2026-11-16-09h00", "y".repeat(40)))).toBe(
      `16 novembre 2026 à 09:00 — ${"y".repeat(40)}`,
    );
  });
});
