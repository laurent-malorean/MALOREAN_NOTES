import { describe, expect, it } from "vitest";
import type { Columns } from "../state/columns";
import { type ColumnParts, createColumnsView } from "./columns-view";
import "../theme.css";
import "../style.css";

const AREA_WIDTH = 1000;

function mount() {
  const container = document.createElement("div");
  container.className = "columns";
  container.style.width = `${AREA_WIDTH}px`;
  container.style.height = "300px";
  document.body.replaceChildren(container);
  const created: { id: number; parts: ColumnParts; connected: boolean }[] = [];
  const removed: number[] = [];
  const activated: number[] = [];
  const resized: { divider: number; delta: number }[] = [];
  const tabs: string[] = [];
  let splits = 0;
  const view = createColumnsView(container, {
    created: (id, parts) => created.push({ id, parts, connected: parts.element.isConnected }),
    removed: (id) => removed.push(id),
    activate: (id) => activated.push(id),
    split: () => (splits += 1),
    resize: (divider, delta) => resized.push({ divider, delta }),
    activateTab: (tab) => tabs.push(`activer ${tab}`),
    closeTab: (tab) => tabs.push(`fermer ${tab}`),
  });
  return { container, view, created, removed, activated, resized, tabs, splits: () => splits };
}

const state = (widths: readonly number[], active = 0, ids = widths.map((_, i) => i)): Columns => ({
  list: widths.map((width, index) => ({
    id: ids[index] as number,
    tabs: [],
    activeTab: null,
    width,
  })),
  active,
  nextId: widths.length,
});

const sections = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>(".column"),
];
const dividers = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>(".column-divider"),
];
const splitButton = (column: HTMLElement) =>
  column.querySelector<HTMLButtonElement>(".column-split") as HTMLButtonElement;

