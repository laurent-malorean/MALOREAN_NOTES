import { describe, expect, it } from "vitest";
import type { Tab } from "./columns";
import {
  type NotePosition,
  noteVisited,
  trailForgotten,
  trailMoved,
  trailOf,
  trailTarget,
  trailWalked,
} from "./trail";

const at = (anchor: number): NotePosition => ({ anchor, head: anchor, top: 0, offset: 0 });
const tab: Tab = { id: 1, note: "a.md", title: "A" };

describe("parcours d'un onglet", () => {
  it("est vide pour un onglet qui n'a jamais changé de note", () => {
    expect(trailOf(tab)).toEqual({ back: [], forward: [] });
    expect([trailTarget(tab, -1), trailTarget(tab, 1)]).toEqual([null, null]);
    expect(trailWalked(tab, -1, at(3))).toBe(tab);
    expect(trailWalked(tab, 1, at(3))).toBe(tab);
  });

  it("garde la note quittée, et où l'on y en était, quand l'onglet passe à une autre", () => {
    const b = noteVisited(tab, "b.md", at(7));
    expect(b).toEqual({
      id: 1,
      note: "b.md",
      title: null,
      trail: { back: [{ note: "a.md", position: at(7) }], forward: [] },
    });
    expect(trailTarget(b, -1)).toEqual({ note: "a.md", position: at(7) });
    expect(trailTarget(b, 1)).toBeNull();
  });

  it("revient à la note précédente, puis repart vers la suivante, chacune à sa position", () => {
    const c = noteVisited(noteVisited(tab, "b.md", at(1)), "c.md", at(2));
    const b = trailWalked(c, -1, at(3));
    expect(b.note).toBe("b.md");
    expect(b.title).toBeNull();
    expect(trailTarget(b, -1)).toEqual({ note: "a.md", position: at(1) });
    expect(trailTarget(b, 1)).toEqual({ note: "c.md", position: at(3) });
    const a = trailWalked(b, -1, at(4));
    expect(trailOf(a)).toEqual({
      back: [],
      forward: [
        { note: "c.md", position: at(3) },
        { note: "b.md", position: at(4) },
      ],
    });
    expect(trailOf(trailWalked(trailWalked(c, -1, null), 1, null)).forward).toEqual([]);
    const again = trailWalked(a, 1, at(5));
    expect(again.note).toBe("b.md");
    expect(trailOf(again)).toEqual({
      back: [{ note: "a.md", position: at(5) }],
      forward: [{ note: "c.md", position: at(3) }],
    });
  });

  it("oublie les notes d'après quand on prend un autre chemin", () => {
    const b = trailWalked(noteVisited(tab, "b.md", at(1)), -1, at(2));
    const d = noteVisited(b, "d.md", at(3));
    expect(trailOf(d)).toEqual({ back: [{ note: "a.md", position: at(3) }], forward: [] });
  });

  it("suit les notes renommées, et oublie celles parties à la corbeille", () => {
    expect(trailMoved(tab, () => "x.md")).toBe(tab);
    expect(trailForgotten(tab, () => true)).toBe(tab);
    const c = trailWalked(noteVisited(noteVisited(tab, "b.md", null), "c.md", null), -1, null);
    const moved = trailMoved(c, (path) => (path === "a.md" ? "z.md" : path));
    expect(trailOf(moved)).toEqual({
      back: [{ note: "z.md", position: null }],
      forward: [{ note: "c.md", position: null }],
    });
    const forgotten = trailForgotten(moved, (path) => path === "c.md");
    expect(trailOf(forgotten)).toEqual({ back: [{ note: "z.md", position: null }], forward: [] });
    expect(forgotten.note).toBe("b.md");
    expect(trailOf(trailForgotten(moved, (path) => path === "z.md")).back).toEqual([]);
  });
});
