import { describe, expect, it } from "vitest";
import type { MindMapItem } from "../bridge";
import { changed, EMPTY_HISTORY, HISTORY_LIMIT, redone, undone } from "./mind-map-history";

/** Le résultat d'une annulation ou d'un rétablissement, qui doit exister. */
function some<T>(value: T | null): T {
  if (value === null) throw new Error("rien à faire");
  return value;
}

const map = (title: string): MindMapItem => ({
  roots: [{ title, color: null, detail: [], children: [] }],
  places: [{ x: 0, y: 0 }],
});

describe("l'historique d'une carte mentale", () => {
  it("annule puis rétablit", () => {
    let history = changed(EMPTY_HISTORY, map("1"));
    history = changed(history, map("2"));
    const back = some(undone(history, map("3")));
    expect(back.map).toEqual(map("2"));
    const again = some(undone(back.history, back.map));
    expect(again.map).toEqual(map("1"));
    expect(undone(again.history, again.map)).toBeNull();
    const forward = some(redone(again.history, again.map));
    expect(forward.map).toEqual(map("2"));
    expect(some(redone(forward.history, forward.map)).map).toEqual(map("3"));
    expect(redone(EMPTY_HISTORY, map("x"))).toBeNull();
  });

  it("oublie ce qui était à rétablir après un nouveau changement", () => {
    const back = some(undone(changed(EMPTY_HISTORY, map("1")), map("2")));
    expect(changed(back.history, map("9")).future).toEqual([]);
  });

  it("garde 50 changements au plus", () => {
    let history = EMPTY_HISTORY;
    for (let at = 0; at < HISTORY_LIMIT + 5; at += 1) history = changed(history, map(String(at)));
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]).toEqual(map("5"));
  });
});
