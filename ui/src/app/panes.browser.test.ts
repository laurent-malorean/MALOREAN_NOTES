import { moreBackend } from "../../test-support/crm-lists-fixture";
import { describe, expect, it, vi } from "vitest";
import { crm } from "../../test-support/crm-fixture";
import { fakeBackend } from "../../test-support/pane-fixture";
import { createSharedNotes } from "../screens/shared-notes";
import { paneMaker } from "./panes";

describe("éditeur d'une colonne", () => {
  it("se règle comme les autres, et cherche les images dans le dossier de sa note", async () => {
    const fake = fakeBackend({ "voyages/rome.md": "# Rome\n\nTexte\n\n![vue](vue.png)\n" });
    const shared = createSharedNotes({
      backend: fake.backend,
      events: { saved: vi.fn(), titled: vi.fn(), deleted: vi.fn(), error: vi.fn() },
    });
    const configure = vi.fn();
    const notebook = { add: vi.fn(async () => true), entries: vi.fn() };
    const addresses: string[] = [];
    const make = paneMaker({
      backend: {
        ...fake.backend,
        fileAddress: (path) => (addresses.push(path), `asset://${path}`),
      },
      shared,
      events: { openNote: vi.fn(), openLink: vi.fn(), error: vi.fn() },
      notebook,
      workspacePath: () => "/lib",
      configure,
    });
    const element = document.createElement("section");
    const backlinks = document.createElement("nav");
    const related = document.createElement("nav");
    element.append(backlinks, related);
    document.body.replaceChildren(element);
    const pane = make({ element, backlinks, related });
    expect(configure).toHaveBeenCalledWith(pane.editor);
    await pane.load("voyages/rome.md");
    await expect.poll(() => addresses).toContain("/lib/voyages/vue.png");
    pane.destroy();
  });

  it("reçoit ce qu'une colonne fait d'un cahier de recherche : sa zone de saisie vise le cahier montré", async () => {
    const notebookText = "---\ntype: cahier-de-recherche\n---\n# Levures\n";
    const fake = fakeBackend({ "levures.md": notebookText });
    const shared = createSharedNotes({
      backend: fake.backend,
      events: { saved: vi.fn(), titled: vi.fn(), deleted: vi.fn(), error: vi.fn() },
    });
    const notebook = { add: vi.fn(async () => true), entries: vi.fn() };
    const make = paneMaker({
      backend: { ...fake.backend, fileAddress: (path) => path },
      shared,
      events: { openNote: vi.fn(), openLink: vi.fn(), error: vi.fn() },
      notebook,
      workspacePath: () => "/lib",
      configure: vi.fn(),
    });
    const element = document.createElement("section");
    const backlinks = document.createElement("nav");
    const related = document.createElement("nav");
    element.append(backlinks, related);
    document.body.replaceChildren(element);
    const pane = make({ element, backlinks, related });
    await pane.load("levures.md");
    (element.querySelector("textarea") as HTMLTextAreaElement).value = "un";
    element.querySelector<HTMLButtonElement>(".notebook-entry button")?.click();
    expect(notebook.add).toHaveBeenCalledWith("levures.md", "un");
    pane.destroy();
  });
});

describe("canvas d'une colonne", () => {
  it("avec les fenêtres de l'écran et le pont du canvas, la colonne sait montrer un canvas", async () => {
    const fake = fakeBackend({ "plan.canvas": "{}" });
    const shared = createSharedNotes({
      backend: fake.backend,
      events: { saved: vi.fn(), titled: vi.fn(), deleted: vi.fn(), error: vi.fn() },
    });
    const read = vi.fn(async () => ({ canvas: { cards: [], arrows: [], extra: [] }, text: "{}" }));
    const make = paneMaker({
      backend: {
        ...fake.backend,
        fileAddress: (path: string) => path,
        readCanvas: read,
        saveCanvas: vi.fn(),
        openWebAddress: vi.fn(),
        listAllNotes: async () => [],
        chooseExportFile: vi.fn(),
        exportImage: vi.fn(),
      } as never,
      shared,
      events: { openNote: vi.fn(), openLink: vi.fn(), error: vi.fn() },
      notebook: { add: vi.fn(async () => true), entries: vi.fn() },
      layout: {
        picker: document.createElement("dialog"),
        confirmation: document.createElement("dialog"),
      },
      workspacePath: () => "/lib",
      configure: vi.fn(),
    });
    const element = document.createElement("section");
    const backlinks = document.createElement("nav");
    const related = document.createElement("nav");
    element.append(backlinks, related);
    document.body.replaceChildren(element);
    const pane = make({ element, backlinks, related });
    await pane.load("plan.canvas");
    await expect.poll(() => read.mock.calls.length).toBe(1);
    expect(pane.canvasPane()?.shown()).toBe(true);
    pane.destroy();
  });
});

