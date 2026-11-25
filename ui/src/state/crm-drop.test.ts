import { describe, expect, it } from "vitest";
import { type Drop, dropMove, nextCard, stagePlace } from "./crm-drop";

const rects = [
  { name: "a", top: 0, height: 100 },
  { name: "b", top: 110, height: 100 },
];

describe("carte devant laquelle on lâche", () => {
  it("est la première dont le milieu est plus bas que le pointeur", () => {
    expect(nextCard(rects, 10)).toBe("a");
    expect(nextCard(rects, 49)).toBe("a");
    expect(nextCard(rects, 51)).toBe("b");
    expect(nextCard(rects, 159)).toBe("b");
  });

  it("n'en a pas au milieu pile ni plus bas : tout en bas", () => {
    expect(nextCard(rects, 50)).toBe("b");
    expect(nextCard(rects, 160)).toBeNull();
    expect(nextCard(rects, 500)).toBeNull();
    expect(nextCard([], 10)).toBeNull();
  });
});

const column = (status: string, cards: string[], closed = false) => ({
  ...{ status, closed, count: cards.length, late: 0, cards },
});

const drop = (over: Partial<Drop>): Drop => ({
  dragged: "x",
  from: "TODO",
  target: column("Progress", ["a", "b"]),
  next: "b",
  filtered: false,
  ...over,
});

describe("carte lâchée", () => {
  it("dans une autre colonne ouverte : place devant la carte suivante", () => {
    expect(dropMove(drop({}))).toEqual({
      status: "Progress",
      placement: { kind: "before", card: "b" },
    });
  });

  it("dans une autre colonne ouverte, hors des cartes : tout en bas", () => {
    expect(dropMove(drop({ next: null }))).toEqual({
      status: "Progress",
      placement: { kind: "before", card: null },
    });
  });

  it("dans une colonne terminée : change de colonne sans être placée", () => {
    expect(dropMove(drop({ target: column("Done", ["a"], true) }))).toEqual({
      status: "Done",
      placement: { kind: "unplaced" },
    });
  });

  it("pendant un filtre : change de colonne sans être placée", () => {
    expect(dropMove(drop({ filtered: true }))).toEqual({
      status: "Progress",
      placement: { kind: "unplaced" },
    });
  });

  it("dans sa colonne, ailleurs que là où elle est : se place", () => {
    const target = column("TODO", ["x", "a", "b"]);
    expect(dropMove(drop({ target, next: "b" }))).toEqual({
      status: "TODO",
      placement: { kind: "before", card: "b" },
    });
    expect(dropMove(drop({ target, next: null }))).toEqual({
      status: "TODO",
      placement: { kind: "before", card: null },
    });
  });

  it("dans sa colonne, là où elle est déjà : ne change rien", () => {
    const target = column("TODO", ["a", "x", "b"]);
    expect(dropMove(drop({ target, next: "b" }))).toBeNull();
    const last = column("TODO", ["a", "b", "x"]);
    expect(dropMove(drop({ target: last, next: null }))).toBeNull();
  });

  it("dans sa colonne terminée ou pendant un filtre : ne change rien", () => {
    expect(dropMove(drop({ from: "Done", target: column("Done", ["x"], true) }))).toBeNull();
    expect(
      dropMove(drop({ target: column("TODO", ["x", "a"]), filtered: true, next: "a" })),
    ).toBeNull();
  });
});

describe("place d'une étape lâchée", () => {
  const others = [
    { stage: "Progress", left: 0, width: 100 },
    { stage: "WaitingFor", left: 100, width: 100 },
  ];

  it("compte les autres étapes dont le milieu est à gauche du pointeur", () => {
    expect(stagePlace(others, 10)).toBe(0);
    expect(stagePlace(others, 51)).toBe(1);
    expect(stagePlace(others, 151)).toBe(2);
    expect(stagePlace(others, 1000)).toBe(2);
  });

  it("ne compte pas une étape dont le milieu est pile sous le pointeur", () => {
    expect(stagePlace(others, 50)).toBe(0);
    expect(stagePlace(others, 150)).toBe(1);
    expect(stagePlace([], 10)).toBe(0);
  });
});
