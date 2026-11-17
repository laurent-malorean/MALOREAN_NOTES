import { undo } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { mountColumns } from "../../test-support/pane-fixture";

/** Deux colonnes (ou plus) qui partagent les notes qu'elles montrent. */
const mount = (notes?: Record<string, string>, count = 2) => {
  const m = mountColumns(notes, count);
  const [left, right] = m.columns as [(typeof m.columns)[0], (typeof m.columns)[0]];
  return { ...m, left, right };
};
const reads = (calls: string[], path: string) => calls.filter((c) => c === `lire ${path}`).length;
const saves = (calls: string[]) => calls.filter((c) => c.startsWith("enregistrer"));

describe("même note dans deux colonnes : un seul texte", () => {
  it("ce qu'on tape d'un côté apparaît aussitôt de l'autre, et s'enregistre une fois", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    await m.right.pane.load("a.md");
    m.left.type("!");
    expect(m.right.text()).toBe("# A!");
    m.right.type("?");
    expect(m.left.text()).toBe("# A!?");
    m.fire();
    await m.left.pane.flush();
    await m.right.pane.flush();
    expect(saves(m.calls)).toEqual(["enregistrer a.md # A"]);
    expect(m.notes["a.md"]).toBe("# A!?");
  });

  it("la colonne où l'on tape garde son curseur, l'autre aussi, même si l'on écrit au-dessus", async () => {
    const m = mount({ "a.md": "# A\nun\ndeux" });
    await m.left.pane.load("a.md");
    await m.right.pane.load("a.md");
    const right = m.right.view() as EditorView;
    right.dispatch({ selection: { anchor: 7, head: 11 } });
    const left = m.left.view() as EditorView;
    left.dispatch({ changes: { from: 3, insert: "\nzéro" }, selection: { anchor: 8 } });
    const { from, to } = right.state.selection.main;
    expect(right.state.sliceDoc(from, to)).toBe("deux");
    expect(left.state.selection.main.head).toBe(8);
  });

  it("une colonne qui l'ouvre prend le texte tapé, sans relire le disque", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    m.left.type("!");
    await m.right.pane.load("a.md");
    expect(m.right.text()).toBe("# A!");
    expect(reads(m.calls, "a.md")).toBe(1);
    expect(m.titles).toEqual(["a.md : titre de # A", "a.md : titre de # A"]);
  });

  it("demandée par deux colonnes à la fois, elle n'est lue qu'une fois", async () => {
    const m = mount();
    const release = m.hold("lire a.md");
    const both = Promise.all([m.left.pane.load("a.md"), m.right.pane.load("a.md")]);
    // La colonne qui attend sa note tape encore dans la précédente : rien n'en est gardé.
    m.right.type("perdu");
    release();
    await both;
    expect(reads(m.calls, "a.md")).toBe(1);
    expect([m.left.text(), m.right.text()]).toEqual(["# A", "# A"]);
    m.fire();
    await m.left.pane.flush();
    expect(saves(m.calls)).toEqual([]);
  });

  it("annuler ne défait que ce qui a été tapé dans sa colonne", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    await m.right.pane.load("a.md");
    m.left.type("!");
    m.right.type("?");
    undo(m.left.view() as EditorView);
    expect([m.left.text(), m.right.text()]).toEqual(["# A?", "# A?"]);
  });
});

describe("même note dans deux colonnes : enregistrement et changements", () => {
  it("la dernière colonne qui la quitte enregistre ce qui est tapé", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    await m.right.pane.load("a.md");
    m.left.type("!");
    await m.left.pane.load("b.md");
    expect(saves(m.calls)).toEqual([]);
    m.right.type("?");
    expect(m.left.text()).toBe("# B");
    await m.right.pane.load("b.md");
    expect(m.notes["a.md"]).toBe("# A!?");
  });

  it("renommée par son titre : les deux colonnes suivent le nouveau nom, une autre la reprend", async () => {
    const m = mount(undefined, 3);
    await m.left.pane.load("a.md");
    await m.right.pane.load("a.md");
    m.left.view()?.dispatch({ changes: { from: 0, to: 3, insert: "# Nouveau" } });
    m.fire();
    await m.left.pane.flush();
    expect([m.left.pane.note(), m.right.pane.note()]).toEqual(["nouveau.md", "nouveau.md"]);
    expect(m.events).toEqual(["enregistrée a.md → nouveau.md"]);
    await expect.poll(() => m.calls.filter((c) => c === "liens nouveau.md")).toHaveLength(2);
    const third = m.columns[2];
    // L'ancien nom ne désigne plus rien.
    await expect(third?.pane.load("a.md")).rejects.toThrow("a.md absente");
    m.right.type("!");
    await third?.pane.load("nouveau.md");
    expect(third?.text()).toBe("# Nouveau!");
    expect(reads(m.calls, "nouveau.md")).toBe(0);
  });

  it("une fois quittée par toutes les colonnes, elle est relue sous son dernier nom", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    m.left.view()?.dispatch({ changes: { from: 0, to: 3, insert: "# Nouveau" } });
    await m.left.pane.load("b.md");
    await m.right.pane.load("nouveau.md");
    expect(reads(m.calls, "nouveau.md")).toBe(1);
    expect(m.right.text()).toBe("# Nouveau");
  });

  it("une lecture ratée est retentée par la colonne suivante", async () => {
    const m = mount({});
    await expect(m.left.pane.load("x.md")).rejects.toThrow("x.md absente");
    m.notes["x.md"] = "# X";
    await m.right.pane.load("x.md");
    m.right.type("!");
    await m.left.pane.load(null);
    await m.left.pane.load("x.md");
    expect(m.left.text()).toBe("# X!");
    expect(reads(m.calls, "x.md")).toBe(2);
  });

  it("changée sur le disque : les deux colonnes montrent la nouvelle version, lue une fois", async () => {
    const m = mount(undefined, 3);
    await m.left.pane.load("a.md");
    await m.right.pane.load("a.md");
    m.notes["a.md"] = "# A changée";
    await m.left.pane.followDisk();
    await m.right.pane.followDisk();
    expect([m.left.text(), m.right.text()]).toEqual(["# A changée", "# A changée"]);
    expect(m.titles.slice(2)).toEqual(["a.md : titre de # A changée"]);
    await m.columns[2]?.pane.load("a.md");
    expect(m.titles.at(-1)).toBe("a.md : titre de # A changée");
    expect(reads(m.calls, "a.md")).toBe(3);
  });

  it("partie à la corbeille : plus rien n'est enregistré, de quelque colonne qu'on tape", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    await m.right.pane.load("a.md");
    const errors = vi.spyOn(console, "error");
    m.left.pane.forget();
    m.right.type("!");
    m.fire();
    await m.right.pane.flush();
    expect(saves(m.calls)).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("une colonne qui a quitté la note n'agit plus sur elle", async () => {
    const m = mount();
    m.left.pane.forget();
    await m.left.pane.load("a.md");
    await m.right.pane.load("a.md");
    await m.left.pane.load(null);
    m.left.pane.forget();
    await m.left.pane.followDisk();
    expect(reads(m.calls, "a.md")).toBe(1);
    m.right.type("!");
    await m.right.pane.flush();
    expect(m.notes["a.md"]).toBe("# A!");
  });

  it("une colonne qui disparaît laisse l'autre écrire et enregistrer", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    await m.right.pane.load("a.md");
    m.left.pane.destroy();
    expect(saves(m.calls)).toEqual([]);
    m.right.type("!");
    await m.right.pane.flush();
    expect(m.notes["a.md"]).toBe("# A!");
  });
});
