import { afterEach, describe, expect, it, vi } from "vitest";
import { COUNTRIES, FRANCE, GERMANY } from "../../test-support/agenda-12-fixture";
import { createCountryField } from "./agenda-12-country";
import "../theme.css";
import "../style.css";

afterEach(() => document.body.replaceChildren());

function mount(load = async () => COUNTRIES) {
  const changes: (string | null)[] = [];
  const errors: unknown[] = [];
  const loads = vi.fn(load);
  const field = createCountryField({
    load: loads,
    change: (code) => changes.push(code),
    error: (error) => errors.push(error),
  });
  document.body.replaceChildren(field.element);
  return { field, changes, errors, loads };
}

const options = () =>
  [...document.querySelectorAll<HTMLElement>(".agenda-country-option")].map((o) => o.textContent);
const list = () => document.querySelector(".agenda-country-list") as HTMLElement;
const clear = () => document.querySelector(".agenda-country-clear") as HTMLButtonElement;

function type(input: HTMLInputElement, text: string) {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event("input"));
}

const key = (input: HTMLInputElement, name: string) =>
  input.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));

describe("champ pays", () => {
  it("est nommé « Pays », fermé, et vide sans pays", () => {
    const { field } = mount();
    expect(field.input.getAttribute("aria-label")).toBe("Pays");
    expect(field.input.getAttribute("role")).toBe("combobox");
    expect(field.input.getAttribute("aria-expanded")).toBe("false");
    expect(list().hidden).toBe(true);
    expect(field.input.value).toBe("");
    expect(clear().hidden).toBe(true);
  });

  it("montre le pays par son drapeau et son nom, et un bouton pour le retirer", () => {
    const { field } = mount();
    field.show(GERMANY);
    expect(field.input.value).toBe("🇩🇪 Allemagne");
    expect(clear().hidden).toBe(false);
    field.show(null);
    expect(field.input.value).toBe("");
    expect(clear().hidden).toBe(true);
  });

  it("au curseur, la liste de tous les pays s'ouvre ; elle n'est lue qu'une fois", async () => {
    const { field, loads } = mount();
    field.input.focus();
    await vi.waitFor(() => expect(options()).toHaveLength(3));
    expect(options()[0]).toBe("🇩🇪 Allemagne");
    expect(field.input.getAttribute("aria-expanded")).toBe("true");
    field.input.blur();
    field.input.focus();
    await vi.waitFor(() => expect(list().hidden).toBe(false));
    expect(loads).toHaveBeenCalledTimes(1);
  });

  it("en tapant, la liste se filtre sans compter accents ni majuscules", async () => {
    const { field } = mount();
    type(field.input, "COTE");
    await vi.waitFor(() => expect(options()).toEqual(["🇨🇮 Côte d'Ivoire"]));
    type(field.input, "zzz");
    await vi.waitFor(() => expect(options()).toEqual([]));
  });

  it("un clic sur un pays le choisit, par son code, et ferme la liste", async () => {
    const { field, changes } = mount();
    field.input.focus();
    await vi.waitFor(() => expect(options()).toHaveLength(3));
    list().querySelector<HTMLElement>('[data-code="FR"]')?.click();
    expect(changes).toEqual(["FR"]);
    expect(list().hidden).toBe(true);
  });

  it("choisir le pays déjà là ne change rien", async () => {
    const { field, changes } = mount();
    field.show(FRANCE);
    field.input.focus();
    await vi.waitFor(() => expect(options()).toHaveLength(3));
    list().querySelector<HTMLElement>('[data-code="FR"]')?.click();
    expect(changes).toEqual([]);
  });

  it("au clavier : ↓ descend, ↑ remonte (en boucle), Entrée choisit le pays marqué", async () => {
    const { field, changes } = mount();
    field.input.focus();
    await vi.waitFor(() => expect(options()).toHaveLength(3));
    const marked = () =>
      [...list().children].findIndex((o) => o.getAttribute("aria-selected") === "true");
    expect(marked()).toBe(0);
    key(field.input, "ArrowDown");
    expect(marked()).toBe(1);
    key(field.input, "ArrowUp");
    key(field.input, "ArrowUp");
    expect(marked()).toBe(2);
    key(field.input, "ArrowDown");
    expect(marked()).toBe(0);
    key(field.input, "ArrowDown");
    key(field.input, "Enter");
    expect(changes).toEqual(["FR"]);
  });

  it("Entrée sans pays trouvé ne choisit rien ; les flèches non plus", async () => {
    const { field, changes } = mount();
    type(field.input, "zzz");
    await vi.waitFor(() => expect(options()).toEqual([]));
    key(field.input, "ArrowDown");
    key(field.input, "Enter");
    expect(changes).toEqual([]);
  });

  it("Échap ferme la liste et remet le pays de l'événement", async () => {
    const { field, changes } = mount();
    field.show(GERMANY);
    type(field.input, "fra");
    await vi.waitFor(() => expect(options()).toEqual(["🇫🇷 France"]));
    key(field.input, "Escape");
    expect(list().hidden).toBe(true);
    expect(field.input.value).toBe("🇩🇪 Allemagne");
    expect(changes).toEqual([]);
  });

  it("quitter le champ ferme la liste et remet le pays", async () => {
    const { field } = mount();
    type(field.input, "fra");
    await vi.waitFor(() => expect(list().hidden).toBe(false));
    field.input.blur();
    expect(list().hidden).toBe(true);
    expect(field.input.value).toBe("");
  });

  it("une saisie en cours n'est pas écrasée quand l'événement est relu", async () => {
    const { field } = mount();
    type(field.input, "fra");
    await vi.waitFor(() => expect(list().hidden).toBe(false));
    field.show(GERMANY);
    expect(field.input.value).toBe("fra");
  });

  it("le bouton « Retirer le pays » retire le pays", () => {
    const { field, changes } = mount();
    field.show(GERMANY);
    expect(clear().getAttribute("aria-label")).toBe("Retirer le pays");
    clear().click();
    expect(changes).toEqual([null]);
  });

  it("la liste des pays illisible est dite, et la liste ne s'ouvre pas", async () => {
    const { field, errors } = mount(async () => {
      throw { message: "pays illisibles" };
    });
    field.input.focus();
    await vi.waitFor(() => expect(errors).toEqual([{ message: "pays illisibles" }]));
    expect(list().hidden).toBe(true);
  });
});
