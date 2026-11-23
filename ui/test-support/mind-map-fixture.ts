// Une carte mentale montée dans une page de test : sa carte d'exemple, ses événements, ses recherches.
import { expect, vi } from "vitest";
import type { MindMapItem, MindNodeItem } from "../src/bridge";
import { createMindMapView, type MindMapView } from "../src/screens/mind-map-view";

export const node = (title: string, children: MindNodeItem[] = [], detail: string[] = []) => ({
  title,
  color: null,
  detail,
  children,
});

/** Clients (Artisans (Plombiers), Grands comptes), Calendrier */
export const sample = (): MindMapItem => ({
  roots: [
    node("Clients", [node("Artisans", [node("Plombiers")]), node("Grands comptes")]),
    node("Calendrier"),
  ],
  places: [
    { x: 0, y: 0 },
    { x: 0, y: 300 },
  ],
});

export interface Mounted {
  view: MindMapView;
  saved: MindMapItem[];
  errors: unknown[];
  wiki: [string, boolean][];
  links: string[];
  stored: string[][];
  /** Le fichier : la carte que la lecture rend et que l'enregistrement remplace. */
  disk: { map: MindMapItem };
  notices: string[];
}

export const nodes = () => [...document.querySelectorAll<HTMLElement>(".mind-map-node[data-path]")];
export const titles = () => nodes().map((n) => n.querySelector(".mind-map-title")?.textContent);
export const find = (title: string) =>
  nodes().find((n) => n.querySelector(".mind-map-title")?.textContent === title) as HTMLElement;
export const key = (target: HTMLElement, name: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, ...init }));
export const pointer = (target: EventTarget, type: string, x: number, y: number) =>
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 }),
  );
export const centre = (element: HTMLElement) => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, box };
};
export const click = (element: HTMLElement) => {
  const at = centre(element);
  pointer(element, "pointerdown", at.x, at.y);
  pointer(document, "pointerup", at.x, at.y);
};
export const input = () =>
  document.querySelector<HTMLTextAreaElement>(".mind-map-input") as HTMLTextAreaElement;
export const settle = () =>
  vi.waitFor(() =>
    expect(document.querySelector(".mind-map-node:not(.mind-map-probe)")).not.toBeNull(),
  );

export async function mount(map: MindMapItem = sample(), folded: string[] = []) {
  const host = document.createElement("div");
  host.style.cssText = "width:900px;height:600px;position:relative;display:flex";
  document.body.replaceChildren(host);
  const saved: MindMapItem[] = [];
  const errors: unknown[] = [];
  const wiki: [string, boolean][] = [];
  const links: string[] = [];
  const stored: string[][] = [];
  const notices: string[] = [];
  const disk = { map: structuredClone(map) };
  const view = createMindMapView({
    save: async (m) => {
      saved.push(m);
      disk.map = structuredClone(m);
    },
    read: async () => structuredClone(disk.map),
    notice: (message) => void notices.push(message),
    openWikiLink: (title, inNewTab) => wiki.push([title, inNewTab]),
    openLink: (target) => links.push(target),
    error: (e) => errors.push(e),
    resolveImage: (src) => src,
    folded: { load: () => folded, store: (keys) => void stored.push([...keys]) },
  });
  view.element.style.flex = "1";
  host.append(view.element);
  view.setMap(map);
  view.show();
  if (map.roots.length > 0) await settle();
  return { view, saved, errors, wiki, links, stored, disk, notices };
}
