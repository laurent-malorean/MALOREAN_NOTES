import { describe, expect, it } from "vitest";
import { renderTagFilter, renderTagsList, tagChips } from "./tags-view";

function container() {
  const element = document.createElement("div");
  document.body.replaceChildren(element);
  return element;
}

describe("étiquettes d'une note", () => {
  it("une note sans étiquette n'en montre aucune", () => {
    expect(tagChips([], () => {})).toBeNull();
  });

  it("chaque étiquette est une pastille ; un clic la choisit sans ouvrir la note", () => {
    const parent = container();
    const opened: string[] = [];
    parent.addEventListener("click", () => opened.push("note"));
    const chosen: string[] = [];
    const chips = tagChips(["perso", "loisirs"], (tag) => chosen.push(tag)) as HTMLElement;
    parent.append(chips);
    expect(chips.className).toBe("note-tags");
    const items = [...chips.querySelectorAll<HTMLElement>(".note-tag")];
    expect(items.map((item) => item.textContent)).toEqual(["#perso", "#loisirs"]);
    expect(items[0]?.title).toBe("Notes portant l'étiquette « perso »");
    items[1]?.click();
    expect(chosen).toEqual(["loisirs"]);
    expect(opened).toEqual([]);
  });

  it("une étiquette n'est que du texte", () => {
    const chips = tagChips(["<b>x</b>"], () => {}) as HTMLElement;
    expect(chips.querySelector("b")).toBeNull();
  });
});

describe("liste des étiquettes", () => {
  it("chaque étiquette avec son nombre de notes ; celle du filtre est choisie ; un clic filtre", () => {
    const list = container();
    const chosen: string[] = [];
    const tags = [
      { name: "loisirs", count: 1 },
      { name: "perso", count: 3 },
    ];
    renderTagsList(list, tags, "perso", (tag) => chosen.push(tag));
    expect(list.querySelector(".tags-heading")?.textContent).toBe("Étiquettes");
    const items = [...list.querySelectorAll<HTMLButtonElement>(".tag-item")];
    expect(items.map((item) => item.querySelector(".tag-name")?.textContent)).toEqual([
      "#loisirs",
      "#perso",
    ]);
    expect(items.map((item) => item.querySelector(".tag-count")?.textContent)).toEqual(["1", "3"]);
    expect(items.map((item) => item.classList.contains("selected"))).toEqual([false, true]);
    items[0]?.click();
    expect(chosen).toEqual(["loisirs"]);
  });

  it("sans étiquette, la liste est vide et cachée", () => {
    const list = container();
    renderTagsList(list, [{ name: "a", count: 1 }], null, () => {});
    expect(list.hidden).toBe(false);
    renderTagsList(list, [], null, () => {});
    expect(list.childElementCount).toBe(0);
    expect(list.hidden).toBe(true);
  });
});

describe("barre du filtre", () => {
  it("nomme l'étiquette du filtre ; sa croix le retire", () => {
    const bar = container();
    let cleared = 0;
    renderTagFilter(bar, "perso", () => (cleared += 1));
    expect(bar.hidden).toBe(false);
    expect(bar.querySelector(".tag-filter-name")?.textContent).toBe("#perso");
    const cross = bar.querySelector<HTMLButtonElement>(".tag-filter-clear");
    expect(cross?.getAttribute("aria-label")).toBe("Retirer le filtre");
    expect(cross?.textContent).toBe("×");
    expect(cross?.title).toBe("Retirer le filtre (Échap)");
    cross?.click();
    expect(cleared).toBe(1);
  });

  it("sans filtre, la barre est vide et cachée", () => {
    const bar = container();
    renderTagFilter(bar, "perso", () => {});
    renderTagFilter(bar, null, () => {});
    expect(bar.hidden).toBe(true);
    expect(bar.childElementCount).toBe(0);
  });
});
