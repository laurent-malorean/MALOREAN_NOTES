import { describe, expect, it } from "vitest";
import { mountColumns } from "../../test-support/pane-fixture";

/** Deux colonnes qui partagent les notes qu'elles montrent. */
const mount = (notes?: Record<string, string>) => {
  const m = mountColumns(notes, 2);
  const [left, right] = m.columns as [(typeof m.columns)[0], (typeof m.columns)[0]];
  return { ...m, left, right };
};
const versions = (calls: string[]) => calls.filter((c) => c.startsWith("version"));

describe("historique : une version gardée après quelques minutes de frappe", () => {
  it("le délai passé, ce qui est tapé est enregistré, puis une version en est gardée", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    m.left.type("!");
    m.fireVersion();
    await expect.poll(() => versions(m.calls)).toEqual(["version a.md"]);
    expect(m.calls.filter((c) => !c.startsWith("liens")).slice(-2)).toEqual([
      "enregistrer a.md # A",
      "version a.md",
    ]);
    expect(m.notes["a.md"]).toBe("# A!");
  });

  it("le délai court depuis la première frappe, et repart à la frappe qui suit une version", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    m.left.type("!");
    m.left.type("?");
    m.fireVersion();
    await expect.poll(() => versions(m.calls)).toEqual(["version a.md"]);
    m.left.type("+");
    m.fireVersion();
    await expect.poll(() => versions(m.calls)).toEqual(["version a.md", "version a.md"]);
  });

  it("sans frappe, aucune version n'est demandée", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    m.fireVersion();
    await m.left.pane.load("b.md");
    expect(versions(m.calls)).toEqual([]);
  });
});

describe("historique : une version gardée en quittant la note", () => {
  it("la dernière colonne qui quitte une note tapée en garde une version, après l'enregistrement", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    await m.right.pane.load("a.md");
    m.left.type("!");
    await m.left.pane.load("b.md");
    expect(versions(m.calls)).toEqual([]);
    await m.right.pane.load(null);
    expect(m.calls.filter((c) => !c.startsWith("liens")).slice(-2)).toEqual([
      "enregistrer a.md # A",
      "version a.md",
    ]);
  });

  it("une note quittée sans frappe depuis sa dernière version n'en a pas de nouvelle", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    m.left.type("!");
    m.fireVersion();
    await expect.poll(() => versions(m.calls)).toEqual(["version a.md"]);
    await m.left.pane.load("b.md");
    expect(versions(m.calls)).toEqual(["version a.md"]);
  });

  it("la version suit le nouveau nom que l'enregistrement donne à la note", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    m.left.type("\n");
    const editor = m.left.view();
    editor?.dispatch({ changes: { from: 0, to: 3, insert: "# Nouveau" } });
    await m.left.pane.load("b.md");
    expect(versions(m.calls)).toEqual(["version nouveau.md"]);
  });

  it("une note partie à la corbeille ne garde plus de version", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    m.left.type("!");
    m.left.pane.forget();
    m.fireVersion();
    m.left.type("?");
    await m.left.pane.load("b.md");
    expect(versions(m.calls)).toEqual([]);
  });

  it("une version ratée est dite", async () => {
    const m = mount();
    await m.left.pane.load("a.md");
    m.left.type("!");
    m.backend.failVersion = true;
    await m.left.pane.load("b.md");
    expect(versions(m.calls)).toEqual(["version a.md"]);
    expect(m.errors).toEqual(["historique plein"]);
  });
});
