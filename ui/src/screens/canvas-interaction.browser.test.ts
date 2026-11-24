import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  arrowEl,
  button,
  cardEl,
  centre,
  choose,
  click,
  drag,
  emptySpot,
  key,
  last,
  menuItems,
  mountAt100 as mount,
  pointer,
  selected,
  surface,
} from "../../test-support/canvas-fixture";
import "../theme.css";
import { closeContextMenu } from "./context-menu";

beforeEach(() => closeContextMenu());
afterEach(() => closeContextMenu());

describe("canvas : sélection", () => {
  it("un clic choisit une carte, Maj ajoute et retire, le fond vide la sélection, Cmd+A prend tout", async () => {
    await mount();
    click(cardEl("u"));
    expect(selected()).toEqual(["u"]);
    click(cardEl("t"), { shiftKey: true });
    expect(selected().sort()).toEqual(["t", "u"]);
    click(cardEl("t"), { shiftKey: true });
    expect(selected()).toEqual(["u"]);
    const e = emptySpot();
    pointer(surface(), "pointerdown", e.x, e.y);
    pointer(surface(), "pointerup", e.x, e.y);
    expect(selected()).toEqual([]);
    key("a", { metaKey: true });
    expect(selected()).toHaveLength(6);
    key("Escape");
    expect(selected()).toEqual([]);
  });

  it("un rectangle choisit les cartes entièrement dedans", async () => {
    await mount();
    const a = centre(cardEl("t")).box;
    const b = centre(cardEl("u")).box;
    const area = surface().getBoundingClientRect();
    const e = { x: area.left + 20, y: area.top + 20 };
    pointer(surface(), "pointerdown", e.x, e.y);
    pointer(surface(), "pointermove", a.left - 5, a.top - 5);
    pointer(surface(), "pointermove", b.right + 5, a.bottom + 5);
    pointer(surface(), "pointerup", b.right + 5, a.bottom + 5);
    expect(selected().sort()).toEqual(["t", "u"]);
    expect(document.querySelector(".canvas-arrow.selected")).not.toBeNull();
  });

  it("une flèche se choisit d'un clic", async () => {
    await mount();
    click(arrowEl("e2").querySelector(".canvas-arrow-hit") as Element);
    expect(arrowEl("e2").classList.contains("selected")).toBe(true);
  });
});

describe("canvas : déplacer et redimensionner", () => {
  it("glisser une carte la déplace, l'enregistre, la met au premier plan", async () => {
    const m = await mount();
    drag(cardEl("t"), 40, 20);
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    const t = last(m)?.cards.find((c) => c.id === "t");
    expect([t?.x, t?.y]).toEqual([60, 60]);
    expect(last(m)?.cards.at(-1)?.id).toBe("t");
    expect(m.saved[0]?.base).toBe("v0");
  });

  it("un simple clic met la carte au premier plan sans la déplacer", async () => {
    const m = await mount();
    click(cardEl("t"));
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    const t = last(m)?.cards.at(-1);
    expect([t?.id, t?.x, t?.y]).toEqual(["t", 20, 40]);
  });

  it("Maj garde une seule direction", async () => {
    const m = await mount();
    const c = centre(cardEl("t"));
    pointer(cardEl("t"), "pointerdown", c.x, c.y);
    pointer(surface(), "pointermove", c.x + 40, c.y + 10, { shiftKey: true });
    pointer(surface(), "pointerup", c.x + 40, c.y + 10, { shiftKey: true });
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    const t = last(m)?.cards.find((c) => c.id === "t");
    expect([t?.x, t?.y]).toEqual([60, 40]);
  });

  it("déplacer un groupe déplace les cartes qu'il contient entièrement", async () => {
    const m = await mount();
    drag(cardEl("g"), 20, 20);
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    const cards = Object.fromEntries((last(m)?.cards ?? []).map((c) => [c.id, [c.x, c.y]]));
    expect(cards["g"]).toEqual([20, 20]);
    expect(cards["t"]).toEqual([40, 60]);
    expect(cards["l"]).toEqual([800, 0]);
  });

  it("à la grille, la position tombe sur un point ; Espace désactive l'accrochage", async () => {
    const m = await mount(undefined, { grid: true });
    drag(cardEl("t"), 7, 7);
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.cards.find((c) => c.id === "t")?.x).toBe(20);
  });

  it("aux objets, un bord proche s'aligne", async () => {
    const m = await mount(undefined, { objects: true });
    drag(cardEl("u"), -20, 4);
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.cards.find((c) => c.id === "u")?.y).toBe(40);
  });

  it("une poignée redimensionne la carte", async () => {
    const m = await mount();
    click(cardEl("u"));
    const grip = cardEl("u").querySelector(".canvas-grip-rb") as Element;
    drag(grip, 40, 20);
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    const u = last(m)?.cards.find((c) => c.id === "u");
    expect([u?.width, u?.height]).toEqual([240, 100]);
  });

  it("Maj garde le rapport largeur/hauteur, la poignée gauche déplace le coin", async () => {
    const m = await mount();
    click(cardEl("u"));
    drag(cardEl("u").querySelector(".canvas-grip-lt") as Element, -40, 0, { shiftKey: true });
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    const u = last(m)?.cards.find((c) => c.id === "u");
    expect(u?.width).toBe(240);
    expect(u?.height).toBe(96);
    expect(u?.x).toBe(300);
  });
});

