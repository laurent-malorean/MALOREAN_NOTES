import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { fakeBackend } from "../../test-support/pane-fixture";
import type { EntryItem } from "../bridge";
import { createPane, type NotebookActions } from "./note-pane";
import { createSharedNotes } from "./shared-notes";

const LINK = "[l'entrée du 16 novembre 2026 à 09:00](#2026-11-16-09h00)";
const NOTEBOOK = `---\ntype: cahier-de-recherche\n---\n# Levures\n\n- 09:00 - un\n- 10:00 - Correction de ${LINK} : deux\n`;
const FIRST: EntryItem = { anchor: "2026-11-16-09h00", label: "", text: "un", line: 5, number: 1 };
const SECOND: EntryItem = {
  anchor: "2026-11-16-10h00",
  label: "",
  text: "deux",
  line: 6,
  number: 2,
};
const OTHER = "# Autre\n\n\n\n\n\n\nfin";

function mount(notebook?: NotebookActions) {
  const element = document.createElement("section");
  const backlinks = document.createElement("nav");
  const related = document.createElement("nav");
  element.append(backlinks, related);
  document.body.replaceChildren(element);
  const fake = fakeBackend({ "levures.md": NOTEBOOK, "autre.md": OTHER });
  const ignore = () => {};
  const errors: unknown[] = [];
  const shared = createSharedNotes({
    backend: fake.backend,
    events: { saved: ignore, titled: ignore, deleted: ignore, error: ignore },
  });
  const pane = createPane(
    { element, backlinks, related },
    {
      backend: fake.backend,
      shared,
      events: { openNote: ignore, openLink: ignore, error: (e) => errors.push(e) },
      resolveImage: (src) => src,
      notebook,
    },
  );
  const view = () => EditorView.findFromDOM(element.querySelector(".cm-editor") as HTMLElement);
  /** Le curseur dans la cible du lien vers l'entrée corrigée, puis « Ouvrir le lien ». */
  const followLink = () => {
    view()?.dispatch({ selection: { anchor: NOTEBOOK.indexOf("#2026") + 3 } });
    pane.editor.openLinkAtCursor();
  };
  return { pane, fake, errors, view, followLink, element };
}

describe("colonne : un cahier de recherche", () => {
  it("un lien vers une entrée du cahier la montre", async () => {
    const asked: string[] = [];
    const m = mount({
      add: async () => true,
      copyReference: async () => {},
      entries: async (path) => (asked.push(path), [SECOND, FIRST]),
    });
    await m.pane.load("levures.md");
    m.followLink();
    await expect.poll(() => m.view()?.state.selection.main.head).toBe(NOTEBOOK.indexOf("- 09:00"));
    expect(asked).toEqual(["levures.md"]);
    expect(m.fake.calls.filter((call) => call.startsWith("ouvrir"))).toEqual([]);
  });

  it("dit qu'une entrée visée n'est pas dans le cahier", async () => {
    const m = mount({
      add: async () => true,
      copyReference: async () => {},
      entries: async () => [],
    });
    await m.pane.load("levures.md");
    m.followLink();
    await expect
      .poll(() => m.errors)
      .toEqual([{ message: "Aucune entrée « 2026-11-16-09h00 » dans ce cahier." }]);
  });

  it("ne bouge pas si une autre note est montrée entre-temps", async () => {
    let answer: (entries: EntryItem[]) => void = () => {};
    const m = mount({
      add: async () => true,
      copyReference: async () => {},
      entries: () => new Promise((resolve) => (answer = resolve)),
    });
    await m.pane.load("levures.md");
    m.followLink();
    await m.pane.load("autre.md");
    answer([FIRST]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(m.view()?.state.selection.main.head).toBe(0);
  });

  it("sa zone de saisie ajoute l'entrée au cahier montré", async () => {
    const added: string[] = [];
    const m = mount({
      add: async (path, text) => (added.push(`${path} : ${text}`), true),
      copyReference: async () => {},
      entries: async () => [],
    });
    await m.pane.load("levures.md");
    const text = m.element.querySelector("textarea") as HTMLTextAreaElement;
    text.value = "trois";
    m.element.querySelector<HTMLButtonElement>(".notebook-entry button")?.click();
    expect(added).toEqual(["levures.md : trois"]);
    await expect.poll(() => text.value).toBe("");
  });

  it("le numéro d'une entrée copie la référence : le titre du cahier et son numéro", async () => {
    const copied: string[] = [];
    const m = mount({
      add: async () => true,
      entries: async () => [],
      copyReference: async (reference) => void copied.push(reference),
    });
    await m.pane.load("levures.md");
    const numbers = [...m.element.querySelectorAll<HTMLButtonElement>(".entry-number")];
    expect(numbers.map((n) => n.textContent)).toEqual(["0001", "0002"]);
    numbers[1]?.click();
    numbers[0]?.click();
    expect(copied).toEqual(["Levures · 0002", "Levures · 0001"]);
  });

  it("sans action sur les cahiers, le lien est confié à Rust comme les autres", async () => {
    const m = mount();
    await m.pane.load("levures.md");
    m.followLink();
    expect(m.element.querySelector(".notebook-entry")).toBeNull();
    expect(m.element.querySelector(".entry-number")).toBeNull();
    expect(m.fake.calls).toContain("ouvrir levures.md #2026-11-16-09h00");
  });
});
