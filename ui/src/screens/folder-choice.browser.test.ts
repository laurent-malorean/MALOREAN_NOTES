import { afterEach, describe, expect, it } from "vitest";
import "../theme.css";
import "../style.css";
import { type FolderChoiceOptions, folderChoiceLine } from "./folder-choice";

const FOLDERS = ["Journal", "Notes", "Notes/Travail", "Notes/Travail/2026"];
const NEW = "\0nouveau";

function setup(options: Partial<FolderChoiceOptions> = {}) {
  const chosen: (string | null)[] = [];
  const host = document.createElement("div");
  host.className = "settings";
  const line = folderChoiceLine({
    ...{ id: "choix", name: "choix", label: "Dossier", help: "Aide." },
    ...{ folders: FOLDERS, current: null, none: "Aucun", creation: true },
    choose: (folder) => chosen.push(folder),
    ...options,
  });
  host.append(line);
  document.body.replaceChildren(host);
  const select = line.querySelector("select") as HTMLSelectElement;
  const field = () => line.querySelector<HTMLElement>(".folder-new") as HTMLElement;
  const input = () => line.querySelector<HTMLInputElement>(".folder-new-input") as HTMLInputElement;
  const error = () => line.querySelector<HTMLElement>(".setting-error") as HTMLElement;
  const pick = (value: string) => {
    select.value = value;
    select.dispatchEvent(new Event("change"));
  };
  const key = (name: string) => {
    const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
    input().dispatchEvent(event);
    return event;
  };
  const button = (text: string) =>
    [...line.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement;
  return { line, select, chosen, field, input, error, pick, key, button };
}

afterEach(() => document.body.replaceChildren());

describe("choix de dossier", () => {
  it("est une ligne de réglage : son nom, la liste, son aide décrivant la liste", () => {
    const { line, select } = setup();
    expect(line.className).toBe("setting");
    const label = line.querySelector("label");
    expect([label?.textContent, label?.control, select.id, select.name]).toEqual([
      "Dossier",
      select,
      "choix",
      "choix",
    ]);
    const help = document.getElementById(select.getAttribute("aria-describedby") ?? "");
    expect([help?.id, help?.className, help?.textContent]).toEqual([
      "choix-help",
      "setting-help",
      "Aide.",
    ]);
  });

  it("montre « Aucun » en tête, l'arborescence avec ses retraits, puis « Nouveau dossier… »", () => {
    const { select } = setup();
    expect([...select.options].map((o) => [o.value, o.text])).toEqual([
      ["", "Aucun"],
      ["Journal", "Journal"],
      ["Notes", "Notes"],
      ["Notes/Travail", "⎿ Travail"],
      ["Notes/Travail/2026", "  ⎿ 2026"],
      [NEW, "Nouveau dossier…"],
    ]);
    expect(select.selectedOptions[0]?.text).toBe("Aucun");
  });

  it("sans « none » ni création, ne propose que les dossiers", () => {
    const { line, select } = setup({ none: undefined, creation: false, current: "Notes" });
    expect([...select.options].map((o) => o.value)).toEqual([
      "Journal",
      "Notes",
      "Notes/Travail",
      "Notes/Travail/2026",
    ]);
    expect(select.value).toBe("Notes");
    expect(line.querySelector(".folder-new")).toBeNull();
  });

  it("montre le choix en cours, même s'il n'est pas un dossier de la liste", () => {
    const { select } = setup({ current: "Perso/Carnet" });
    expect([...select.options].map((o) => o.value).slice(-2)).toEqual(["Perso/Carnet", NEW]);
    expect(select.value).toBe("Perso/Carnet");
    expect(select.selectedOptions[0]?.text).toBe("Perso/Carnet");
  });

  it("passe le dossier choisi, ou null pour « Aucun »", () => {
    const t = setup({ current: "Notes" });
    t.pick("Notes/Travail");
    t.pick("");
    expect(t.chosen).toEqual(["Notes/Travail", null]);
  });

  it("n'a pas de champ de nom tant qu'on ne demande pas « Nouveau dossier… »", () => {
    expect(setup().field().hidden).toBe(true);
  });

  it("« Nouveau dossier… » ouvre un champ vide, sans rien choisir encore, et garde le choix en cours affiché", () => {
    const t = setup({ current: "Notes" });
    t.pick(NEW);
    expect(t.field().hidden).toBe(false);
    expect(document.activeElement).toBe(t.input());
    expect(t.input().value).toBe("");
    expect(t.select.value).toBe("Notes");
    expect(t.chosen).toEqual([]);
    expect(t.input().getAttribute("aria-label")).toBe("Nom du nouveau dossier");
  });

  it("Entrée valide un nom : il devient le choix, le champ se ferme et le focus revient à la liste", () => {
    const t = setup({ current: "Notes" });
    t.pick(NEW);
    t.input().value = "  Carnet ";
    const event = t.key("Enter");
    expect(event.defaultPrevented).toBe(true);
    expect(t.chosen).toEqual(["Carnet"]);
    expect(t.select.value).toBe("Carnet");
    expect(t.select.selectedOptions[0]?.text).toBe("Carnet");
    expect(t.field().hidden).toBe(true);
    expect(document.activeElement).toBe(t.select);
  });

  it("le bouton « Créer » valide comme Entrée", () => {
    const t = setup();
    t.pick(NEW);
    t.input().value = "Carnet";
    t.button("Créer").click();
    expect(t.chosen).toEqual(["Carnet"]);
    expect(t.field().hidden).toBe(true);
  });

  it("refuse un nom vide ou invalide : le champ reste ouvert, signale l'erreur, rien n'est choisi", () => {
    const t = setup({ current: "Notes" });
    t.pick(NEW);
    expect(t.error().hidden).toBe(true);
    for (const bad of ["", "   ", ".caché", "a/b", "x.assets", "node_modules"]) {
      t.input().value = bad;
      t.key("Enter");
      expect(t.field().hidden, bad).toBe(false);
      expect(t.error().hidden, bad).toBe(false);
      expect(t.input().getAttribute("aria-invalid"), bad).toBe("true");
    }
    expect(t.chosen).toEqual([]);
    expect(t.select.value).toBe("Notes");
    expect(t.error().textContent).toBe(
      "Ce nom ne convient pas : ni vide, ni caché (point au début), ni « / ».",
    );
    expect(t.input().getAttribute("aria-describedby")).toBe(t.error().id);
    t.input().value = "Bon";
    t.key("Enter");
    expect(t.chosen).toEqual(["Bon"]);
    expect(t.field().hidden).toBe(true);
  });

  it("Échap annule, sans fermer la fenêtre des réglages, et « Annuler » aussi", () => {
    const t = setup({ current: "Notes" });
    t.pick(NEW);
    t.input().value = "Carnet";
    const event = t.key("Escape");
    expect([event.defaultPrevented, t.field().hidden]).toEqual([true, true]);
    expect([t.chosen, t.select.value]).toEqual([[], "Notes"]);
    t.pick(NEW);
    expect(t.input().value).toBe("");
    t.button("Annuler").click();
    expect([t.chosen, t.field().hidden, document.activeElement]).toEqual([[], true, t.select]);
  });

  it("ignore les autres touches", () => {
    const t = setup();
    t.pick(NEW);
    t.input().value = "Carnet";
    const event = t.key("a");
    expect([event.defaultPrevented, t.field().hidden, t.chosen]).toEqual([false, false, []]);
  });

  it("rouvre le champ à neuf, sans l'erreur d'avant", () => {
    const t = setup();
    t.pick(NEW);
    t.input().value = "a/b";
    t.key("Enter");
    t.key("Escape");
    t.pick(NEW);
    expect([t.error().hidden, t.input().getAttribute("aria-invalid")]).toEqual([true, "false"]);
  });

  it("choisir un dossier de la liste ferme le champ ouvert", () => {
    const t = setup();
    t.pick(NEW);
    t.pick("Journal");
    expect([t.field().hidden, t.chosen]).toEqual([true, ["Journal"]]);
  });

  it("a des contrôles visibles et de taille normale : « Créer » et « Annuler »", () => {
    const t = setup();
    t.pick(NEW);
    for (const text of ["Créer", "Annuler"]) {
      const box = t.button(text).getBoundingClientRect();
      expect(box.height, text).toBeGreaterThan(28);
      expect(box.width, text).toBeGreaterThan(0);
    }
  });
});
