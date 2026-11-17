import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../state/settings";
import { openSettings } from "./settings-view";
import "../theme.css";
import "../style.css";

function open(settings: Settings = DEFAULT_SETTINGS) {
  const dialog = document.createElement("dialog");
  document.body.replaceChildren(dialog);
  const changes: Settings[] = [];
  openSettings(dialog, settings, (next) => changes.push(next));
  const input = dialog.querySelector<HTMLInputElement>("input[name=charactersPerPage]");
  if (!input) throw new Error("champ introuvable");
  return { dialog, input, changes };
}

function type(input: HTMLInputElement, text: string) {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const error = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>(".setting-error");

afterEach(() => document.body.replaceChildren());

describe("écran de réglages", () => {
  it("s'ouvre par-dessus la fenêtre, avec son titre et son bouton pour fermer", () => {
    const { dialog, input } = open();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("h2")?.textContent).toBe("Réglages");
    const close = dialog.querySelector("button");
    expect([close?.textContent, close?.className]).toEqual(["Fermer", "primary"]);
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(error(dialog)?.hidden).toBe(true);
  });

  it("présente chaque réglage sur sa ligne, son aide en petit sous le champ", () => {
    const { dialog, input } = open();
    expect(input.closest(".setting")).not.toBeNull();
    const described = (input.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.className);
    expect(described).toEqual(["setting-help", "setting-error"]);
    expect(dialog.querySelectorAll(".setting")).toHaveLength(1);
  });

  it("montre chaque réglage avec son nom, sa valeur et son aide", () => {
    const { dialog, input } = open({ ...DEFAULT_SETTINGS, charactersPerPage: 2000 });
    expect(input.value).toBe("2000");
    expect(input.labels?.[0]?.textContent).toBe("Caractères par page");
    expect(input.inputMode).toBe("numeric");
    const help = dialog.querySelector(`#${input.getAttribute("aria-describedby")?.split(" ")[0]}`);
    expect(help?.textContent).toContain("1 500");
  });

  it("applique un nombre valable dès qu'il est tapé", () => {
    const { input, changes, dialog } = open();
    type(input, "1000");
    type(input, "1200");
    expect(changes.map((s) => s.charactersPerPage)).toEqual([1000, 1200]);
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(error(dialog)?.hidden).toBe(true);
  });

  it("signale un nombre refusé sans rien appliquer, puis remet la dernière valeur valable", () => {
    const { input, changes, dialog } = open();
    type(input, "1000");
    type(input, "12");
    expect(changes).toHaveLength(1);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(error(dialog)?.hidden).toBe(false);
    expect(error(dialog)?.textContent).toBe("Un nombre entier entre 100 et 100\u202f000.");
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.value).toBe("1000");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(error(dialog)?.hidden).toBe(true);
  });

  it("garde un nombre valable tel quel en quittant le champ", () => {
    const { input } = open();
    type(input, "2 000");
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.value).toBe("2 000");
  });

  it("se ferme par son bouton", () => {
    const { dialog } = open();
    dialog.querySelector<HTMLButtonElement>("button")?.click();
    expect(dialog.open).toBe(false);
  });

  it("repart des réglages donnés à chaque ouverture", () => {
    const { dialog } = open();
    dialog.close();
    openSettings(dialog, { ...DEFAULT_SETTINGS, charactersPerPage: 3000 }, () => {});
    expect(dialog.querySelectorAll("input")).toHaveLength(1);
    expect(dialog.querySelector("input")?.value).toBe("3000");
  });
});
