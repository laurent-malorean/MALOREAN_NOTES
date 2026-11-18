import { describe, expect, it } from "vitest";
import { fakeColumns, fakePane, settle } from "../../test-support/app-fixture";
import { columnsStarted, noteOpened } from "../state/columns";
import { copyMarkdown, copyText, type CopiedText } from "./note-copy";

const NOTE = "---\ntags: [voyage]\n---\n# Voyage\n\n*loin*\n";

function setup({ selection = "" } = {}) {
  const log: string[] = [];
  const shown: string[] = [];
  const columns = fakeColumns(noteOpened(columnsStarted, "Travail/voyage.md"));
  const pane = fakePane("Travail/voyage.md");
  Object.assign(pane.editor, { selectedText: () => selection });
  columns.panes.set(columns.columns().active, pane);
  const deps = {
    backend: {
      readNote: async (path: string) => {
        log.push(`lire ${path}`);
        return { path, content: NOTE, title: "Voyage", fingerprint: "f" };
      },
      copyPlainText: async (text: string) => {
        log.push(`copier ${text}`);
        return null;
      },
    },
    columns: columns.open,
    show: (message: string) => shown.push(message),
    run: (action: Promise<unknown>) =>
      void action.catch((error: unknown) => log.push(`erreur ${String(error)}`)),
  };
  return { deps, log, shown, columns };
}

describe("ce que copie une copie de note", () => {
  it("depuis un menu, la note cliquée, enregistrée puis relue, entière", async () => {
    const t = setup({ selection: "ignorée" });
    const copied: CopiedText[] = [];
    copyText(t.deps, "Travail/autre.md", async (text) => void copied.push(text));
    await expect.poll(() => copied).toHaveLength(1);
    expect(t.columns.log).toContain("enregistrer Travail/autre.md");
    expect(copied).toEqual([{ path: "Travail/autre.md", markdown: NOTE, selection: false }]);
  });

  it("sans chemin, la sélection de la colonne active, sans relire la note", async () => {
    const t = setup({ selection: "*loin*" });
    const copied: CopiedText[] = [];
    copyText(t.deps, undefined, async (text) => void copied.push(text));
    await expect.poll(() => copied).toHaveLength(1);
    expect(t.log).toEqual([]);
    expect(copied).toEqual([{ path: "Travail/voyage.md", markdown: "*loin*", selection: true }]);
  });

  it("sans chemin ni sélection, la note entière de la colonne active", async () => {
    const t = setup();
    const copied: CopiedText[] = [];
    copyText(t.deps, undefined, async (text) => void copied.push(text));
    await expect.poll(() => copied).toHaveLength(1);
    expect(copied).toEqual([{ path: "Travail/voyage.md", markdown: NOTE, selection: false }]);
  });

  it("sans note dans la colonne active, rien", async () => {
    const t = setup();
    t.columns.open.current = () => columnsStarted;
    const copied: CopiedText[] = [];
    copyText(t.deps, undefined, async (text) => void copied.push(text));
    await settle();
    expect(copied).toEqual([]);
  });
});

describe("copier en Markdown", () => {
  it("pose le texte de la note tel quel, en-tête compris, et le dit", async () => {
    const t = setup();
    copyMarkdown(t.deps, "Travail/voyage.md");
    await expect.poll(() => t.shown).toEqual(["Markdown copié"]);
    expect(t.log).toEqual(["lire Travail/voyage.md", `copier ${NOTE}`]);
  });

  it("depuis la palette, la sélection telle quelle", async () => {
    const t = setup({ selection: "**gras** et [[Autre]]" });
    copyMarkdown(t.deps);
    await expect.poll(() => t.shown).toEqual(["Sélection copiée"]);
    expect(t.log).toEqual(["copier **gras** et [[Autre]]"]);
  });

  it("un presse-papiers qui refuse est signalé, sans message de copie", async () => {
    const t = setup();
    t.deps.backend.copyPlainText = async () => {
      throw new Error("refusé");
    };
    copyMarkdown(t.deps);
    await expect.poll(() => t.log.at(-1)).toBe("erreur Error: refusé");
    expect(t.shown).toEqual([]);
  });
});
