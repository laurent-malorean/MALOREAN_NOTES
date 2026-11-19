import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createLayout } from "./layout";
import { connectPanelEdges } from "./panel-edges";
import "../theme.css";
import "../style.css";

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
root.style.height = "600px";
let layout = createLayout(root);

/** Monte la fenêtre, panneaux montrés, la largeur de chacun gardée dans `storage`. */
function mount(storage = memoryStorage()) {
  layout = createLayout(root);
  layout.mainArea.hidden = false;
  connectPanelEdges(layout.mainArea, storage);
  return storage;
}

const folders = () => layout.mainArea.querySelector(".folders") as HTMLElement;
const notes = () => layout.mainArea.querySelector(".sidebar") as HTMLElement;
const edgeOf = (panel: HTMLElement) => panel.querySelector(".panel-edge") as HTMLElement;
const box = (element: HTMLElement) => element.getBoundingClientRect();
const width = (element: HTMLElement) => Math.round(box(element).width);
const rem = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize);

/** Tire le bord du panneau jusqu'à l'abscisse `x`, puis le lâche. */
function drag(panel: HTMLElement, x: number) {
  // Pris tout contre le bord droit du panneau : l'abscisse `x` est celle où il arrive.
  const start = box(panel).right;
  const edge = edgeOf(panel);
  const down = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: start });
  edge.dispatchEvent(down);
  expect(down.defaultPrevented).toBe(true);
  document.dispatchEvent(new PointerEvent("pointermove", { clientX: x }));
  // Pendant le glissement, le curseur reste celui du bord partout dans la fenêtre.
  expect(layout.mainArea.classList.contains("resizing")).toBe(true);
  document.dispatchEvent(new PointerEvent("pointerup", { clientX: x }));
  expect(layout.mainArea.classList.contains("resizing")).toBe(false);
}

beforeAll(async () => {
  await page.viewport(1200, 800);
});

beforeEach(() => document.body.replaceChildren(root));

describe("bord des panneaux latéraux", () => {
  it("chaque panneau a un bord à sa droite, qu'on tire pour régler sa largeur", () => {
    mount();
    for (const [panel, label] of [
      [folders(), "Largeur des dossiers"],
      [notes(), "Largeur de la liste des notes"],
    ] as const) {
      const edge = edgeOf(panel);
      expect(edge.getAttribute("role")).toBe("separator");
      expect(edge.getAttribute("aria-orientation")).toBe("vertical");
      expect(edge.getAttribute("aria-label")).toBe(label);
      expect(edge.title).toBe("Tirer pour changer la largeur ; double-clic : largeur par défaut");
      expect(getComputedStyle(edge).cursor).toBe("col-resize");
      expect(Math.abs(box(edge).right - box(panel).right)).toBeLessThanOrEqual(1);
      expect(box(edge).height).toBe(box(panel).height);
    }
  });

  it("garde par défaut les largeurs du thème", () => {
    mount();
    expect(width(folders())).toBe(200);
    expect(width(notes())).toBe(280);
  });

  it("le bord suit le pointeur, la largeur est gardée et les colonnes prennent le reste", () => {
    const storage = mount();
    drag(folders(), box(folders()).left + 300);
    expect(width(folders())).toBe(300);
    expect(Math.round(box(notes()).left)).toBe(Math.round(box(folders()).right));
    expect(width(notes())).toBe(280);
    expect(Math.round(box(layout.editor).left)).toBe(Math.round(box(notes()).right));
    drag(notes(), box(notes()).left + 240);
    expect(width(notes())).toBe(240);
    expect(storage.items).toEqual(
      new Map([
        ["malorean.panel-width.folders", "300"],
        ["malorean.panel-width.notes", "240"],
      ]),
    );
  });

  it("un glissement fini ne suit plus le pointeur", () => {
    const storage = mount();
    drag(folders(), box(folders()).left + 260);
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 340 }));
    document.dispatchEvent(new PointerEvent("pointerup", { clientX: 340 }));
    expect(width(folders())).toBe(260);
    expect(storage.items.get("malorean.panel-width.folders")).toBe("260");
  });

  it("jamais sous le minimum ni au-delà du maximum, sans zone morte au retour", () => {
    const storage = mount();
    drag(folders(), box(folders()).left + 10);
    expect(width(folders())).toBe(9 * rem());
    expect(storage.items.get("malorean.panel-width.folders")).toBe(String(9 * rem()));
    drag(notes(), box(notes()).left + 2000);
    // Au plus 30 % de la fenêtre (1200 pixels).
    expect(width(notes())).toBe(360);
    expect(storage.items.get("malorean.panel-width.notes")).toBe("360");
    // La largeur posée est celle prise : la fenêtre élargie, le panneau ne bondit pas.
    expect(layout.mainArea.style.getPropertyValue("--sidebar-width")).toBe("360px");
    drag(notes(), box(notes()).right - 10);
    expect(width(notes())).toBe(350);
  });

  it("un simple clic sur le bord ne change ni la largeur ni ce qui est gardé", () => {
    const storage = mount();
    const edge = edgeOf(folders());
    const x = box(edge).left + 1;
    edge.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x }));
    document.dispatchEvent(new PointerEvent("pointerup", { clientX: x }));
    expect(width(folders())).toBe(200);
    expect(layout.mainArea.style.getPropertyValue("--folders-width")).toBe("");
    expect(storage.items.size).toBe(0);
  });

  it("le bord suit le pointeur depuis là où on l'a pris", () => {
    mount();
    const edge = edgeOf(folders());
    const x = box(edge).left + 1;
    edge.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: x + 40 }));
    expect(width(folders())).toBe(240);
    document.dispatchEvent(new PointerEvent("pointerup", { clientX: x + 40 }));
  });

  it("retrouve les largeurs gardées au lancement", () => {
    mount(
      memoryStorage({ "malorean.panel-width.folders": "320", "malorean.panel-width.notes": "250" }),
    );
    expect(width(folders())).toBe(320);
    expect(width(notes())).toBe(250);
  });

  it("un double-clic sur le bord rend la largeur par défaut et l'oublie", () => {
    const storage = mount(
      memoryStorage({ "malorean.panel-width.folders": "320", "malorean.panel-width.notes": "250" }),
    );
    edgeOf(folders()).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(width(folders())).toBe(200);
    expect(width(notes())).toBe(250);
    expect([...storage.items.keys()]).toEqual(["malorean.panel-width.notes"]);
  });

  it("panneaux cachés, les bords disparaissent avec eux ; montrés, leur largeur revient", () => {
    mount(memoryStorage({ "malorean.panel-width.folders": "320" }));
    layout.mainArea.classList.add("panels-hidden");
    expect(edgeOf(folders()).offsetParent).toBeNull();
    expect(box(layout.editor).left).toBe(box(layout.mainArea).left);
    layout.mainArea.classList.remove("panels-hidden");
    expect(width(folders())).toBe(320);
  });
});
