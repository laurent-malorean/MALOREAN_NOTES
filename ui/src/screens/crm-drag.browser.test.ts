import { beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { action, crm } from "../../test-support/crm-fixture";
import {
  buttonNamed,
  callsTo,
  card,
  centre,
  column,
  drag,
  inside,
  mountCrm,
  type MountedCrm,
  pointer,
  press,
} from "../../test-support/crm-view-fixture";
import "../theme.css";
import "../style.css";

/** Trois cartes ouvertes en TODO (a, b, c), une en Progress (p), une terminée (d). */
const board = () =>
  crm({
    actions: [
      action("a", { title: "A" }),
      action("b", { title: "B" }),
      action("c", { title: "C" }),
      action("p", { title: "P", status: "Progress" }),
      action("d", { title: "D", status: "Done", open: false }),
    ],
  });
const moves = (m: MountedCrm) => callsTo(m, "moveCrmAction").map((call) => call.slice(2));
const lower = (name: string) => inside(card(name), 0.9);
const upper = (name: string) => inside(card(name), 0.1);

// Les colonnes ont 272 points au moins : le cadre doit être assez large pour que le pointeur les atteigne.
beforeAll(() => page.viewport(1600, 900));

describe("CRM : glisser une carte", () => {
  it("la lâcher devant une carte d'une autre colonne change son statut et la place là", async () => {
    const m = await mountCrm({ crm: board() });
    const gesture = drag(card("a"), upper("p"));
    expect(document.querySelector(".crm-ghost")).not.toBeNull();
    expect(card("a").classList.contains("dragging")).toBe(true);
    expect(card("p").classList.contains("drop-before")).toBe(true);
    expect(column("Progress").classList.contains("drop-target")).toBe(true);
    gesture.drop();
    expect(document.querySelector(".crm-ghost")).toBeNull();
    expect(document.querySelector(".drop-target, .drop-before")).toBeNull();
    await vi.waitFor(() =>
      expect(moves(m)).toEqual([["a", "Progress", { kind: "before", card: "p" }]]),
    );
    await vi.waitFor(() => expect(callsTo(m, "readCrm")).toHaveLength(2));
  });

  it("la lâcher sous la dernière carte, ou sur une colonne vide, la met tout en bas", async () => {
    const m = await mountCrm({ crm: board() });
    drag(card("a"), lower("p")).drop();
    await vi.waitFor(() =>
      expect(moves(m)).toEqual([["a", "Progress", { kind: "before", card: null }]]),
    );
    const empty = column("WaitingFor");
    const gesture = drag(card("b"), inside(empty, 0.5));
    expect(empty.querySelector(".crm-cards")?.classList.contains("drop-end")).toBe(true);
    gesture.drop();
    await vi.waitFor(() =>
      expect(moves(m).at(-1)).toEqual(["b", "WaitingFor", { kind: "before", card: null }]),
    );
  });

  it("la lâcher dans sa colonne, entre deux autres, la place là", async () => {
    const m = await mountCrm({ crm: board() });
    drag(card("c"), upper("a")).drop();
    await vi.waitFor(() =>
      expect(moves(m)).toEqual([["c", "TODO", { kind: "before", card: "a" }]]),
    );
  });

  it("ne demande rien quand elle est lâchée là où elle est déjà", async () => {
    const m = await mountCrm({ crm: board() });
    const gesture = drag(card("b"), upper("c"));
    expect(document.querySelector(".drop-before")).toBeNull();
    gesture.drop();
    drag(card("c"), lower("c")).drop();
    await new Promise((r) => setTimeout(r, 30));
    expect(moves(m)).toEqual([]);
  });

  it("dans une colonne terminée, change le statut sans la placer", async () => {
    const m = await mountCrm({ crm: board() });
    drag(card("a"), lower("d")).drop();
    await vi.waitFor(() => expect(moves(m)).toEqual([["a", "Done", { kind: "unplaced" }]]));
  });

  it("ne range pas une carte dans sa colonne terminée", async () => {
    const m = await mountCrm({ crm: board() });
    drag(card("d"), upper("d")).drop();
    await new Promise((r) => setTimeout(r, 30));
    expect(moves(m)).toEqual([]);
  });

  it("pendant un filtre, change de colonne sans être placée", async () => {
    const m = await mountCrm({ crm: board() });
    const search = document.querySelector(".crm-search") as HTMLInputElement;
    search.value = "a";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(callsTo(m, "readCrm")).toHaveLength(2));
    drag(card("a"), upper("p")).drop();
    await vi.waitFor(() => expect(moves(m)).toEqual([["a", "Progress", { kind: "unplaced" }]]));
  });

  it("un geste de moins de 4 points reste un clic : rien ne bouge", async () => {
    const m = await mountCrm({ crm: board() });
    const at = centre(card("a"));
    pointer(card("a"), "pointerdown", at.x, at.y);
    pointer(document, "pointermove", at.x + 2, at.y + 2);
    expect(document.querySelector(".crm-ghost")).toBeNull();
    pointer(document, "pointerup", at.x + 2, at.y + 2);
    expect(moves(m)).toEqual([]);
    expect(card("a").classList.contains("dragging")).toBe(false);
  });

  it("commence à 4 points exactement, pas avant", async () => {
    await mountCrm({ crm: board() });
    const at = centre(card("a"));
    pointer(card("a"), "pointerdown", at.x, at.y);
    pointer(document, "pointermove", at.x + 3, at.y);
    expect(document.querySelector(".crm-ghost")).toBeNull();
    pointer(document, "pointermove", at.x + 4, at.y);
    expect(document.querySelector(".crm-ghost")).not.toBeNull();
    pointer(document, "pointerup", at.x + 4, at.y);
  });

  it("Échap abandonne le glissé", async () => {
    const m = await mountCrm({ crm: board() });
    drag(card("a"), upper("p"));
    press(document.body, "Escape");
    expect(document.querySelector(".crm-ghost")).toBeNull();
    expect(card("a").classList.contains("dragging")).toBe(false);
    pointer(document, "pointerup", 0, 0);
    expect(moves(m)).toEqual([]);
  });

  it("un glissé annulé par le système s'arrête sans rien changer, et un appui sans glisser aussi", async () => {
    const m = await mountCrm({ crm: board() });
    drag(card("a"), upper("p"));
    pointer(document, "pointercancel", 0, 0);
    expect(document.querySelector(".crm-ghost")).toBeNull();
    const at = centre(card("a"));
    pointer(card("a"), "pointerdown", at.x, at.y);
    pointer(document, "pointercancel", at.x, at.y);
    expect(moves(m)).toEqual([]);
  });

  it("ne glisse qu'avec le premier bouton", async () => {
    await mountCrm({ crm: board() });
    const at = centre(card("a"));
    card("a").dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 2, clientX: at.x, clientY: at.y }),
    );
    pointer(document, "pointermove", at.x + 50, at.y);
    expect(document.querySelector(".crm-ghost")).toBeNull();
  });

  it("lâchée hors de toute colonne, elle ne bouge pas", async () => {
    const m = await mountCrm({ crm: board() });
    drag(card("a"), { x: 2, y: 2 }).drop();
    await new Promise((r) => setTimeout(r, 30));
    expect(moves(m)).toEqual([]);
  });

  it("le clic qui suit un glissé est avalé", async () => {
    await mountCrm({ crm: board() });
    const click = vi.fn();
    document.body.addEventListener("click", click);
    drag(card("a"), upper("p")).drop();
    buttonNamed("+ Ajouter une étape").click();
    await new Promise((r) => setTimeout(r, 10));
    buttonNamed("+ Ajouter une étape").click();
    expect(click).toHaveBeenCalledTimes(1);
    document.body.removeEventListener("click", click);
  });

  it("dit pourquoi un dépôt est refusé, et relit le CRM pour montrer ce qu'il en est", async () => {
    const m = await mountCrm({ crm: board() });
    m.fail.next = "Cette fiche n'existe plus.";
    drag(card("a"), upper("p")).drop();
    await vi.waitFor(() => expect(m.errors).toEqual([{ message: "Cette fiche n'existe plus." }]));
    await vi.waitFor(() => expect(callsTo(m, "readCrm")).toHaveLength(2));
  });
});

