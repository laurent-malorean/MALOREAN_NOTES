import { describe, expect, it, vi } from "vitest";
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
    const addresses: string[] = [];
    const make = paneMaker({
      backend: {
        ...fake.backend,
        fileAddress: (path) => (addresses.push(path), `asset://${path}`),
      },
      shared,
      events: { openNote: vi.fn(), openLink: vi.fn(), error: vi.fn() },
      libraryPath: () => "/lib",
      configure,
    });
    const element = document.createElement("section");
    const backlinks = document.createElement("nav");
    element.append(backlinks);
    document.body.replaceChildren(element);
    const pane = make({ element, backlinks });
    expect(configure).toHaveBeenCalledWith(pane.editor);
    await pane.load("voyages/rome.md");
    await expect.poll(() => addresses).toContain("/lib/voyages/vue.png");
    pane.destroy();
  });
});
