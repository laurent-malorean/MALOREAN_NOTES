import { afterEach, describe, expect, it } from "vitest";
import "../theme.css";
import "../style.css";
import { tagColor } from "../state/tag-field";
import {
  ADD_TAG,
  removeLabel,
  TAGS_LABEL,
  type TagFieldOptions,
  tagField,
  VALIDATE_TAG,
} from "./tag-field";

afterEach(() => document.body.replaceChildren());

function mount(options: Partial<TagFieldOptions> = {}) {
  const changes: string[][] = [];
  const element = tagField({
    tags: [],
    suggestions: [],
    change: (tags) => changes.push(tags),
    ...options,
  });
  document.body.append(element);
  const input = () => element.querySelector<HTMLInputElement>(".tag-input") as HTMLInputElement;
  const button = (label: string) =>
    element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) as HTMLButtonElement;
  const type = (text: string) => {
    input().value = text;
    input().dispatchEvent(new Event("input", { bubbles: true }));
  };
  const enter = () =>
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
  return { element, changes, input, button, type, enter };
}

describe("champ d'étiquettes", () => {
  it("est un groupe nommé, avec un champ et un bouton « + » même sans étiquette", () => {
    const { element, input, button } = mount();
    expect(element.getAttribute("role")).toBe("group");
    expect(element.getAttribute("aria-label")).toBe(TAGS_LABEL);
    expect(TAGS_LABEL).toBe("Étiquettes");
    expect(element.querySelectorAll(".tag-chip")).toHaveLength(0);
    expect(input().getAttribute("aria-label")).toBe("Ajouter une étiquette");
    expect(ADD_TAG).toBe("Ajouter une étiquette");
    expect(input().placeholder).toBe("Ajouter une étiquette");
    expect(button("Ajouter l'étiquette").textContent).toBe("+");
    expect(VALIDATE_TAG).toBe("Ajouter l'étiquette");
    expect(button(VALIDATE_TAG).title).toBe("Ajouter l'étiquette");
  });

  it("montre chaque étiquette en pastille de sa couleur avec « × »", () => {
    const { element } = mount({ tags: ["urgent", "Salon"] });
    const chips = [...element.querySelectorAll<HTMLElement>(".tag-chip")];
    expect(chips.map((c) => c.textContent)).toEqual(["urgent×", "Salon×"]);
    expect(chips.map((c) => c.dataset.tag)).toEqual(["urgent", "Salon"]);
    expect(chips[0]?.style.getPropertyValue("--label-color")).toBe(
      `var(--palette-${tagColor("urgent")})`,
    );
    const remove = element.querySelector<HTMLElement>(".tag-remove") as HTMLElement;
    expect(remove.getAttribute("aria-label")).toBe("Retirer l'étiquette urgent");
    expect(removeLabel("a")).toBe("Retirer l'étiquette a");
    expect((remove as HTMLButtonElement).type).toBe("button");
  });

  it("retire une étiquette d'un clic sur sa croix, les autres gardées dans leur ordre", () => {
    const { button, changes } = mount({ tags: ["a", "b", "c"] });
    button("Retirer l'étiquette b").click();
    expect(changes).toEqual([["a", "c"]]);
  });

  it("ajoute à Entrée le texte tapé, sans espaces autour, et vide le champ", () => {
    const { input, type, enter, changes } = mount({ tags: ["a"] });
    type("  vip ");
    enter();
    expect(changes).toEqual([["a", "vip"]]);
    expect(input().value).toBe("");
  });

  it("ajoute au clic sur « + » et vide le champ", () => {
    const { input, button, type, changes } = mount({ tags: ["a"] });
    type("vip");
    button(VALIDATE_TAG).click();
    expect(changes).toEqual([["a", "vip"]]);
    expect(input().value).toBe("");
  });

  it("n'envoie rien pour une étiquette vide ou déjà là, la casse ne comptant pas, mais vide le champ", () => {
    const { input, button, type, enter, changes } = mount({ tags: ["Salon"] });
    type("   ");
    enter();
    type("salon");
    enter();
    type("SALON");
    button(VALIDATE_TAG).click();
    expect(changes).toEqual([]);
    expect(input().value).toBe("");
  });

  it("donne le curseur au champ quand « + » est cliqué sans rien de tapé", () => {
    const { input, button, changes } = mount();
    button(VALIDATE_TAG).click();
    expect(document.activeElement).toBe(input());
    expect(changes).toEqual([]);
  });

  it("ne réagit qu'à Entrée dans le champ", () => {
    const { input, type, changes } = mount();
    type("vip");
    const other = new KeyboardEvent("keydown", { key: "a", cancelable: true });
    input().dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    expect(changes).toEqual([]);
    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    input().dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
  });

  it("propose les étiquettes qui existent, sans celles du contenu, par la liste du champ", () => {
    const { element, input } = mount({
      tags: ["Salon"],
      suggestions: ["salon", "urgent", "vip"],
    });
    const list = element.querySelector("datalist") as HTMLDataListElement;
    expect(input().getAttribute("list")).toBe(list.id);
    expect([...list.options].map((o) => o.value)).toEqual(["urgent", "vip"]);
  });

  it("donne à chaque champ sa propre liste de suggestions", () => {
    const first = mount();
    const second = mount();
    const ids = [first, second].map((m) => m.input().getAttribute("list"));
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => id !== null && id !== "")).toBe(true);
  });

  it("garde le texte tapé par la mémoire donnée, et le rend à un nouveau champ", () => {
    let kept = "";
    const draft = {
      get: () => kept,
      set: (text: string) => {
        kept = text;
      },
    };
    const { type, enter } = mount({ draft });
    type("vi");
    expect(kept).toBe("vi");
    expect(mount({ draft }).input().value).toBe("vi");
    enter();
    expect(kept).toBe("");
  });

  it("donne à son champ de saisie les données de l'appelant, pour qu'il lui rende le curseur", () => {
    const { input } = mount({ data: { field: "tag", keep: "tags-x" } });
    expect(input().dataset.field).toBe("tag");
    expect(input().dataset.keep).toBe("tags-x");
    expect(Object.keys(mount().input().dataset)).toEqual([]);
  });
});