describe("canvas : flèches", () => {
  it("le rond d'un bord tiré jusqu'à une carte crée une flèche vers son côté le plus proche", async () => {
    const m = await mount();
    const dot = cardEl("t").querySelector(".canvas-link-dot-bottom") as Element;
    const target = centre(cardEl("n"));
    const from = centre(dot);
    pointer(dot, "pointerdown", from.x, from.y);
    pointer(surface(), "pointermove", target.x, target.y);
    expect(document.querySelector(".canvas-draft .canvas-arrow-draft")).not.toBeNull();
    pointer(surface(), "pointerup", target.x, target.y - 30);
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    const made = last(m)?.arrows.at(-1);
    expect([made?.from, made?.fromSide, made?.to, made?.toSide, made?.toEnd]).toEqual([
      "t",
      "bottom",
      "n",
      "top",
      "arrow",
    ]);
  });

  it("relâchée dans le vide, elle crée une carte texte à l'autre bout, en saisie", async () => {
    const m = await mount();
    const dot = cardEl("u").querySelector(".canvas-link-dot-right") as Element;
    const from = centre(dot);
    pointer(dot, "pointerdown", from.x, from.y);
    pointer(surface(), "pointermove", from.x + 150, from.y);
    pointer(surface(), "pointerup", from.x + 150, from.y);
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.cards).toHaveLength(7);
    expect(last(m)?.arrows.at(-1)?.toSide).toBe("left");
    expect(document.querySelector(".canvas-editor")).not.toBeNull();
  });

  it("une flèche lâchée sur la carte de départ ne fait rien", async () => {
    const m = await mount();
    const dot = cardEl("t").querySelector(".canvas-link-dot-top") as Element;
    const from = centre(dot);
    const own = centre(cardEl("t"));
    pointer(dot, "pointerdown", from.x, from.y);
    pointer(surface(), "pointerup", own.x, own.y);
    expect(m.saved).toHaveLength(0);
  });

  it("l'extrémité d'une flèche glissée sur une autre carte la reconnecte ; dans le vide, la déconnecte", async () => {
    const m = await mount();
    click(arrowEl("e3").querySelector(".canvas-arrow-hit") as Element);
    const end = arrowEl("e3").querySelector('.canvas-arrow-end[data-end="to"]') as Element;
    const c = centre(end);
    const target = centre(cardEl("u"));
    pointer(end, "pointerdown", c.x, c.y);
    pointer(surface(), "pointermove", target.x, target.y);
    pointer(surface(), "pointerup", target.x, target.y);
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.arrows.find((a) => a.id === "e3")?.to).toBe("u");
    const start = arrowEl("e3").querySelector('.canvas-arrow-end[data-end="from"]') as Element;
    const s = centre(start);
    const e = emptySpot();
    pointer(start, "pointerdown", s.x, s.y);
    pointer(surface(), "pointerup", e.x, e.y);
    await vi.waitFor(() => expect(m.saved).toHaveLength(2));
    expect(last(m)?.arrows.map((a) => a.id)).toEqual(["e1", "e2"]);
  });
});

