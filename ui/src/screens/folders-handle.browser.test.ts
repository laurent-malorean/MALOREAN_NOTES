import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createLayout } from "./layout";
import { connectFoldersHandle } from "./folders-handle";
import { renderTagsList } from "./tags-view";
import "../theme.css";
import "../style.css";

const KEY = "malorean.folders-tree-height";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items,
  };
}

const root = document.createElement("div");
let layout = createLayout(root);

/**
 * Monte la fenêtre : 30 dossiers, `tags` étiquettes, dans une fenêtre haute de `height` pixels (660 par défaut :
 * la bande du haut en prend 54, les listes en gardent 600).
 */
function mount(storage = memoryStorage(), tags = 6, height = 660) {
  root.style.height = `${height}px`;
  layout = createLayout(root);
  layout.mainArea.hidden = false;
  layout.foldersList.replaceChildren(
    ...Array.from({ length: 30 }, (_, n) => {
      const item = document.createElement("button");
      item.className = "folder-item";
      item.textContent = `dossier ${n}`;
      return item;
    }),
  );
  renderTagsList(
    layout.tagsList,
    Array.from({ length: tags }, (_, n) => ({ name: `etiquette-${n}`, count: n + 1 })),
    null,
    () => undefined,
  );
  connectFoldersHandle(layout, storage);
  return storage;
}

const handle = () => layout.folders.querySelector(".folders-handle") as HTMLElement;
const box = (element: Element) => element.getBoundingClientRect();
const treeHeight = () => box(layout.foldersList).height;
const tagsHeight = () => box(layout.tagsList).height;
const rem = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
const centre = () => box(handle()).top + box(handle()).height / 2;

/** Prend la poignée en son milieu et la tire de `dy` pixels, puis la lâche. */
function drag(dy: number) {
  const start = centre();
  const down = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientY: start });
  handle().dispatchEvent(down);
  expect(down.defaultPrevented).toBe(true);
  document.dispatchEvent(new PointerEvent("pointermove", { clientY: start + dy }));
  expect(layout.folders.classList.contains("resizing-height")).toBe(true);
  document.dispatchEvent(new PointerEvent("pointerup", { clientY: start + dy }));
  expect(layout.folders.classList.contains("resizing-height")).toBe(false);
}

const press = (key: string) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  handle().dispatchEvent(event);
  return event;
};
const aria = (name: string) => Number(handle().getAttribute(`aria-${name}`));

beforeAll(async () => {
  await page.viewport(1200, 800);
});

beforeEach(() => document.body.replaceChildren(root));

