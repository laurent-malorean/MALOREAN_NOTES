import { afterEach, describe, expect, it, vi } from "vitest";
import "../theme.css";
import "../style.css";
import { createNoteTags, type NoteTagsDeps } from "./note-tags";

afterEach(() => document.body.replaceChildren());

function mount(overrides: Partial<NoteTagsDeps> = {}) {
  const bar = document.createElement("div");
  document.body.append(bar);
  const files: Record<string, string[]> = { "a.md": ["perso"], "b.md": [] };
  const calls: string[] = [];
  const errors: unknown[] = [];
  const deps: NoteTagsDeps = {
    read: (path) => (calls.push(`read ${path}`), Promise.resolve(files[path] ?? [])),
    suggestions: () => (calls.push("suggestions"), Promise.resolve(["perso", "voyage"])),
    change: (path, tags) => {
      calls.push(`change ${path} ${tags.join(",")}`);
      files[path] = [...tags];
      return Promise.resolve([...tags]);
    },
    error: (error) => errors.push(error),
    ...overrides,
  };
  const tags = createNoteTags(bar, deps);
  const chips = () => [...bar.querySelectorAll(".tag-chip")].map((c) => c.textContent);
  const input = () => bar.querySelector<HTMLInputElement>(".tag-input") as HTMLInputElement;
  return { bar, tags, calls, errors, files, chips, input };
}

