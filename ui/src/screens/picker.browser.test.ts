import { afterEach, describe, expect, it } from "vitest";
import { openPicker } from "./picker";
import "../theme.css";
import "../style.css";

interface Fruit {
  readonly name: string;
  readonly colour?: string;
}

const FRUITS: readonly Fruit[] = [
  { name: "Pomme", colour: "verte" },
  { name: "Poire" },
  { name: "Prune", colour: "violette" },
];

function open(items: readonly Fruit[] = FRUITS) {
  const dialog = document.createElement("dialog");
  document.body.replaceChildren(dialog);
  const chosen: string[] = [];
  openPicker(dialog, {
    label: "Fruits",
    placeholder: "Nom du fruit",
    empty: "Aucun fruit",
    entries: (query) => items.filter((f) => f.name.toLowerCase().includes(query.toLowerCase())),
    describe: (fruit) => ({ label: fruit.name, detail: fruit.colour }),
    choose: (fruit) => chosen.push(fruit.name),
  });
  const input = dialog.querySelector("input") as HTMLInputElement;
  return { dialog, input, chosen };
}

function type(input: HTMLInputElement, text: string) {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function press(input: HTMLInputElement, key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  return event;
}

const field = (dialog: HTMLElement) => dialog.querySelector("input") as HTMLInputElement;

const options = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll<HTMLElement>("[role=option]")].map((o) => [
    o.querySelector(".picker-label")?.textContent,
    o.querySelector(".picker-detail")?.textContent ?? null,
    o.getAttribute("aria-selected"),
  ]);

afterEach(() => document.body.replaceChildren());

describe("fenêtre de choix au clavier", () => {
  it("s'ouvre avec le champ prêt à taper et tous les choix, le premier en avant", () => {
    const { dialog, input } = open();
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-label")).toBe("Fruits");
    expect(document.activeElement).toBe(input);
    expect(input.placeholder).toBe("Nom du fruit");
    expect(input.getAttribute("aria-label")).toBe("Fruits");
    expect(options(dialog)).toEqual([
      ["Pomme", "verte", "true"],
      ["Poire", null, "false"],
      ["Prune", "violette", "false"],
    ]);
    const list = dialog.querySelector("[role=listbox]") as HTMLElement;
    expect(input.getAttribute("aria-controls")).toBe(list.id);
    expect(input.getAttribute("aria-activedescendant")).toBe(
      dialog.querySelector("[role=option]")?.id,
    );
  });

  it("porte les rôles et les classes que le thème met en forme", () => {
    const { dialog, input } = open();
    const list = dialog.querySelector("ul") as HTMLElement;
    const first = dialog.querySelector("li") as HTMLElement;
    expect([dialog.className, input.className, list.className, first.className]).toEqual([
      "picker",
      "picker-input",
      "picker-list",
      "picker-option",
    ]);
    expect(input.getAttribute("role")).toBe("combobox");
    expect(first.id).toBe("picker-option-0");
    expect(list.id).toBe("picker-list");
  });

  it("garde le choix en avant visible dans une longue liste, sans sauter", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ name: `Fruit ${i}` }));
    const { dialog, input } = open(many);
    for (let i = 0; i < 30; i += 1) press(input, "ArrowDown");
    const list = (dialog.querySelector("ul") as HTMLElement).getBoundingClientRect();
    const active = (
      dialog.querySelector("[aria-selected=true]") as HTMLElement
    ).getBoundingClientRect();
    expect(active.bottom).toBeLessThanOrEqual(list.bottom + 1);
    // Au plus près : le choix arrive en bas de la liste, pas tout en haut.
    expect(active.top).toBeGreaterThan(list.top + active.height);
  });

  it("filtre les choix à chaque lettre tapée", () => {
    const { dialog, input } = open();
    type(input, "pr");
    expect(options(dialog)).toEqual([["Prune", "violette", "true"]]);
  });

  it("dit quand rien ne correspond", () => {
    const { dialog, input } = open();
    type(input, "kiwi");
    expect(options(dialog)).toEqual([]);
    expect(dialog.querySelector(".picker-empty")?.textContent).toBe("Aucun fruit");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    expect(press(input, "Enter").defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);
  });

  it("se déplace avec les flèches, sans sortir de la liste", () => {
    const { dialog, input } = open();
    expect(press(input, "ArrowDown").defaultPrevented).toBe(true);
    press(input, "ArrowDown");
    press(input, "ArrowDown");
    expect(options(dialog).map((o) => o[2])).toEqual(["false", "false", "true"]);
    expect(press(input, "ArrowUp").defaultPrevented).toBe(true);
    press(input, "ArrowUp");
    press(input, "ArrowUp");
    expect(options(dialog).map((o) => o[2])).toEqual(["true", "false", "false"]);
    expect(press(input, "a").defaultPrevented).toBe(false);
  });

  it("Entrée prend le choix en avant et ferme la fenêtre", () => {
    const { dialog, input, chosen } = open();
    press(input, "ArrowDown");
    expect(press(input, "Enter").defaultPrevented).toBe(true);
    expect(chosen).toEqual(["Poire"]);
    expect(dialog.open).toBe(false);
  });

  it("revient au premier choix quand on tape", () => {
    const { input, chosen } = open();
    press(input, "ArrowDown");
    type(input, "p");
    press(input, "Enter");
    expect(chosen).toEqual(["Pomme"]);
  });

  it("un clic prend le choix et ferme la fenêtre", () => {
    const { dialog, chosen } = open();
    dialog.querySelectorAll<HTMLElement>("[role=option]")[2]?.click();
    expect(chosen).toEqual(["Prune"]);
    expect(dialog.open).toBe(false);
  });

  it("un clic à côté de la fenêtre la ferme sans rien choisir ; un clic dedans, non", () => {
    const { dialog, input, chosen } = open();
    const click = (target: Element) =>
      target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    click(input);
    click(dialog.querySelector("[role=listbox]") as Element);
    expect(dialog.open).toBe(true);
    click(dialog);
    expect(dialog.open).toBe(false);
    expect(chosen).toEqual([]);
  });

  it("le champ et la liste couvrent toute la fenêtre : un clic dedans ne tombe jamais sur son fond", () => {
    const { dialog } = open();
    const box = dialog.getBoundingClientRect();
    const covered = [field(dialog), dialog.querySelector("[role=listbox]") as HTMLElement]
      .map((element) => element.getBoundingClientRect())
      .reduce((height, part) => height + part.height, 0);
    expect(Math.abs(box.height - covered)).toBeLessThanOrEqual(2);
    const centre = document.elementFromPoint(box.left + box.width / 2, box.bottom - 3);
    expect(centre).not.toBe(dialog);
  });

  it("repart de zéro à chaque ouverture", () => {
    const { dialog, input } = open();
    type(input, "pr");
    dialog.close();
    openPicker(dialog, {
      label: "Autre",
      placeholder: "",
      empty: "",
      entries: () => [{ name: "Kiwi" }],
      describe: (fruit) => ({ label: fruit.name }),
      choose: () => {},
    });
    expect(dialog.querySelector("input")?.value).toBe("");
    expect(options(dialog)).toEqual([["Kiwi", null, "true"]]);
  });
});
