import { describe, expect, it, vi } from "vitest";
import { fakeBackend, mountColumns } from "../../test-support/pane-fixture";
import { createPane } from "./note-pane";
import { createSharedNotes } from "./shared-notes";

const chips = (parts: HTMLElement) =>
  [...parts.querySelectorAll(".tag-chip")].map((chip) => chip.textContent);

/** Le champ d'étiquettes de la colonne : tape `text` et valide par Entrée. */
function add(parts: HTMLElement, text: string) {
  const input = parts.querySelector<HTMLInputElement>(".tag-input") as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
}

describe("colonne : le champ d'étiquettes", () => {
  it("montre les étiquettes du contenu sous les onglets, et se cache sans contenu", async () => {
    const m = mountColumns({ "a.md": "# A", "b.md": "# B" });
    m.tags["a.md"] = ["perso", "voyage"];
    const bar = m.parts.tags as HTMLElement;
    await m.pane.load("a.md");
    await vi.waitFor(() => expect(chips(bar)).toEqual(["perso×", "voyage×"]));
    expect(bar.hidden).toBe(false);
    await m.pane.load(null);
    await vi.waitFor(() => expect(bar.hidden).toBe(true));
  });

  it("montre un champ vide pour un contenu sans étiquette, et celles de l'autre contenu quand on en change", async () => {
    const m = mountColumns({ "a.md": "# A", "b.md": "# B" });
    m.tags["b.md"] = ["autre"];
    const bar = m.parts.tags as HTMLElement;
    await m.pane.load("a.md");
    await vi.waitFor(() => expect(bar.hidden).toBe(false));
    expect(chips(bar)).toEqual([]);
    await m.pane.load("b.md");
    await vi.waitFor(() => expect(chips(bar)).toEqual(["autre×"]));
  });

  it("ajoute une étiquette : ce qui est tapé est enregistré d'abord, puis Rust écrit et le texte est relu", async () => {
    const m = mountColumns({ "a.md": "# A" });
    const bar = m.parts.tags as HTMLElement;
    await m.pane.load("a.md");
    await vi.waitFor(() => expect(bar.hidden).toBe(false));
    m.type(" texte");
    add(bar, "voyage");
    await vi.waitFor(() => expect(chips(bar)).toEqual(["voyage×"]));
    // Lecture au départ, enregistrement de ce qui est tapé, puis relecture après l'écriture de Rust.
    const order = m.calls.filter((call) => call.startsWith("enregistrer") || call === "lire a.md");
    expect(order).toEqual(["lire a.md", "enregistrer a.md # A", "lire a.md"]);
    expect(m.tagCalls).toContain("changer a.md voyage");
    expect(m.tagsChanged.count).toBe(1);
  });

  it("retire une étiquette par sa croix et prévient l'application", async () => {
    const m = mountColumns({ "a.md": "# A" });
    m.tags["a.md"] = ["perso", "voyage"];
    const bar = m.parts.tags as HTMLElement;
    await m.pane.load("a.md");
    await vi.waitFor(() => expect(chips(bar)).toHaveLength(2));
    bar.querySelector<HTMLButtonElement>('[aria-label="Retirer l\'étiquette perso"]')?.click();
    await vi.waitFor(() => expect(chips(bar)).toEqual(["voyage×"]));
    expect(m.tagCalls).toContain("changer a.md voyage");
    expect(m.tagsChanged.count).toBe(1);
  });

  it("suit le nouveau nom de la note quand l'enregistrement qui précède le geste la renomme", async () => {
    const m = mountColumns({ "a.md": "# A" });
    const bar = m.parts.tags as HTMLElement;
    await m.pane.load("a.md");
    await vi.waitFor(() => expect(bar.hidden).toBe(false));
    // Le faux pont renomme en « nouveau.md » une note qui commence par « # Nouveau ».
    m.view()?.dispatch({ changes: { from: 0, to: m.text()?.length, insert: "# Nouveau titre" } });
    add(bar, "voyage");
    await vi.waitFor(() => expect(m.tagCalls).toContain("changer nouveau.md voyage"));
  });

  it("relit les étiquettes de la note quand elle est enregistrée", async () => {
    const m = mountColumns({ "a.md": "# A" });
    const bar = m.parts.tags as HTMLElement;
    await m.pane.load("a.md");
    await vi.waitFor(() => expect(bar.hidden).toBe(false));
    m.tags["a.md"] = ["écrite à la main"];
    m.type(" x");
    await m.pane.flush();
    await vi.waitFor(() => expect(chips(bar)).toEqual(["écrite à la main×"]));
  });

  it("relit les étiquettes de la note quand elle change sur le disque", async () => {
    const m = mountColumns({ "a.md": "# A" });
    const bar = m.parts.tags as HTMLElement;
    await m.pane.load("a.md");
    await vi.waitFor(() => expect(bar.hidden).toBe(false));
    m.tags["a.md"] = ["ailleurs"];
    await m.pane.followDisk();
    expect(chips(bar)).toEqual(["ailleurs×"]);
  });

  it("dit l'erreur d'un geste que Rust refuse, sans changer ce qui est montré", async () => {
    const failure = new Error("disque plein");
    const fake = fakeBackend({ "a.md": "# A" });
    const bar = document.createElement("div");
    const element = document.createElement("section");
    document.body.replaceChildren(element);
    const errors: unknown[] = [];
    const ignore = () => {};
    const pane = createPane(
      { element, tags: bar, backlinks: document.createElement("nav"), related: element },
      {
        backend: fake.backend,
        shared: createSharedNotes({
          backend: fake.backend,
          events: { saved: ignore, titled: ignore, deleted: ignore, error: ignore },
        }),
        events: { openNote: ignore, openLink: ignore, error: (e) => errors.push(e) },
        resolveImage: (src) => src,
        tags: {
          read: () => Promise.resolve(["perso"]),
          change: () => Promise.reject(failure),
          suggestions: () => Promise.resolve([]),
          changed: ignore,
        },
      },
    );
    await pane.load("a.md");
    await vi.waitFor(() => expect(chips(bar)).toEqual(["perso×"]));
    add(bar, "voyage");
    await vi.waitFor(() => expect(errors).toEqual([failure]));
    expect(chips(bar)).toEqual(["perso×"]);
  });

  it("ne montre aucune barre quand l'application ne lui donne pas de quoi lire les étiquettes", async () => {
    const fake = fakeBackend({ "a.md": "# A" });
    const bar = document.createElement("div");
    bar.hidden = true;
    const element = document.createElement("section");
    document.body.replaceChildren(element);
    const ignore = () => {};
    const pane = createPane(
      { element, tags: bar, backlinks: document.createElement("nav"), related: element },
      {
        backend: fake.backend,
        shared: createSharedNotes({
          backend: fake.backend,
          events: { saved: ignore, titled: ignore, deleted: ignore, error: ignore },
        }),
        events: { openNote: ignore, openLink: ignore, error: ignore },
        resolveImage: (src) => src,
      },
    );
    await pane.load("a.md");
    await pane.followDisk();
    expect(bar.hidden).toBe(true);
    pane.destroy();
  });

  it("retire sa barre quand la colonne disparaît", async () => {
    const m = mountColumns({ "a.md": "# A" });
    m.tags["a.md"] = ["perso"];
    const bar = m.parts.tags as HTMLElement;
    await m.pane.load("a.md");
    await vi.waitFor(() => expect(chips(bar)).toEqual(["perso×"]));
    m.pane.destroy();
    expect(bar.childElementCount).toBe(0);
  });
});
