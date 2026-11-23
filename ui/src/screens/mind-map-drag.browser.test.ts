import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  centre,
  click,
  find,
  input,
  key,
  mount,
  node,
  pointer,
  sample,
  titles,
} from "../../test-support/mind-map-fixture";
import { closeContextMenu } from "./context-menu";

beforeEach(() => closeContextMenu());
afterEach(() => closeContextMenu());

describe("carte mentale : glisser", () => {
  const drag = (title: string, to: { x: number; y: number }) => {
    const from = centre(find(title));
    pointer(find(title), "pointerdown", from.x, from.y);
    pointer(document, "pointermove", from.x + 2, from.y);
    pointer(document, "pointermove", to.x, to.y);
  };
  const drop = (to: { x: number; y: number }) => pointer(document, "pointerup", to.x, to.y);
  const at = (title: string, share: number) => {
    const { box } = centre(find(title));
    return { x: box.left + box.width / 2, y: box.top + box.height * share };
  };

  it("un glissé court reste un clic", async () => {
    const m = await mount();
    const from = centre(find("Calendrier"));
    pointer(find("Calendrier"), "pointerdown", from.x, from.y);
    pointer(document, "pointermove", from.x + 2, from.y);
    pointer(document, "pointerup", from.x + 2, from.y);
    expect(m.view.selected()).toEqual([1]);
    expect(m.saved).toHaveLength(0);
  });

  it("sur la moitié centrale d'un nœud, il devient son dernier enfant, la cible surlignée", async () => {
    const m = await mount();
    const target = at("Grands comptes", 0.5);
    drag("Calendrier", target);
    expect(find("Grands comptes").classList.contains("drop-child")).toBe(true);
    expect(document.querySelector(".mind-map-ghost")).not.toBeNull();
    drop(target);
    expect(document.querySelector(".mind-map-ghost")).toBeNull();
    expect(m.view.map().roots.map((r) => r.title)).toEqual(["Clients"]);
    expect(m.view.map().roots[0]?.children[1]?.children[0]?.title).toBe("Calendrier");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
  });

  it("sur le quart haut ou bas, il devient un frère, un trait le montre", async () => {
    const m = await mount();
    drag("Calendrier", at("Artisans", 0.1));
    expect(find("Artisans").classList.contains("drop-before")).toBe(true);
    drop(at("Artisans", 0.1));
    expect(m.view.map().roots[0]?.children.map((c) => c.title)).toEqual([
      "Calendrier",
      "Artisans",
      "Grands comptes",
    ]);
    await vi.waitFor(() => expect(find("Calendrier")).toBeDefined());
    drag("Grands comptes", at("Calendrier", 0.9));
    expect(find("Calendrier").classList.contains("drop-after")).toBe(true);
    drop(at("Calendrier", 0.9));
    expect(m.view.map().roots[0]?.children.map((c) => c.title)).toEqual([
      "Calendrier",
      "Grands comptes",
      "Artisans",
    ]);
  });

  it("sur le fond, il devient un nœud racine posé là où il est lâché", async () => {
    const m = await mount();
    const rect = (document.querySelector(".mind-map") as HTMLElement).getBoundingClientRect();
    const target = { x: rect.left + 20, y: rect.bottom - 20 };
    drag("Artisans", target);
    drop(target);
    const map = m.view.map();
    expect(map.roots.map((r) => r.title)).toEqual(["Clients", "Calendrier", "Artisans"]);
    expect(map.roots[2]?.children[0]?.title).toBe("Plombiers");
    expect(map.places[2]).toBeDefined();
  });

  it("un nœud racine lâché sur le fond est seulement déplacé", async () => {
    const m = await mount();
    const rect = (document.querySelector(".mind-map") as HTMLElement).getBoundingClientRect();
    const target = { x: rect.left + 30, y: rect.bottom - 30 };
    drag("Calendrier", target);
    drop(target);
    const map = m.view.map();
    expect(map.roots.map((r) => r.title)).toEqual(["Clients", "Calendrier"]);
    expect(map.places[1]).not.toEqual({ x: 0, y: 300 });
  });

  it("déposer dans sa propre branche est refusé", async () => {
    const m = await mount();
    const target = at("Plombiers", 0.5);
    drag("Clients", target);
    expect(document.querySelector(".drop-child")).toBeNull();
    drop(target);
    expect(m.saved).toHaveLength(0);
    expect(m.view.map()).toEqual(sample());
  });
});

describe("carte mentale : changements venus d'ailleurs", () => {
  it("remplace la carte et vide l'historique", async () => {
    const m = await mount();
    click(find("Grands comptes"));
    key(m.view.element, "Delete");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    const other = sample();
    other.roots[1] = node("Autre");
    m.view.setMap(other);
    await vi.waitFor(() => expect(titles()).toContain("Autre"));
    key(m.view.element, "z", { metaKey: true });
    expect(titles()).toContain("Autre");
    m.view.setMap(other);
  });

  it("attend la fin de la saisie", async () => {
    const m = await mount();
    click(find("Calendrier"));
    key(m.view.element, "F2");
    await vi.waitFor(() => expect(input()).not.toBeNull());
    const other = sample();
    other.roots[1] = node("Autre");
    m.view.setMap(other);
    expect(titles()).not.toContain("Autre");
    key(input(), "Escape");
    await vi.waitFor(() => expect(titles()).toContain("Autre"));
  });

  it("cache puis remontre la carte, et la détruit", async () => {
    const m = await mount();
    m.view.hide();
    expect(m.view.element.hidden).toBe(true);
    m.view.show();
    expect(m.view.element.hidden).toBe(false);
    m.view.destroy();
    expect(document.querySelector(".mind-map")).toBeNull();
  });
});
