import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeColumns, settle } from "../../test-support/app-fixture";
import type { ExportFile } from "../bridge";
import { createLayout } from "../screens/layout";
import { columnsStarted, noteOpened } from "../state/columns";
import { createExport } from "./export";

const root = document.createElement("div");
const layout = createLayout(root);
/** Une image de 1 × 1 point, lisible par le navigateur. */
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function setup({
  stored = {} as Record<string, string>,
  chosen = { path: "/Docs/Voyage.pdf", folder: "/Docs" } as ExportFile | null,
  content = "# Voyage\n*loin*",
} = {}) {
  const items = new Map(Object.entries(stored));
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
  const log: string[] = [];
  const shown: string[] = [];
  const columns = fakeColumns(noteOpened(columnsStarted, "Travail/voyage.md"));
  const exporting = createExport({
    backend: {
      readNote: async (path) => {
        log.push(`lire ${path}`);
        return { path, content, title: "Voyage", fingerprint: "f" };
      },
      chooseExportFile: async (title, format, folder) => {
        log.push(`choisir ${title} ${format} ${folder}`);
        return chosen;
      },
      exportMarkdown: async (path, destination) => {
        log.push(`markdown ${path} ${destination}`);
        return null;
      },
      exportPdf: async (destination) => {
        log.push(`pdf ${destination} ${layout.printSheet.innerHTML}`);
        return null;
      },
      printPage: async () => {
        log.push(`imprimer ${layout.printSheet.innerHTML}`);
        return null;
      },
      copyRichText: async (_html, text) => {
        log.push(`copier ${text}`);
        return null;
      },
      copyPlainText: async (text) => {
        log.push(`copier en Markdown ${text}`);
        return null;
      },
      fileAddress: (path) => (path.endsWith("vide.gif") ? PIXEL : `asset://${path}`),
    },
    columns: columns.open,
    workspacePath: () => "/Notes",
    picker: layout.picker,
    sheet: layout.printSheet,
    storage,
    show: (message) => shown.push(message),
    run: (action) => void action.catch((error: unknown) => log.push(`erreur ${String(error)}`)),
  });
  return { exporting, items, log, columns, shown };
}

const options = () =>
  [...layout.picker.querySelectorAll(".picker-option")].map((o) => o.textContent);

function choose(label: string) {
  const input = layout.picker.querySelector("input") as HTMLInputElement;
  input.value = label;
  input.dispatchEvent(new Event("input"));
  layout.picker.querySelector<HTMLElement>(".picker-option")?.click();
}

beforeEach(() => {
  document.body.replaceChildren(root);
  layout.printSheet.replaceChildren();
  if (layout.picker.open) layout.picker.close();
});

