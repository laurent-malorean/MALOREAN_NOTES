import { describe, expect, it } from "vitest";
import { mountColumns as mount } from "../../test-support/pane-fixture";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const star = (m: ReturnType<typeof mount>) => m.parts.star as HTMLButtonElement;

describe("colonne : l'étoile des favoris", () => {
  it("est cachée sans note, creuse sur une note qui n'est pas en favori", async () => {
    const m = mount();
    expect(star(m).hidden).toBe(true);
    await m.pane.load("a.md");
    await expect.poll(() => star(m).hidden).toBe(false);
    expect(star(m).getAttribute("aria-pressed")).toBe("false");
    expect(m.starCalls).toEqual(["état a.md"]);
  });

  it("est pleine sur un favori, et cachée là où l'application le dit (note des favoris)", async () => {
    const m = mount();
    m.stars["a.md"] = "filled";
    m.stars["b.md"] = "hidden";
    await m.pane.load("a.md");
    await expect.poll(() => star(m).getAttribute("aria-pressed")).toBe("true");
    await m.pane.load("b.md");
    await expect.poll(() => star(m).hidden).toBe(true);
    await m.pane.load(null);
    await settle();
    expect(star(m).hidden).toBe(true);
  });

  it("se cache pendant que la note suivante se lit, pour qu'un clic ne vise pas la mauvaise", async () => {
    const m = mount();
    await m.pane.load("a.md");
    await expect.poll(() => star(m).hidden).toBe(false);
    const open = m.hold("lire b.md");
    const loading = m.pane.load("b.md");
    expect(star(m).hidden).toBe(true);
    open();
    await loading;
    await expect.poll(() => star(m).hidden).toBe(false);
  });

  it("un clic demande de basculer la note montrée, avec l'état montré", async () => {
    const m = mount();
    await m.pane.load("a.md");
    await expect.poll(() => star(m).hidden).toBe(false);
    star(m).click();
    m.stars["a.md"] = "filled";
    await m.pane.showStar();
    star(m).click();
    expect(m.starCalls.filter((call) => call.startsWith("basculer"))).toEqual([
      "basculer a.md empty",
      "basculer a.md filled",
    ]);
  });

  it("ignore l'état arrivé pour une note qu'elle ne montre plus", async () => {
    const m = mount();
    m.stars["a.md"] = "filled";
    await m.pane.load("a.md");
    const slow = m.pane.showStar();
    await m.pane.load("b.md");
    await slow;
    await expect.poll(() => star(m).getAttribute("aria-pressed")).toBe("false");
  });

  it("relit son étoile quand un enregistrement renomme la note, pas sinon", async () => {
    const m = mount({ "a.md": "# A", "n.md": "# Nouveau" });
    await m.pane.load("a.md");
    await expect.poll(() => star(m).hidden).toBe(false);
    m.type(" suite");
    await m.pane.flush();
    await settle();
    expect(m.starCalls).toEqual(["état a.md"]);
    await m.pane.load("n.md");
    await expect.poll(() => m.starCalls.length).toBe(2);
    m.type(" suite");
    await m.pane.flush();
    await expect.poll(() => m.starCalls).toEqual(["état a.md", "état n.md", "état nouveau.md"]);
  });

  it("une erreur en lisant l'étoile est dite, jamais passée sous silence", async () => {
    const m = mount();
    m.starFails.on = true;
    await m.pane.load("a.md");
    await expect.poll(() => m.errors).toEqual(["préférences illisibles"]);
  });
});