describe("poignée de hauteur de la liste des dossiers", () => {
  it("est la ligne entre l'arborescence et « Récentes », focusable, nommée, avec un repère", () => {
    mount();
    const line = handle();
    expect(line.getAttribute("role")).toBe("separator");
    expect(line.getAttribute("aria-orientation")).toBe("horizontal");
    expect(line.getAttribute("aria-label")).toBe("Hauteur de l'arborescence des dossiers");
    expect(line.tabIndex).toBe(0);
    expect(line.title).toBe("Tirer pour changer la hauteur ; double-clic : hauteur par défaut");
    expect(getComputedStyle(line).cursor).toBe("row-resize");
    expect(box(line).height).toBeGreaterThanOrEqual(5);
    expect(box(line).left).toBe(box(layout.folders).left);
    expect(box(line).width).toBe(layout.folders.clientWidth);
    expect(Math.abs(box(line).top - box(layout.foldersList).bottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(box(line).bottom - box(layout.recentButton).top)).toBeLessThanOrEqual(
      0.3 * rem() + 1,
    );
    // Le repère : une petite barre centrée sur la ligne.
    const grip = getComputedStyle(line, "::after");
    expect(grip.content).not.toBe("none");
    expect(Number.parseFloat(grip.width)).toBeGreaterThan(20);
    expect(Number.parseFloat(grip.height)).toBeGreaterThanOrEqual(2);
  });

  it("par défaut, l'arborescence prend toute la place que le bloc du bas laisse", () => {
    const storage = mount();
    const tags = tagsHeight();
    expect(Math.abs(box(layout.tagsList).bottom - box(layout.foldersFooter).top)).toBeLessThan(1);
    expect(treeHeight()).toBeGreaterThan(144);
    expect(tagsHeight()).toBe(tags);
    expect(layout.folders.classList.contains("tree-sized")).toBe(false);
    expect(storage.items.size).toBe(0);
  });

  it("tirée, l'arborescence change de la valeur du déplacement, le bloc du bas prend le reste", () => {
    const storage = mount();
    const from = treeHeight();
    const footer = box(layout.foldersFooter).top;
    drag(-60);
    expect(treeHeight()).toBe(from - 60);
    expect(Math.abs(box(layout.tagsList).bottom - footer)).toBeLessThan(1);
    expect(box(layout.foldersFooter).top).toBe(footer);
    expect(storage.items.get(KEY)).toBe(String(Math.round(from - 60)));
    drag(25);
    expect(treeHeight()).toBeCloseTo(from - 35, 0);
    expect(storage.items.get(KEY)).toBe(String(Math.round(from - 35)));
  });

  it("l'arborescence ne descend pas sous cinq lignes, sans zone morte au retour", () => {
    const storage = mount();
    drag(-2000);
    expect(treeHeight()).toBe(9 * rem());
    expect(storage.items.get(KEY)).toBe(String(9 * rem()));
    expect(layout.foldersList.scrollHeight).toBeGreaterThan(layout.foldersList.clientHeight);
    drag(10);
    expect(treeHeight()).toBe(9 * rem() + 10);
  });

  it("le bloc du bas garde « Récentes » et deux étiquettes entières", () => {
    const storage = mount();
    const footer = box(layout.foldersFooter).top;
    drag(2000);
    expect(tagsHeight()).toBe(6 * rem());
    expect(box(layout.foldersFooter).top).toBe(footer);
    expect(box(layout.recentButton).bottom).toBeLessThanOrEqual(box(layout.tagsList).top + 1);
    const items = [...layout.tagsList.querySelectorAll(".tag-item")];
    const lines = box(layout.tagsList).bottom + 0.5;
    expect(box(items[1] as Element).bottom).toBeLessThanOrEqual(lines);
    expect(layout.tagsList.scrollHeight).toBeGreaterThan(layout.tagsList.clientHeight);
    expect(storage.items.get(KEY)).toBe(String(Math.round(treeHeight())));
    drag(-10);
    expect(tagsHeight()).toBe(6 * rem() + 10);
  });

  it("sans étiquette, « Récentes » reste visible au-dessus du pied", () => {
    mount(memoryStorage(), 0);
    const footer = box(layout.foldersFooter).top;
    drag(-100);
    expect(box(layout.foldersFooter).top).toBe(footer);
    drag(2000);
    expect(box(layout.foldersFooter).top).toBe(footer);
    expect(box(layout.recentButton).bottom).toBeLessThanOrEqual(box(layout.foldersFooter).top);
    expect(box(layout.recentButton).height).toBeGreaterThan(0);
  });

  it("un simple clic sur la poignée ne change rien et ne garde rien", () => {
    const storage = mount();
    const from = treeHeight();
    const y = centre();
    handle().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: y }));
    document.dispatchEvent(new PointerEvent("pointerup", { clientY: y }));
    expect(treeHeight()).toBe(from);
    expect(layout.folders.classList.contains("tree-sized")).toBe(false);
    expect(layout.folders.style.getPropertyValue("--folders-tree-height")).toBe("");
    expect(storage.items.size).toBe(0);
  });

  it("un glissement fini ne suit plus le pointeur", () => {
    mount();
    drag(-80);
    const kept = treeHeight();
    document.dispatchEvent(new PointerEvent("pointermove", { clientY: 10 }));
    expect(treeHeight()).toBe(kept);
  });

  it("retrouve la hauteur gardée au lancement ; un double-clic rend la hauteur par défaut", () => {
    const initial = mount().items;
    const by = treeHeight();
    initial.set(KEY, "250");
    const storage = mount(memoryStorage({ [KEY]: "250" }));
    expect(treeHeight()).toBe(250);
    handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(treeHeight()).toBe(by);
    expect(layout.folders.classList.contains("tree-sized")).toBe(false);
    expect(storage.items.size).toBe(0);
  });

  it("au clavier : flèches par 16 pixels, Début et Fin, la valeur gardée à chaque pas", () => {
    const storage = mount();
    const from = treeHeight();
    expect(press("ArrowUp").defaultPrevented).toBe(true);
    expect(treeHeight()).toBe(from - 16);
    expect(storage.items.get(KEY)).toBe(String(Math.round(from - 16)));
    press("ArrowDown");
    press("ArrowDown");
    expect(treeHeight()).toBe(from + 16 > aria("valuemax") ? aria("valuemax") : from + 16);
    expect(press("Home").defaultPrevented).toBe(true);
    expect(treeHeight()).toBe(9 * rem());
    expect(storage.items.get(KEY)).toBe(String(9 * rem()));
    press("ArrowUp");
    expect(treeHeight()).toBe(9 * rem());
    expect(press("End").defaultPrevented).toBe(true);
    expect(tagsHeight()).toBe(6 * rem());
    expect(treeHeight()).toBeCloseTo(aria("valuemax"), 0);
    press("ArrowDown");
    expect(tagsHeight()).toBe(6 * rem());
  });

  it("une autre touche ne fait rien", () => {
    const storage = mount();
    const from = treeHeight();
    expect(press("a").defaultPrevented).toBe(false);
    expect(treeHeight()).toBe(from);
    expect(storage.items.size).toBe(0);
  });

  it("dit sa valeur, son minimum et son maximum aux lecteurs d'écran", () => {
    mount();
    handle().dispatchEvent(new FocusEvent("focus"));
    expect(aria("valuenow")).toBe(Math.round(treeHeight()));
    expect(aria("valuemin")).toBe(9 * rem());
    const max = aria("valuemax");
    drag(2000);
    expect(aria("valuenow")).toBe(max);
    expect(treeHeight()).toBeCloseTo(max, 0);
    drag(-2000);
    expect(aria("valuenow")).toBe(9 * rem());
    press("ArrowDown");
    expect(aria("valuenow")).toBe(9 * rem() + 16);
  });

  it("fenêtre basse, les minimums l'emportent et chaque zone défile", () => {
    mount(memoryStorage({ [KEY]: "500" }), 6, 300);
    expect(treeHeight()).toBe(9 * rem());
    expect(tagsHeight()).toBe(6 * rem());
    expect(layout.foldersList.scrollHeight).toBeGreaterThan(layout.foldersList.clientHeight);
    expect(layout.tagsList.scrollHeight).toBeGreaterThan(layout.tagsList.clientHeight);
  });

  it("la fenêtre qui rapetisse reprend de la hauteur à l'arborescence d'abord", () => {
    mount(memoryStorage({ [KEY]: "250" }));
    expect(treeHeight()).toBe(250);
    root.style.height = "420px";
    expect(treeHeight()).toBeLessThan(250);
    expect(treeHeight()).toBeGreaterThanOrEqual(9 * rem());
    expect(tagsHeight()).toBeGreaterThanOrEqual(6 * rem());
  });
});