describe("colonnes à l'écran", () => {
  it("une section par colonne, un séparateur entre deux voisines, chacune à sa largeur", () => {
    const { container, view } = mount();
    view.render(state([0.25, 0.75], 1));
    expect([...container.children].map((element) => element.className)).toEqual([
      "column",
      "column-divider",
      "column active",
    ]);
    expect(sections(container).map((column) => column.style.flexGrow)).toEqual(["0.25", "0.75"]);
    expect(sections(container)[1]?.getBoundingClientRect().width).toBeGreaterThan(
      2.9 * (sections(container)[0]?.getBoundingClientRect().width ?? 0),
    );
    expect(dividers(container)[0]?.getAttribute("role")).toBe("separator");
    expect(dividers(container)[0]?.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("annonce chaque nouvelle colonne une seule fois, déjà à l'écran, avec la place de ses liens entrants", () => {
    const { container, view, created } = mount();
    view.render(state([1]));
    view.render(state([0.5, 0.5]));
    expect(created.map((entry) => entry.id)).toEqual([0, 1]);
    expect(created.every((entry) => entry.connected)).toBe(true);
    const parts = created[1]?.parts as ColumnParts;
    expect(parts.element).toBe(sections(container)[1]);
    expect(parts.backlinks.parentElement).toBe(parts.element);
    expect(parts.backlinks.hidden).toBe(true);
    expect(parts.backlinks.getAttribute("aria-label")).toBe("Liens entrants");
  });

  it("garde l'élément d'une colonne, et ce qui y a le focus, tant qu'elle existe", () => {
    const { container, view, created } = mount();
    view.render(state([1]));
    const field = document.createElement("input");
    created[0]?.parts.element.append(field);
    field.focus();
    view.render(state([1]));
    expect(document.activeElement).toBe(field);
    view.render(state([0.5, 0.5]));
    expect(sections(container)[0]).toBe(created[0]?.parts.element);
  });

  it("une colonne disparue quitte l'écran, avec son séparateur, et le dit une fois", () => {
    const { container, view, removed } = mount();
    view.render(state([0.4, 0.3, 0.3]));
    view.render(state([0.4, 0.6], 0, [0, 2]));
    view.render(state([0.4, 0.6], 0, [0, 2]));
    expect(removed).toEqual([1]);
    expect(sections(container)).toHaveLength(2);
    expect(dividers(container)).toHaveLength(1);
    view.render(state([1]));
    expect(dividers(container)).toHaveLength(0);
  });

  it("une colonne remplacée par une autre laisse sa place à la nouvelle", () => {
    const { container, view, created } = mount();
    view.render(state([0.5, 0.5]));
    view.render(state([0.5, 0.5], 0, [0, 2]));
    const [first, second] = sections(container);
    expect(first).toBe(created[0]?.parts.element);
    expect(second).toBe(created[2]?.parts.element);
    expect(sections(container)).toHaveLength(2);
  });

  it("chaque colonne se nomme, son en-tête porte le bouton « Diviser », ses liens entrants se rangent dessous", () => {
    const { container, view } = mount();
    view.render(state([1]));
    const column = sections(container)[0] as HTMLElement;
    expect(column.getAttribute("aria-label")).toBe("Colonne");
    const header = column.querySelector(".column-header") as HTMLElement;
    expect(header.lastElementChild).toBe(splitButton(column));
    const tablist = header.firstElementChild as HTMLElement;
    expect(tablist.getAttribute("role")).toBe("tablist");
    expect(tablist.getAttribute("aria-label")).toBe("Onglets");
    expect(tablist.className).toBe("tabs");
    expect(splitButton(column).textContent).toBe("◫");
    expect(column.querySelector(".backlinks")?.getAttribute("aria-label")).toBe("Liens entrants");
  });

  it("montre les onglets de chaque colonne, et transmet leurs clics", () => {
    const { container, view, tabs } = mount();
    const columns: Columns = {
      list: [
        { id: 0, tabs: [{ id: 1, note: "a.md", title: "A" }], activeTab: 1, width: 0.5 },
        {
          id: 2,
          tabs: [
            { id: 3, note: "b.md", title: "B" },
            { id: 4, note: "c.md", title: null },
          ],
          activeTab: 4,
          width: 0.5,
        },
      ],
      active: 2,
      nextId: 5,
    };
    view.render(columns);
    const second = sections(container)[1] as HTMLElement;
    const labels = [...second.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    expect(labels).toEqual(["B×", "c×"]);
    second.querySelector<HTMLElement>('[role="tab"]')?.click();
    second.querySelector<HTMLElement>(".tab-close")?.click();
    expect(tabs).toEqual(["activer 3", "fermer 3"]);
    view.render({
      ...columns,
      list: [
        columns.list[0] as (typeof columns.list)[0],
        { ...(columns.list[1] as (typeof columns.list)[0]), tabs: [], activeTab: null },
      ],
    });
    expect(second.querySelectorAll('[role="tab"]')).toHaveLength(0);
  });

  it("un clic ou le focus dans une colonne la rend active, avant tout autre effet du clic", () => {
    const { container, view, activated, created } = mount();
    view.render(state([0.5, 0.5]));
    const inner = document.createElement("button");
    inner.addEventListener("mousedown", (event) => event.stopPropagation());
    created[1]?.parts.element.append(inner);
    inner.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    sections(container)[0]?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(activated).toEqual([1, 0]);
  });

  it("le bouton « Diviser » demande une colonne de plus, et disparaît à trois colonnes", () => {
    const { container, view, splits } = mount();
    view.render(state([0.5, 0.5]));
    const button = splitButton(sections(container)[0] as HTMLElement);
    expect(button.title).toBe("Diviser la colonne");
    expect(button.hidden).toBe(false);
    button.click();
    expect(splits()).toBe(1);
    view.render(state([0.4, 0.3, 0.3]));
    expect(sections(container).map((column) => splitButton(column).hidden)).toEqual([
      true,
      true,
      true,
    ]);
    expect(splitButton(sections(container)[0] as HTMLElement).getBoundingClientRect().width).toBe(
      0,
    );
  });

  it("glisser un séparateur demande de déplacer la largeur jusqu'au pointeur", () => {
    const { container, view, resized } = mount();
    view.render(state([0.25, 0.25, 0.5]));
    const divider = dividers(container)[1] as HTMLElement;
    const box = divider.getBoundingClientRect();
    const centre = box.left + box.width / 2;
    const free = AREA_WIDTH - 2 * box.width;
    const down = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
    divider.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: centre + 100 }));
    expect(resized).toHaveLength(1);
    expect(resized[0]?.divider).toBe(1);
    expect(resized[0]?.delta).toBeCloseTo(100 / free, 6);
    document.dispatchEvent(new PointerEvent("pointerup"));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: centre + 50 }));
    expect(resized).toHaveLength(1);
  });
});