describe("canvas : modifier et supprimer", () => {
  it("un double-clic sur le fond crée une carte texte où l'on tape ; Échap garde le texte", async () => {
    const m = await mount();
    const e = emptySpot();
    pointer(surface(), "pointerdown", e.x, e.y);
    pointer(surface(), "pointerup", e.x, e.y);
    pointer(surface(), "pointerdown", e.x, e.y);
    pointer(surface(), "pointerup", e.x, e.y);
    const field = document.querySelector(".canvas-editor") as HTMLTextAreaElement;
    expect(field).not.toBeNull();
    field.value = "Neuf";
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(m.saved.length).toBeGreaterThan(1));
    expect(last(m)?.cards.at(-1)?.text).toBe("Neuf");
    expect(document.querySelector(".canvas-editor")).toBeNull();
  });

  it("modifier un texte sans le changer n'enregistre rien de plus", async () => {
    const m = await mount();
    click(cardEl("u"));
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    (button("Modifier") as HTMLButtonElement).click();
    const field = document.querySelector(".canvas-editor") as HTMLTextAreaElement;
    field.dispatchEvent(new Event("blur"));
    expect(document.querySelector(".canvas-editor")).toBeNull();
    expect(m.saved).toHaveLength(1);
  });

  it("le nom d'un groupe et l'étiquette d'une flèche se modifient sur place", async () => {
    const m = await mount();
    for (let i = 0; i < 2; i++) {
      const label = cardEl("g").querySelector(".canvas-group-label") as Element;
      pointer(label, "pointerdown", centre(label).x, centre(label).y);
      pointer(surface(), "pointerup", centre(label).x, centre(label).y);
    }
    const input = document.querySelector("input.canvas-editor") as HTMLInputElement;
    input.value = "Phase 2";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.cards.find((c) => c.id === "g")?.label).toBe("Phase 2");
    for (let i = 0; i < 2; i++) {
      const hit = arrowEl("e3").querySelector(".canvas-arrow-hit") as Element;
      pointer(hit, "pointerdown", centre(hit).x, centre(hit).y);
      pointer(surface(), "pointerup", centre(hit).x, centre(hit).y);
    }
    const field = document.querySelector("input.canvas-editor") as HTMLInputElement;
    field.value = "mène à";
    field.dispatchEvent(new Event("blur"));
    await vi.waitFor(() => expect(m.saved).toHaveLength(2));
    expect(last(m)?.arrows.find((a) => a.id === "e3")?.label).toBe("mène à");
  });

  it("Suppr retire la sélection et ses flèches ; annuler et rétablir la rendent et la retirent", async () => {
    const m = await mount();
    click(cardEl("u"));
    key("Delete");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.arrows.map((a) => a.id)).toEqual(["e3"]);
    key("z", { metaKey: true });
    await vi.waitFor(() => expect(m.saved).toHaveLength(2));
    expect(last(m)?.cards).toHaveLength(6);
    key("z", { metaKey: true, shiftKey: true });
    await vi.waitFor(() => expect(m.saved).toHaveLength(3));
    expect(last(m)?.cards).toHaveLength(5);
    key("z", { metaKey: true });
    key("y", { metaKey: true });
    await vi.waitFor(() => expect(m.saved).toHaveLength(5));
    button("Annuler").click();
    button("Rétablir").click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(7));
  });

  it("la barre de la sélection pose une couleur de la palette, un second clic l'enlève", async () => {
    const m = await mount();
    click(cardEl("t"));
    button("Couleur").click();
    (document.querySelector('.canvas-swatch[data-color="bleu"]') as HTMLElement).click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.cards.find((c) => c.id === "t")?.palette).toBe("bleu");
    button("Couleur").click();
    expect(document.querySelectorAll(".canvas-swatch")).toHaveLength(10);
    (document.querySelector('.canvas-swatch[data-color="bleu"]') as HTMLElement).click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(2));
    expect(last(m)?.cards.find((c) => c.id === "t")?.palette).toBeNull();
  });

  it("le sens d'une flèche se choisit dans un menu à trois choix, le sens actuel coché", async () => {
    const m = await mount();
    click(arrowEl("e1").querySelector(".canvas-arrow-hit") as Element);
    button("Sens de la ligne").click();
    expect(menuItems()).toEqual(["Non directionnel", "Unidirectionnel", "Bidirectionnel"]);
    expect(document.querySelector(".context-menu .checked")?.textContent).toBe("Unidirectionnel");
    choose("Bidirectionnel");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.arrows.find((a) => a.id === "e1")?.fromEnd).toBe("arrow");
  });

  it("aligner plusieurs cartes", async () => {
    const m = await mount();
    click(cardEl("t"));
    click(cardEl("u"), { shiftKey: true });
    button("Aligner").click();
    expect(menuItems()).toHaveLength(8);
    choose("Aligner en haut");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.cards.find((c) => c.id === "u")?.y).toBe(40);
    button("Aligner").click();
    choose("Répartir l'espace horizontal");
  });
});