describe("CRM : glisser jusqu'au bord du tableau", () => {
  const edge = (board: HTMLElement, side: "left" | "right") => {
    const box = board.getBoundingClientRect();
    return { x: side === "left" ? box.left + 10 : box.right - 10, y: box.top + 100 };
  };

  it("fait défiler le tableau tant que le pointeur reste contre son bord, et s'arrête au lâcher", async () => {
    const m = await mountCrm({ crm: board(), width: 700 });
    const area = document.querySelector(".crm-board") as HTMLElement;
    const gesture = drag(card("a"), edge(area, "right"));
    await vi.waitFor(() => expect(area.scrollLeft).toBeGreaterThan(100));
    const at = edge(area, "right");
    pointer(document, "pointermove", at.x - 1, at.y);
    pointer(document, "pointermove", at.x, at.y);
    gesture.drop();
    await vi.waitFor(() => expect(callsTo(m, "readCrm")).toHaveLength(2));
    const now = () => (document.querySelector(".crm-board") as HTMLElement).scrollLeft;
    const stopped = now();
    expect(stopped).toBeGreaterThan(100);
    await new Promise((r) => setTimeout(r, 80));
    expect(now()).toBe(stopped);
  });

  it("revient en arrière contre le bord gauche, et ne défile plus quand le pointeur s'en éloigne", async () => {
    await mountCrm({ crm: board(), width: 700 });
    const area = document.querySelector(".crm-board") as HTMLElement;
    area.scrollLeft = 300;
    const gesture = drag(card("p"), edge(area, "left"));
    await vi.waitFor(() => expect(area.scrollLeft).toBeLessThan(250));
    const middle = { x: area.getBoundingClientRect().left + 300, y: 200 };
    pointer(document, "pointermove", middle.x, middle.y);
    const still = area.scrollLeft;
    await new Promise((r) => setTimeout(r, 80));
    expect(area.scrollLeft).toBe(still);
    gesture.drop();
  });
});
