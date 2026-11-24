import { defined } from "../../test-support/defined";
import { describe, expect, it } from "vitest";
import type { CanvasItem } from "../bridge";
import { EMPTY_HISTORY, HISTORY_LIMIT, changed, redone, undone } from "./canvas-history";

const version = (n: number): CanvasItem => ({
  cards: [],
  arrows: [],
  extra: [{ key: "n", json: String(n) }],
});

describe("annuler et rétablir", () => {
  it("annuler rend la version d'avant et garde celle d'après pour la rétablir", () => {
    const history = changed(EMPTY_HISTORY, version(1));
    const back = defined(undone(history, version(2)));
    expect(back.canvas).toEqual(version(1));
    const forward = defined(redone(back.history, back.canvas));
    expect(forward.canvas).toEqual(version(2));
    expect(forward.history.past).toEqual([version(1)]);
  });

  it("rien à annuler, rien à rétablir", () => {
    expect(undone(EMPTY_HISTORY, version(1))).toBeNull();
    expect(redone(EMPTY_HISTORY, version(1))).toBeNull();
  });

  it("un nouveau changement efface ce qu'on pouvait rétablir", () => {
    const back = defined(undone(changed(EMPTY_HISTORY, version(1)), version(2)));
    expect(changed(back.history, version(3)).future).toEqual([]);
  });

  it("on garde les cinquante derniers changements", () => {
    let history = EMPTY_HISTORY;
    for (let n = 0; n < HISTORY_LIMIT + 10; n++) history = changed(history, version(n));
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]).toEqual(version(10));
  });
});
