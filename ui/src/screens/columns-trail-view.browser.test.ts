import { describe, expect, it } from "vitest";
import type { Column, Columns } from "../state/columns";
import type { Trail } from "../state/trail";
import { createColumnsView } from "./columns-view";
import "../theme.css";
import "../style.css";

function mount() {
  const container = document.createElement("div");
  container.className = "columns";
  container.style.width = "800px";
  document.body.replaceChildren(container);
  const asked: string[] = [];
  const ignore = () => {};
  const view = createColumnsView(container, {
    ...{ created: ignore, removed: ignore, activate: ignore, split: ignore, resize: ignore },
    ...{ activateTab: ignore, closeTab: ignore, placeTab: ignore, printNote: ignore },
    ...{ copyNote: ignore, copyMarkdown: ignore, showHistory: ignore, dropTab: ignore },
    walk: (id, step) => asked.push(`colonne ${id} : ${step}`),
  });
  return { container, view, asked };
}

const visit = (note: string) => ({ note, position: null });

/** Une colonne dont l'onglet actif (le second) a ce parcours ; le premier n'en a pas. */
const column = (id: number, trail?: Trail): Column => ({
  id,
  tabs: [
    { id: id + 1, note: "x.md", title: "X" },
    { id: id + 2, note: "a.md", title: "A", ...(trail ? { trail } : {}) },
  ],
  activeTab: id + 2,
  width: 0.5,
});

const columns = (...list: Column[]): Columns => ({ list, active: 0, nextId: 100 });

/** Les flèches de chaque colonne : cachées, ou leur état (« ← » et « → », grisée ou non). */
const arrows = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>(".note-trail")].map((group) =>
    group.hidden
      ? "cachées"
      : [...group.querySelectorAll("button")]
          .map((b) => `${b.textContent}${b.disabled ? " grisée" : ""}`)
          .join(" "),
  );

describe("flèches du parcours d'un onglet", () => {
  it("n'apparaissent que si l'onglet actif a un parcours ; celle qui ne mène nulle part est grisée", () => {
    const { container, view } = mount();
    view.render(
      columns(
        column(0),
        column(10, { back: [visit("b.md")], forward: [] }),
        column(20, { back: [], forward: [visit("c.md")] }),
      ),
    );
    expect(arrows(container)).toEqual(["cachées", "← → grisée", "← grisée →"]);
    view.render(columns(column(0, { back: [visit("b.md")], forward: [visit("c.md")] })));
    expect(arrows(container)).toEqual(["← →"]);
    view.render(columns({ id: 0, tabs: [], activeTab: null, width: 1 }));
    expect(arrows(container)).toEqual(["cachées"]);
  });

  it("se nomment, et demandent le pas pour leur colonne", () => {
    const { container, view, asked } = mount();
    view.render(columns(column(0), column(10, { back: [visit("b.md")], forward: [visit("c")] })));
    const second = container.querySelectorAll(".note-trail")[1] as HTMLElement;
    const [back, forward] = [...second.querySelectorAll("button")];
    expect([back?.title, forward?.title]).toEqual([
      "Revenir à la note précédente",
      "Aller à la note suivante",
    ]);
    expect(back?.getAttribute("aria-label")).toBe("Revenir à la note précédente");
    back?.click();
    forward?.click();
    expect(asked).toEqual(["colonne 10 : -1", "colonne 10 : 1"]);
  });

  it("sont en tête de la colonne, devant les onglets, et visibles quand elles sont montrées", () => {
    const { container, view } = mount();
    view.render(columns(column(0, { back: [visit("b.md")], forward: [] })));
    const group = container.querySelector(".note-trail") as HTMLElement;
    expect(group.nextElementSibling?.className).toBe("tabs");
    expect(group.getBoundingClientRect().width).toBeGreaterThan(0);
    view.render(columns(column(0)));
    expect(group.getBoundingClientRect().width).toBe(0);
  });
});
