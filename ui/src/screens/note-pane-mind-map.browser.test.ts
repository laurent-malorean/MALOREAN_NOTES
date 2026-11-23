import { describe, expect, it, vi } from "vitest";
import { fakeBackend } from "../../test-support/pane-fixture";
import type { MindMapItem } from "../bridge";
import { createPane } from "./note-pane";
import { createSharedNotes } from "./shared-notes";

const MAP_NOTE = "---\ntype: carte-mentale\n---\n# Projet\n\n- Clients\n- Calendrier\n";
const MAP: MindMapItem = {
  roots: [
    { title: "Clients", color: null, detail: [], children: [] },
    { title: "Calendrier", color: null, detail: [], children: [] },
  ],
  places: [
    { x: 0, y: 0 },
    { x: 0, y: 160 },
  ],
};

function mount(withMaps = true, failing = false) {
  const element = document.createElement("section");
  element.style.cssText = "width:800px;height:500px;display:flex;flex-direction:column";
  const backlinks = document.createElement("nav");
  const related = document.createElement("nav");
  element.append(backlinks, related);
  document.body.replaceChildren(element);
  const fake = fakeBackend({ "projet.md": MAP_NOTE, "autre.md": "# Autre\n\ntexte" });
  const saved: MindMapItem[] = [];
  const read: string[] = [];
  const ignore = () => {};
  const errors: unknown[] = [];
  const opened: [string, boolean][] = [];
  const backend = withMaps
    ? {
        ...fake.backend,
        readMindMap: async (path: string) => {
          read.push(path);
          if (failing) throw new Error("carte illisible");
          return structuredClone(MAP);
        },
        saveMindMap: async (_path: string, map: MindMapItem) => void saved.push(map),
      }
    : fake.backend;
  const shared = createSharedNotes({
    backend: fake.backend,
    events: { saved: ignore, titled: ignore, deleted: ignore, error: ignore },
  });
  const pane = createPane(
    { element, backlinks, related },
    {
      backend,
      shared,
      events: {
        openNote: ignore,
        openLink: (title, inNewTab) => opened.push([title, inNewTab]),
        error: (e) => errors.push(e),
      },
      resolveImage: (src) => src,
    },
  );
  return { pane, element, saved, read, errors, opened, fake };
}

const mapShown = (element: HTMLElement) => element.classList.contains("mind-map-shown");

describe("colonne : une carte mentale", () => {
  it("montre la carte à la place de l'éditeur, puis l'éditeur pour une note ordinaire", async () => {
    const m = mount();
    await m.pane.load("projet.md");
    expect(mapShown(m.element)).toBe(true);
    await vi.waitFor(() =>
      expect(m.element.querySelectorAll(".mind-map-node[data-path]")).toHaveLength(2),
    );
    expect(m.read).toEqual(["projet.md"]);
    await m.pane.load("autre.md");
    expect(mapShown(m.element)).toBe(false);
    expect(m.element.querySelector(".mind-map")).toBeNull();
    await m.pane.load(null);
    expect(mapShown(m.element)).toBe(false);
  });

  it("enregistre la carte par Rust, sans toucher au texte de la note", async () => {
    const m = mount();
    await m.pane.load("projet.md");
    await vi.waitFor(() =>
      expect(m.element.querySelectorAll(".mind-map-node[data-path]")).toHaveLength(2),
    );
    const node = m.element.querySelector(".mind-map-node[data-path='1']") as HTMLElement;
    node.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    (document.querySelectorAll(".context-menu button")[0] as HTMLElement).click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.saved[0]?.roots[1]?.color).toBe("rouge");
    expect(m.fake.calls.some((c) => c.startsWith("enregistrer"))).toBe(false);
  });

  it("suit un changement venu du disque", async () => {
    const m = mount();
    await m.pane.load("projet.md");
    await vi.waitFor(() => expect(m.read).toHaveLength(1));
    await m.pane.followDisk();
    expect(m.read).toEqual(["projet.md", "projet.md"]);
  });

  it("révéler un nœud choisit ce nœud de la carte", async () => {
    const m = mount();
    await m.pane.load("projet.md");
    await vi.waitFor(() =>
      expect(m.element.querySelectorAll(".mind-map-node[data-path]")).toHaveLength(2),
    );
    m.pane.revealNode("1");
    await vi.waitFor(() =>
      expect(m.element.querySelector(".mind-map-node.selected")?.getAttribute("data-path")).toBe(
        "1",
      ),
    );
  });

  it("détruire la colonne retire la carte", async () => {
    const m = mount();
    await m.pane.load("projet.md");
    await vi.waitFor(() =>
      expect(m.element.querySelectorAll(".mind-map-node[data-path]")).toHaveLength(2),
    );
    m.pane.destroy();
    expect(m.element.querySelector(".mind-map")).toBeNull();
  });

  it("sans carte mentale branchée, la note reste du texte", async () => {
    const m = mount(false);
    await m.pane.load("projet.md");
    expect(mapShown(m.element)).toBe(false);
  });

  it("une erreur de lecture de la carte est annoncée", async () => {
    const m = mount(true, true);
    await m.pane.load("projet.md");
    expect(m.errors).toHaveLength(1);
  });
});