describe("export d'une note", () => {
  it("propose le PDF ou le Markdown", () => {
    setup().exporting.exportNote();
    expect(layout.picker.open).toBe(true);
    expect(layout.picker.getAttribute("aria-label")).toBe("Exporter");
    expect((layout.picker.querySelector("input") as HTMLInputElement).placeholder).toBe("Format");
    expect(options()).toEqual(["PDF", "Markdown"]);
    choose("rien");
    expect(layout.picker.textContent).toContain("Aucun format ne correspond");
  });

  it("sans note dans la colonne active, rien ne s'ouvre", () => {
    const t = setup();
    t.columns.open.current = () => columnsStarted;
    t.exporting.exportNote();
    expect(layout.picker.open).toBe(false);
  });

  it("en Markdown, Rust écrit la note enregistrée au fichier choisi", async () => {
    const t = setup({ chosen: { path: "/Docs/Voyage.md", folder: "/Docs" } });
    t.exporting.exportNote();
    choose("mark");
    await settle();
    expect(t.log).toEqual([
      "lire Travail/voyage.md",
      "choisir Voyage markdown null",
      "markdown Travail/voyage.md /Docs/Voyage.md",
    ]);
    expect(t.columns.log).toContain("enregistrer Travail/voyage.md");
    expect(t.items.get("malorean.export-folder")).toBe("/Docs");
    expect(t.shown).toEqual(["« Voyage » exportée dans /Docs/Voyage.md"]);
  });

  it("en PDF, le rendu de la note est sur la feuille d'impression quand WebKit l'imprime", async () => {
    const t = setup({ content: "# Voyage\n![](voyage.assets/vue.png) ![](vide.gif)" });
    t.exporting.exportNote();
    choose("pdf");
    // Le chargement des images (l'une en échec) prend un temps variable.
    await expect
      .poll(() => t.log.at(-1))
      .toBe(
        "pdf /Docs/Voyage.pdf <h1>Voyage</h1><p>" +
          '<img src="asset:///Notes/Travail/voyage.assets/vue.png" alt=""> ' +
          `<img src="${PIXEL}" alt=""></p>`,
      );
  });

  it("en PDF, WebKit attend que les images de la feuille soient chargées, ou en échec", async () => {
    let loaded = (): void => undefined;
    const decode = vi
      .spyOn(HTMLImageElement.prototype, "decode")
      .mockImplementationOnce(() => new Promise<void>((resolve) => (loaded = resolve)))
      .mockImplementationOnce(() => Promise.reject(new Error("illisible")));
    const t = setup({ content: "![](a.png) ![](b.png)" });
    t.exporting.exportNote();
    choose("pdf");
    await settle();
    await settle();
    expect(t.log.some((line) => line.startsWith("pdf"))).toBe(false);
    loaded();
    await expect.poll(() => t.log.at(-1)?.startsWith("pdf /Docs/Voyage.pdf <p><img")).toBe(true);
    decode.mockRestore();
  });

  it("la fenêtre d'enregistrement s'ouvre dans le dossier du dernier export", async () => {
    const t = setup({ stored: { "malorean.export-folder": "/Bureau" } });
    t.exporting.exportNote("autre.md");
    choose("pdf");
    await settle();
    expect(t.log.slice(0, 2)).toEqual(["lire autre.md", "choisir Voyage pdf /Bureau"]);
  });

  it("annuler la fenêtre d'enregistrement n'exporte rien", async () => {
    const t = setup({ chosen: null });
    t.exporting.exportNote();
    choose("pdf");
    await settle();
    expect(t.log).toEqual(["lire Travail/voyage.md", "choisir Voyage pdf null"]);
    expect(t.items.size).toBe(0);
    expect(t.shown).toEqual([]);
  });
});

describe("impression d'une note", () => {
  it("ouvre la fenêtre d'impression sur le rendu de la note enregistrée, posé sur la feuille", async () => {
    const t = setup({ content: "# Voyage\n*loin*" });
    t.exporting.printNote("autre.md");
    await expect
      .poll(() => t.log)
      .toEqual(["lire autre.md", "imprimer <h1>Voyage</h1><p><em>loin</em></p>"]);
    expect(t.columns.log).toContain("enregistrer autre.md");
    expect(layout.picker.open).toBe(false);
    expect(t.shown).toEqual([]);
  });

  it("sans chemin, imprime la note de la colonne active, une fois ses images chargées", async () => {
    let loaded = (): void => undefined;
    const decode = vi
      .spyOn(HTMLImageElement.prototype, "decode")
      .mockImplementationOnce(() => new Promise<void>((resolve) => (loaded = resolve)));
    const t = setup({ content: "![](a.png)" });
    t.exporting.printNote();
    await settle();
    await settle();
    expect(t.log).toEqual(["lire Travail/voyage.md"]);
    loaded();
    await expect.poll(() => t.log.at(-1)?.startsWith("imprimer <p><img")).toBe(true);
    decode.mockRestore();
  });

  it("sans note dans la colonne active, rien ne s'imprime", async () => {
    const t = setup();
    t.columns.open.current = () => columnsStarted;
    t.exporting.printNote();
    await settle();
    expect(t.log).toEqual([]);
  });
});

describe("copie en texte mis en forme depuis l'export", () => {
  it("copie la note demandée, ou à défaut celle de la colonne active", async () => {
    const t = setup();
    t.exporting.copyNote("Travail/autre.md");
    await expect.poll(() => t.shown).toEqual(["Note copiée"]);
    expect(t.log).toEqual(["lire Travail/autre.md", "copier Voyage\n\nloin"]);
  });
});

describe("copie en Markdown depuis l'export", () => {
  it("copie le texte de la note demandée, tel quel", async () => {
    const t = setup();
    t.exporting.copyMarkdown("Travail/autre.md");
    await expect.poll(() => t.shown).toEqual(["Markdown copié"]);
    expect(t.log).toEqual(["lire Travail/autre.md", "copier en Markdown # Voyage\n*loin*"]);
  });
});