describe("CRM d'une colonne", () => {
  it("avec les fenêtres de l'écran et le pont du CRM, la colonne sait montrer un CRM", async () => {
    const fake = fakeBackend({ "clients.md": "---\ntype: crm\n---\n# Clients\n" });
    const shared = createSharedNotes({
      backend: fake.backend,
      events: { saved: vi.fn(), titled: vi.fn(), deleted: vi.fn(), error: vi.fn() },
    });
    const read = vi.fn(async () => crm());
    const make = paneMaker({
      backend: {
        ...fake.backend,
        fileAddress: (path: string) => path,
        readCrm: read,
        createCrmAction: vi.fn(),
        moveCrmAction: vi.fn(),
        changeCrmAction: vi.fn(),
        deleteCrmAction: vi.fn(),
        changeCrmStages: vi.fn(),
        ...moreBackend(async () => {}),
        copyPlainText: vi.fn(),
        openWebAddress: vi.fn(),
        listLinkable: vi.fn(async () => []),
      } as never,
      shared,
      events: { openNote: vi.fn(), openLink: vi.fn(), error: vi.fn() },
      notebook: { add: vi.fn(async () => true), entries: vi.fn() },
      layout: {
        picker: document.createElement("dialog"),
        confirmation: document.createElement("dialog"),
      },
      workspacePath: () => "/lib",
      configure: vi.fn(),
    });
    const element = document.createElement("section");
    const backlinks = document.createElement("nav");
    const related = document.createElement("nav");
    element.append(backlinks, related);
    document.body.replaceChildren(element);
    const pane = make({ element, backlinks, related });
    await pane.load("clients.md");
    await expect.poll(() => read.mock.calls.length).toBe(1);
    expect(element.classList.contains("crm-shown")).toBe(true);
    pane.destroy();
  });
});

describe("menu des liens d'une colonne", () => {
  it("avec un pont qui sait lister ce qu'on peut lier, `[[` ouvre le menu des liens dans l'éditeur", async () => {
    const fake = fakeBackend({ "a.md": "# A\n" });
    const shared = createSharedNotes({
      backend: fake.backend,
      events: { saved: vi.fn(), titled: vi.fn(), deleted: vi.fn(), error: vi.fn() },
    });
    const listLinkable = vi.fn(async () => [
      { path: "c.md", title: "Courses", folder: "", contentType: "note" as const, link: "Courses" },
    ]);
    const make = paneMaker({
      backend: { ...fake.backend, fileAddress: (path) => path, listLinkable },
      shared,
      events: { openNote: vi.fn(), openLink: vi.fn(), error: vi.fn() },
      notebook: { add: vi.fn(async () => true), entries: vi.fn() },
      workspacePath: () => "/lib",
      configure: vi.fn(),
    });
    const element = document.createElement("section");
    const backlinks = document.createElement("nav");
    const related = document.createElement("nav");
    element.append(backlinks, related);
    document.body.replaceChildren(element);
    const pane = make({ element, backlinks, related });
    await pane.load("a.md");
    pane.editor.focus();
    pane.editor.replaceRange(pane.editor.content().length, pane.editor.content().length, "[[");
    await vi.waitFor(() => expect(document.querySelector(".link-menu-option")).not.toBeNull());
    expect(document.querySelector(".link-menu-label svg")).not.toBeNull();
    expect(listLinkable).toHaveBeenCalledTimes(1);
    pane.destroy();
    document.querySelector(".link-menu")?.remove();
  });
});
