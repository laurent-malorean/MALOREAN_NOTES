import { defined } from "../../test-support/defined";
import { describe, expect, it } from "vitest";
import type { CanvasArrowItem, CanvasCardItem, CanvasItem } from "../bridge";
import {
  boundsOf,
  broughtToFront,
  cardTitle,
  colored,
  isGroup,
  members,
  moved,
  newFileCard,
  newGroup,
  newId,
  newLinkCard,
  newTextCard,
  rectOf,
  senseOf,
  withArrow,
  withArrowChanged,
  withCard,
  withCardChanged,
  withGroupAround,
  withMembers,
  withSense,
  withoutArrows,
  withoutCards,
  card,
  arrow,
} from "./canvas-model";

const at = (id: string, x: number, y: number, w = 10, h = 10, kind = "text"): CanvasCardItem => ({
  ...newTextCard(x, y),
  id,
  kind,
  width: w,
  height: h,
});

const canvas = (cards: CanvasCardItem[], arrows: CanvasArrowItem[] = []): CanvasItem => ({
  cards,
  arrows,
  extra: [],
});

describe("identifiants et cartes neuves", () => {
  it("un identifiant a 16 chiffres hexadécimaux minuscules, jamais deux fois le même", () => {
    expect(newId()).toMatch(/^[0-9a-f]{16}$/);
    expect(newId()).not.toBe(newId());
  });

  it("chaque sorte de carte neuve a sa taille et ses champs", () => {
    expect(newTextCard(1.4, 2.6, "Bonjour")).toMatchObject({
      kind: "text",
      text: "Bonjour",
      x: 1,
      y: 3,
      width: 250,
      height: 60,
      color: null,
      extra: [],
    });
    expect(newFileCard(0, 0, "Notes/Projet.md")).toMatchObject({
      kind: "file",
      file: "Notes/Projet.md",
      width: 400,
      height: 300,
    });
    expect(newLinkCard(0, 0, "https://a.b")).toMatchObject({ kind: "link", url: "https://a.b" });
    expect(newGroup(0, 0)).toMatchObject({ kind: "group", width: 400, height: 300 });
  });

  it("le titre d'une carte est le nom de la note, l'adresse ou le nom du groupe", () => {
    expect(cardTitle(newFileCard(0, 0, "Notes/Projet.md"))).toBe("Projet");
    expect(cardTitle(newFileCard(0, 0, "img/a.png"))).toBe("a.png");
    expect(cardTitle(newLinkCard(0, 0, "https://a.b"))).toBe("https://a.b");
    expect(cardTitle({ ...newGroup(0, 0), label: "Phase 1" })).toBe("Phase 1");
    expect(cardTitle(newGroup(0, 0))).toBe("");
    expect(cardTitle(newTextCard(0, 0))).toBe("");
  });
});

describe("groupes", () => {
  const group = { ...at("g", 0, 0, 100, 100), kind: "group" };
  const full = canvas([
    group,
    at("in", 0, 0, 100, 100),
    at("part", 50, 50, 60, 10),
    at("out", 200, 0),
    { ...at("sub", 5, 5, 20, 20), kind: "group" },
  ]);

  it("une carte fait partie du groupe seulement si elle est entièrement dans son cadre", () => {
    expect(members(full, "g").map((c) => c.id)).toEqual(["in", "sub"]);
    expect(members(full, "in")).toEqual([]);
    expect(members(full, "absent")).toEqual([]);
    expect(isGroup(group)).toBe(true);
  });

  it("déplacer un groupe déplace ses cartes", () => {
    expect(withMembers(full, ["g"]).sort()).toEqual(["g", "in", "sub"]);
    expect(withMembers(full, ["out"])).toEqual(["out"]);
  });

  it("un groupe créé autour de cartes les entoure avec une marge et passe sous elles", () => {
    const base = canvas([at("a", 100, 100, 50, 40), at("b", 200, 150, 50, 40)]);
    const { canvas: next, id } = withGroupAround(base, ["a", "b"]);
    expect(defined(next.cards[0]).id).toBe(id);
    expect(rectOf(defined(next.cards[0]))).toEqual({ x: 80, y: 80, w: 190, h: 130 });
    expect(members(next, id).map((c) => c.id)).toEqual(["a", "b"]);
    const empty = withGroupAround(base, []);
    expect(empty.canvas.cards[0]).toMatchObject({ x: 0, y: 0, width: 400, height: 300 });
  });
});

