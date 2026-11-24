// Un canvas monté dans une page de test : son canvas d'exemple, ses événements, ses fenêtres simulées.
import { expect, vi } from "vitest";
import type { CanvasArrowItem, CanvasCardItem, CanvasFileItem, CanvasItem } from "../src/bridge";
import { type CanvasSettings, type CanvasView, createCanvasView } from "../src/screens/canvas-view";
import { newTextCard } from "../src/state/canvas-model";

/** Un PNG de 1 pixel : l'image d'une carte. */
export const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const at = (card: Partial<CanvasCardItem> & { id: string; kind: string }): CanvasCardItem => ({
  ...newTextCard(0, 0),
  ...card,
});

type Box = [number, number, number, number];
const placed = ([x, y, width, height]: Box) => ({ x, y, width, height });
const group = (id: string, box: Box, label: string, palette: string) =>
  at({ id, kind: "group", ...placed(box), label, text: null, palette });
const text = (id: string, box: Box, body: string, palette: string | null = null) =>
  at({ id, kind: "text", ...placed(box), text: body, palette });
const file = (id: string, box: Box, path: string) =>
  at({ id, kind: "file", ...placed(box), text: null, file: path });
const page = (id: string, box: Box, url: string) =>
  at({ id, kind: "link", ...placed(box), text: null, url, color: "#FF5733" });
const link = (
  id: string,
  ends: [string, string, string, string],
  over: Partial<CanvasArrowItem>,
) => ({
  ...{ id, from: ends[0], fromSide: ends[1], to: ends[2], toSide: ends[3] },
  ...{ fromEnd: "none", toEnd: "arrow", color: null, palette: null, label: null, extra: [] },
  ...over,
});

/** Un groupe, deux cartes texte, une note, une image, une page web, trois flèches. */
export function sample(): CanvasItem {
  return {
    cards: [
      group("g", [0, 0, 700, 400], "Phase 1", "vert"),
      text("t", [20, 40, 260, 120], "# Titre\n\nun **texte** et [[Autre note]]"),
      text("u", [340, 40, 200, 80], "Deux", "rouge"),
      file("n", [20, 220, 260, 100], "Notes/Projet.md"),
      file("i", [340, 220, 200, 100], "img/a.png"),
      page("l", [800, 0, 300, 200], "https://jsoncanvas.org"),
    ],
    arrows: [
      link("e1", ["t", "right", "u", "left"], { label: "détaille" }),
      link("e2", ["u", "bottom", "i", "top"], { fromEnd: "arrow", palette: "bleu" }),
      link("e3", ["n", "right", "i", "left"], { toEnd: "none" }),
    ],
    extra: [],
  };
}

export interface Mounted {
  view: CanvasView;
  /** Chaque canvas enregistré, avec le texte de départ. */
  saved: { canvas: CanvasItem; base: string }[];
  errors: unknown[];
  notes: [string, boolean][];
  external: string[];
  copied: string[];
  notices: string[];
  asked: string[][];
  settings: { current: CanvasSettings; stored: CanvasSettings[] };
  /** Ce que répondent les fenêtres : la note, le média, le texte choisis. */
  answers: { note: string | null; media: string | null; text: string | null };
  /** Le fichier : ce que la lecture rend et que l'enregistrement remplace. */
  disk: { file: CanvasFileItem };
}

export const cardEl = (id: string) =>
  document.querySelector<HTMLElement>(`.canvas-card[data-id="${id}"]`) as HTMLElement;
export const arrowEl = (id: string) =>
  document.querySelector<SVGElement>(`g[data-arrow="${id}"]`) as unknown as SVGElement;
export const surface = () => document.querySelector<HTMLElement>(".canvas-surface") as HTMLElement;
export const centre = (element: Element) => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, box };
};
export const pointer = (
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {},
) => {
  return target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      clientX: x,
      clientY: y,
      pointerId: 1,
      ...init,
    }),
  );
};
export const key = (name: string, init: KeyboardEventInit = {}, target: EventTarget = view()) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }),
  );