describe("barre des étiquettes d'une colonne", () => {
  it("montre le champ d'étiquettes du contenu, avec les suggestions sans ses étiquettes", async () => {
    const { bar, tags, chips } = mount();
    await tags.show("a.md");
    expect(bar.hidden).toBe(false);
    expect(chips()).toEqual(["perso×"]);
    const options = [...bar.querySelectorAll("option")].map((o) => o.value);
    expect(options).toEqual(["voyage"]);
  });

  it("montre un champ vide pour un contenu sans étiquette", async () => {
    const { bar, tags, chips, input } = mount();
    await tags.show("b.md");
    expect(bar.hidden).toBe(false);
    expect(chips()).toEqual([]);
    expect(input()).not.toBeNull();
  });

  it("est cachée et vide sans contenu, et se montre de nouveau avec un contenu", async () => {
    const { bar, tags, chips } = mount();
    await tags.show("a.md");
    await tags.show(null);
    expect(bar.hidden).toBe(true);
    expect(bar.childElementCount).toBe(0);
    await tags.show("a.md");
    expect(bar.hidden).toBe(false);
    expect(chips()).toEqual(["perso×"]);
  });

  it("est cachée quand le fichier ne se lit pas", async () => {
    const { bar, tags } = mount({ read: () => Promise.reject(new Error("absent")) });
    await tags.show("a.md");
    expect(bar.hidden).toBe(true);
    expect(bar.childElementCount).toBe(0);
  });

  it("ignore une lecture arrivée après une plus récente", async () => {
    let release: (tags: string[]) => void = () => {};
    const slow = new Promise<string[]>((resolve) => (release = resolve));
    const { tags, chips, files } = mount({
      read: (path) => (path === "a.md" ? slow : Promise.resolve(files[path] ?? [])),
    });
    const first = tags.show("a.md");
    await tags.show("b.md");
    release(["tardive"]);
    await first;
    expect(chips()).toEqual([]);
  });

  it("n'écrit que par le geste : ajouter envoie la liste, puis montre ce que Rust a écrit", async () => {
    const { tags, calls, chips, input, bar } = mount();
    await tags.show("a.md");
    input().value = "voyage";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    await vi.waitFor(() => expect(chips()).toEqual(["perso×", "voyage×"]));
    expect(calls).toContain("change a.md perso,voyage");
    expect([...bar.querySelectorAll("option")].map((o) => o.value)).toEqual([]);
  });

  it("retire une étiquette par sa croix", async () => {
    const { tags, bar, chips } = mount();
    await tags.show("a.md");
    bar.querySelector<HTMLButtonElement>(".tag-remove")?.click();
    await vi.waitFor(() => expect(chips()).toEqual([]));
  });

  it("montre les étiquettes que Rust a écrites, qui peuvent différer de celles envoyées", async () => {
    const { tags, chips, input } = mount({
      change: (_path, sent) => Promise.resolve(sent.filter((t) => t !== "a,b")),
    });
    await tags.show("a.md");
    input().value = "a,b";
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    await vi.waitFor(() => expect(input().value).toBe(""));
    expect(chips()).toEqual(["perso×"]);
  });

  it("dit l'erreur d'un geste refusé, sans changer ce qui est montré", async () => {
    const failure = new Error("refusé");
    const { tags, errors, chips, bar } = mount({ change: () => Promise.reject(failure) });
    await tags.show("a.md");
    bar.querySelector<HTMLButtonElement>(".tag-remove")?.click();
    await vi.waitFor(() => expect(errors).toEqual([failure]));
    expect(chips()).toEqual(["perso×"]);
  });

  it("garde le curseur dans le champ après un ajout, pour taper l'étiquette suivante", async () => {
    const { tags, input, chips } = mount();
    await tags.show("b.md");
    input().focus();
    input().value = "un";
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    await vi.waitFor(() => expect(chips()).toEqual(["un×"]));
    expect(document.activeElement).toBe(input());
  });

  it("ne vole pas le curseur quand on n'était pas dans la barre", async () => {
    const { tags, bar } = mount();
    await tags.show("a.md");
    bar.querySelector<HTMLButtonElement>(".tag-remove")?.click();
    await vi.waitFor(() => expect(bar.querySelector(".tag-chip")).toBeNull());
    expect(bar.contains(document.activeElement)).toBe(false);
  });

  it("relit les étiquettes sans redessiner ni perdre la saisie quand elles n'ont pas changé", async () => {
    const { tags, input, calls } = mount();
    await tags.show("a.md");
    input().value = "vo";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    const before = input();
    await tags.refresh("a.md");
    expect(input()).toBe(before);
    expect(input().value).toBe("vo");
    expect(calls.filter((c) => c === "suggestions")).toHaveLength(1);
  });

  it("redessine quand une relecture trouve d'autres étiquettes, la saisie gardée", async () => {
    const { tags, input, chips, files } = mount();
    await tags.show("a.md");
    input().value = "vo";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    files["a.md"] = ["perso", "écrite à la main"];
    await tags.refresh("a.md");
    expect(chips()).toEqual(["perso×", "écrite à la main×"]);
    expect(input().value).toBe("vo");
  });

  it("cache la barre quand une relecture échoue", async () => {
    let fail = false;
    const { tags, bar } = mount({
      read: () => (fail ? Promise.reject(new Error("absent")) : Promise.resolve(["a"])),
    });
    await tags.show("a.md");
    fail = true;
    await tags.refresh("a.md");
    expect(bar.hidden).toBe(true);
  });

  it("relit tout, suggestions comprises, quand le contenu a changé", async () => {
    const { tags, calls, chips } = mount();
    await tags.show("a.md");
    await tags.refresh("b.md");
    expect(calls.filter((c) => c === "suggestions")).toHaveLength(2);
    expect(chips()).toEqual([]);
    await tags.refresh(null);
    expect(calls.filter((c) => c === "suggestions")).toHaveLength(2);
  });

  it("oublie la saisie d'un contenu en passant à un autre", async () => {
    const { tags, input } = mount();
    await tags.show("a.md");
    input().value = "vo";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    await tags.show("b.md");
    expect(input().value).toBe("");
  });

  it("ne montre plus rien après sa destruction, même pour une lecture en cours", async () => {
    const { tags, bar } = mount();
    const showing = tags.show("a.md");
    tags.destroy();
    await showing;
    expect(bar.childElementCount).toBe(0);
  });
});
