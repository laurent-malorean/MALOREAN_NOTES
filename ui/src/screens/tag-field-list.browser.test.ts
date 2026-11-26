// La liste des étiquettes qui existent, proposée par le champ d'étiquettes (décision 0084) : à la prise du
// curseur et à la saisie, filtrée, sans celles du contenu, avec le nombre de notes ; un clic ou le clavier
// choisit ; une étiquette inconnue se crée toujours (« Créer “mot” »).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import "../theme.css";
import "../style.css";
import { type TagFieldOptions, tagField } from "./tag-field";

beforeAll(() => page.viewport(1000, 800));
afterEach(() => document.body.replaceChildren());

const SUGGESTIONS = [
  { name: "salon", count: 3 },
  { name: "urgent", count: 12 },
  { name: "vip", count: 1 },
  { name: "salaire" },
];

function mount(options: Partial<TagFieldOptions> = {}) {
  const changes: string[][] = [];
  const host = document.createElement("div");
  host.style.cssText = "padding:40px;width:400px";
  const element = tagField({
    tags: [],
    suggestions: SUGGESTIONS,
    change: (tags) => changes.push(tags),
    ...options,
  });
  host.append(element);
  document.body.replaceChildren(host);
  const input = element.querySelector<HTMLInputElement>(".tag-input") as HTMLInputElement;
  const type = (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const key = (name: string) => {
    const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event;
  };
  return { element, input, changes, type, key, host };
}
const rows = () =>
  [...document.querySelectorAll<HTMLElement>(".tag-suggestion")].map((r) => r.textContent);
const list = () => document.querySelector<HTMLElement>(".tag-suggestions");
const row = (name: string) =>
  [...document.querySelectorAll<HTMLElement>(".tag-suggestion")].find((r) =>
    r.textContent?.startsWith(name),
  ) as HTMLElement;

describe("champ d'étiquettes : la liste de celles qui existent", () => {
  it("s'ouvre à la prise du curseur avec toutes les étiquettes de l'espace de travail et leur nombre de notes", () => {
    const { input } = mount();
    expect(list()).toBeNull();
    input.focus();
    expect(list()?.getAttribute("role")).toBe("listbox");
    expect(rows()).toEqual(["salon3 notes", "urgent12 notes", "vip1 note", "salaire"]);
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-controls")).toBe(list()?.id);
  });

  it("écarte celles que le contenu porte déjà", () => {
    mount({ tags: ["Salon"] }).input.focus();
    expect(rows().map((r) => r?.replace(/\d.*/, ""))).toEqual(["urgent", "vip", "salaire"]);
  });

  it("filtre à la saisie et finit par « Créer “mot” » pour ce qui n'existe pas", () => {
    const { input, type } = mount();
    input.focus();
    type("sal");
    expect(rows()).toEqual(["salon3 notes", "salaire", "Créer « sal »"]);
    expect(row("Créer").classList.contains("create")).toBe(true);
    type("zzz");
    expect(rows()).toEqual(["Créer « zzz »"]);
  });

  it("n'ouvre rien quand il n'y a rien à proposer, et ferme la liste quand plus rien ne convient", () => {
    const empty = mount({ suggestions: [] });
    empty.input.focus();
    expect(list()).toBeNull();
    const { input, type } = mount();
    input.focus();
    type("vip");
    expect(list()).not.toBeNull();
    type("");
    type("   ");
    expect(rows()).toHaveLength(4);
  });

  it("ajoute l'étiquette choisie d'un clic, vide le champ et ferme la liste", () => {
    const { input, changes, type } = mount({ tags: ["a"] });
    input.focus();
    type("ur");
    row("urgent").click();
    expect(changes).toEqual([["a", "urgent"]]);
    expect(input.value).toBe("");
    expect(list()).toBeNull();
  });

  it("crée l'étiquette inconnue d'un clic sur « Créer »", () => {
    const { input, changes, type } = mount();
    input.focus();
    type("  mot neuf ");
    row("Créer").click();
    expect(changes).toEqual([["mot neuf"]]);
  });

  it("garde le curseur dans le champ quand on clique dans la liste", () => {
    const { input } = mount();
    input.focus();
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    row("salon").dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("se parcourt aux flèches et se valide par Entrée ; sans choix, Entrée ajoute le texte tapé", () => {
    const { input, changes, key } = mount();
    input.focus();
    expect(key("ArrowDown").defaultPrevented).toBe(true);
    expect(row("salon").getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(row("salon").id);
    key("ArrowDown");
    expect(row("urgent").getAttribute("aria-selected")).toBe("true");
    expect(row("salon").getAttribute("aria-selected")).toBe("false");
    key("ArrowUp");
    key("ArrowUp");
    expect(row("salaire").getAttribute("aria-selected")).toBe("true");
    key("ArrowDown");
    key("ArrowDown");
    const enter = key("Enter");
    expect(enter.defaultPrevented).toBe(true);
    expect(changes).toEqual([["urgent"]]);
    const other = mount();
    other.input.focus();
    other.type("brut");
    other.key("Enter");
    expect(other.changes).toEqual([["brut"]]);
  });

  it("rouvre la liste à la flèche du bas quand elle est fermée", () => {
    const { input, key } = mount();
    input.focus();
    key("Escape");
    expect(list()).toBeNull();
    key("ArrowDown");
    expect(list()).not.toBeNull();
    expect(key("ArrowLeft").defaultPrevented).toBe(false);
  });

  it("se ferme par Échap sans laisser passer la touche, puis la laisse passer", () => {
    const { input, host, key } = mount();
    const seen: string[] = [];
    host.addEventListener("keydown", (event) => seen.push(event.key));
    input.focus();
    key("Escape");
    expect(list()).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(seen).toEqual([]);
    key("Escape");
    expect(seen).toEqual(["Escape"]);
  });

  it("se ferme à Tab, en quittant le champ et au défilement de la page", () => {
    const { input, key } = mount();
    input.focus();
    key("Tab");
    expect(list()).toBeNull();
    input.click();
    input.blur();
    expect(list()).toBeNull();
    input.focus();
    document.body.dispatchEvent(new Event("scroll"));
    expect(list()).toBeNull();
  });

  it("reste lisible : lignes de 36 points, au moins la largeur du champ, sous le champ, dans la fenêtre", () => {
    const { input } = mount();
    input.focus();
    const field = input.getBoundingClientRect();
    const box = (list() as HTMLElement).getBoundingClientRect();
    expect(row("salon").getBoundingClientRect().height).toBe(36);
    expect(box.width).toBeGreaterThanOrEqual(Math.max(field.width, 240));
    expect(box.top).toBe(field.bottom + 4);
    expect(box.right).toBeLessThanOrEqual(window.innerWidth);
    expect(getComputedStyle(row("salon")).fontSize).toBe("15px");
  });

  it("passe au-dessus du champ quand il n'y a pas la place dessous", () => {
    const { host, input } = mount();
    host.style.cssText = "position:absolute;left:20px;top:730px;width:300px";
    input.focus();
    expect((list() as HTMLElement).getBoundingClientRect().bottom).toBe(
      input.getBoundingClientRect().top - 4,
    );
  });

  it("garde son nom pour les lecteurs d'écran : l'étiquette, puis « 3 notes »", () => {
    mount().input.focus();
    expect(row("salon").getAttribute("aria-label")).toBe("salon, 3 notes");
    expect(row("salaire").getAttribute("aria-label")).toBe("salaire");
  });
});