describe("changements", () => {
  const base = canvas([at("a", 0, 0), at("b", 20, 0), at("c", 40, 0)]);

  it("une carte s'ajoute au premier plan, un groupe au fond", () => {
    expect(withCard(base, at("n", 0, 0)).cards.map((c) => c.id)).toEqual(["a", "b", "c", "n"]);
    expect(defined(withCard(base, newGroup(0, 0)).cards[0]).kind).toBe("group");
  });

  it("retirer une carte retire ses flèches", () => {
    const { canvas: withLink } = withArrow(
      base,
      { id: "a", side: "right" },
      { id: "b", side: "left" },
    );
    const { canvas: both } = withArrow(
      withLink,
      { id: "b", side: "right" },
      { id: "c", side: "left" },
    );
    const gone = withoutCards(both, ["a"]);
    expect(gone.cards.map((c) => c.id)).toEqual(["b", "c"]);
    expect(gone.arrows).toHaveLength(1);
    expect(withoutCards(both, ["c"]).arrows).toHaveLength(1);
  });

  it("retirer une flèche ne retire que celle-là", () => {
    const { canvas: withLink, id } = withArrow(
      base,
      { id: "a", side: "right" },
      { id: "b", side: "left" },
    );
    expect(withoutArrows(withLink, [id]).arrows).toEqual([]);
    expect(withoutArrows(withLink, ["autre"]).arrows).toHaveLength(1);
  });

  it("une carte ou une flèche se change par ses champs", () => {
    expect(defined(card(withCardChanged(base, "b", { text: "x" }), "b")).text).toBe("x");
    expect(defined(card(withCardChanged(base, "b", { text: "x" }), "a")).text).toBe("");
    const { canvas: withLink, id } = withArrow(
      base,
      { id: "a", side: "right" },
      { id: "b", side: "left" },
    );
    expect(defined(arrow(withArrowChanged(withLink, id, { label: "l" }), id)).label).toBe("l");
    expect(arrow(withLink, "absente")).toBeUndefined();
    expect(card(base, "absente")).toBeUndefined();
  });

  it("déplacer arrondit aux entiers et ne touche que les cartes données", () => {
    const next = moved(base, ["b"], 10.4, -3.6);
    expect(next.cards.map((c) => [c.x, c.y])).toEqual([
      [0, 0],
      [30, -4],
      [40, 0],
    ]);
  });

  it("passer au premier plan garde l'ordre des cartes passées", () => {
    expect(broughtToFront(base, ["a", "b"]).cards.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(broughtToFront(base, []).cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("la couleur se pose sur les cartes et les flèches choisies seulement, et s'enlève", () => {
    const { canvas: withLink, id } = withArrow(
      base,
      { id: "a", side: "right" },
      { id: "b", side: "left" },
    );
    const painted = colored(
      withLink,
      [
        { kind: "card", id: "a" },
        { kind: "arrow", id },
      ],
      "rouge",
    );
    expect(painted.cards.map((c) => c.palette)).toEqual(["rouge", null, null]);
    expect(defined(painted.arrows[0]).palette).toBe("rouge");
    const cleared = colored(painted, [{ kind: "card", id: "a" }], null);
    expect(defined(cleared.cards[0]).palette).toBeNull();
    expect(defined(cleared.arrows[0]).palette).toBe("rouge");
    const kept = colored(
      { ...base, cards: [{ ...defined(base.cards[0]), color: "#abc" }] },
      [{ kind: "card", id: "a" }],
      "bleu",
    );
    expect(kept.cards[0]).toMatchObject({ palette: "bleu", color: null });
    expect(
      defined(colored(withLink, [{ kind: "arrow", id: "a" }], "rouge").cards[0]).palette,
    ).toBeNull();
  });

  it("une flèche neuve va de la première carte à la seconde, avec une pointe à l'arrivée", () => {
    const { canvas: next, id } = withArrow(
      base,
      { id: "a", side: "right" },
      { id: "b", side: "left" },
    );
    expect(next.arrows).toEqual([
      expect.objectContaining({
        id,
        from: "a",
        fromSide: "right",
        fromEnd: "none",
        to: "b",
        toSide: "left",
        toEnd: "arrow",
      }),
    ]);
  });
});

describe("sens des flèches", () => {
  const { canvas: withLink, id } = withArrow(
    canvas([at("a", 0, 0), at("b", 20, 0)]),
    { id: "a", side: "right" },
    { id: "b", side: "left" },
  );
  const sense = (c: CanvasItem) => senseOf(defined(c.arrows[0]));

  it("le sens se lit sur les deux extrémités et s'écrit comme le format", () => {
    expect(sense(withLink)).toBe("single");
    expect(sense(withSense(withLink, id, "none"))).toBe("none");
    expect(sense(withSense(withLink, id, "both"))).toBe("both");
    expect(withSense(withLink, id, "none").arrows[0]).toMatchObject({
      fromEnd: "none",
      toEnd: "none",
    });
    expect(withSense(withLink, id, "both").arrows[0]).toMatchObject({
      fromEnd: "arrow",
      toEnd: "arrow",
    });
  });

  it("une pointe au seul départ n'est aucun des trois sens du menu", () => {
    expect(senseOf({ ...defined(withLink.arrows[0]), fromEnd: "arrow", toEnd: "none" })).toBeNull();
  });
});

describe("zone", () => {
  it("la zone de plusieurs rectangles, ou rien", () => {
    expect(boundsOf([])).toBeNull();
    expect(
      boundsOf([
        { x: 0, y: 5, w: 10, h: 10 },
        { x: 20, y: 0, w: 10, h: 10 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 30, h: 15 });
  });
});