export const view = () => document.querySelector<HTMLElement>(".canvas-view") as HTMLElement;
/** Un clic (appui puis relâchement) au centre de l'élément. */
export const click = (element: Element, init: PointerEventInit = {}) => {
  const c = centre(element);
  pointer(element, "pointerdown", c.x, c.y, init);
  pointer(element, "pointerup", c.x, c.y, init);
};
/** Glisse l'élément de `dx`, `dy` pixels de l'écran. */
export const drag = (element: Element, dx: number, dy: number, init: PointerEventInit = {}) => {
  const c = centre(element);
  pointer(element, "pointerdown", c.x, c.y, init);
  pointer(surface(), "pointermove", c.x + dx / 2, c.y + dy / 2, init);
  pointer(surface(), "pointermove", c.x + dx, c.y + dy, init);
  pointer(surface(), "pointerup", c.x + dx, c.y + dy, init);
};
export const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) as HTMLButtonElement;
export const menuItems = () =>
  [...document.querySelectorAll<HTMLElement>(".context-menu button")].map((b) => b.textContent);
export const choose = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(".context-menu button")]
    .find((b) => b.textContent === label)
    ?.click();
export const settle = () =>
  vi.waitFor(() => expect(cardEl("t").querySelector(".canvas-text-body strong")).not.toBeNull());

export async function mount(canvas: CanvasItem = sample(), initial: Partial<CanvasSettings> = {}) {
  const host = document.createElement("div");
  host.style.cssText = "width:1000px;height:640px;position:relative;display:flex";
  document.body.replaceChildren(host);
  const m: Mounted = {
    view: undefined as unknown as CanvasView,
    saved: [],
    errors: [],
    notes: [],
    external: [],
    copied: [],
    notices: [],
    asked: [],
    settings: { current: { grid: false, objects: false, readOnly: false, ...initial }, stored: [] },
    answers: { note: "Notes/Autre.md", media: "img/b.png", text: "https://exemple.fr" },
    disk: { file: { canvas: structuredClone(canvas), text: "v0" } },
  };
  m.view = createCanvasView({
    save: async (next, base) => {
      m.saved.push({ canvas: next, base });
      m.disk.file = { canvas: structuredClone(next), text: `v${m.saved.length}` };
      return structuredClone(m.disk.file);
    },
    painter: {
      resolveImage: () => PIXEL,
      openNote: (path, inNewTab) => m.notes.push([path, inNewTab]),
    },
    openExternal: (url) => m.external.push(url),
    chooseNote: async () => m.answers.note,
    chooseMedia: async () => m.answers.media,
    askText: async (question, initialText, confirm) => {
      m.asked.push([question, initialText, confirm]);
      return m.answers.text;
    },
    copy: (text) => m.copied.push(text),
    notice: (message) => m.notices.push(message),
    error: (e) => m.errors.push(e),
    settings: {
      load: () => m.settings.current,
      store: (s) => {
        m.settings.current = s;
        m.settings.stored.push(s);
      },
    },
  });
  m.view.element.style.flex = "1";
  host.append(m.view.element);
  m.view.setFile(structuredClone(m.disk.file));
  m.view.show();
  if (canvas.cards.some((c) => c.id === "t")) await settle();
  return m;
}

/** Le canvas à 100 % : un pixel de l'écran vaut un point du canvas. */
export async function mountAt100(...args: Parameters<typeof mount>) {
  const m = await mount(...args);
  button("Rétablir le zoom").click();
  return m;
}

export const selected = () =>
  [...document.querySelectorAll(".canvas-card.selected")].map((e) => (e as HTMLElement).dataset.id);
export const last = (m: Awaited<ReturnType<typeof mount>>) => m.saved[m.saved.length - 1]?.canvas;
export const emptySpot = () => {
  const box = surface().getBoundingClientRect();
  return { x: box.left + 20, y: box.bottom - 20 };
};
export const rightClick = (element: Element) => {
  const c = centre(element);
  element.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: c.x, clientY: c.y }),
  );
};
