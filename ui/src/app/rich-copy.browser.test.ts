import { beforeEach, describe, expect, it } from "vitest";
import { fakeColumns, fakePane, settle } from "../../test-support/app-fixture";
import { columnsStarted, noteOpened } from "../state/columns";
import { copyNote } from "./rich-copy";

/** Une image de 1 × 1 point, lisible par le navigateur. */
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const sheet = document.createElement("article");

function setup({ content = "# Voyage\n*loin*", selection = "" } = {}) {
  const log: string[] = [];
  const shown: string[] = [];
  const copied: [string, string][] = [];
  const columns = fakeColumns(noteOpened(columnsStarted, "Travail/voyage.md"));
  const pane = fakePane("Travail/voyage.md");
  Object.assign(pane.editor, { selectedText: () => selection });
  columns.panes.set(columns.columns().active, pane);
  const deps = {
    backend: {
      readNote: async (path: string) => {
        log.push(`lire ${path}`);
        return { path, content, title: "Voyage", fingerprint: "f" };
      },
      copyRichText: async (html: string, text: string) => {
        copied.push([html, text]);
        return null;
      },
      fileAddress: (path: string) =>
        path.endsWith("pixel.gif")
          ? PIXEL
          : path.endsWith("texte.txt")
            ? "data:text/plain,bonjour"
            : `asset://${path}`,
    },
    columns: columns.open,
    workspacePath: () => "/Notes",
    sheet,
    show: (message: string) => shown.push(message),
    run: (action: Promise<unknown>) =>
      void action.catch((error: unknown) => log.push(`erreur ${String(error)}`)),
  };
  return { deps, log, shown, copied, columns };
}

beforeEach(() => {
  document.body.replaceChildren(sheet);
  sheet.style.setProperty("--text", "encre");
  sheet.style.setProperty("--heading1-size", "2em");
});

describe("copier en texte mis en forme", () => {
  it("copie la note cliquée, enregistrée, en HTML aux styles du thème et en texte brut", async () => {
    const t = setup();
    copyNote(t.deps, "Travail/voyage.md");
    await expect.poll(() => t.shown).toEqual(["Note copiée"]);
    expect(t.columns.log).toContain("enregistrer Travail/voyage.md");
    expect(t.log).toEqual(["lire Travail/voyage.md"]);
    const [html, text] = t.copied[0] as [string, string];
    expect(html).toMatch(/^<div style="color: encre; /);
    expect(html).toContain('<h1 style="font-size: 2em">Voyage</h1><p><em>loin</em></p>');
    expect(text).toBe("Voyage\n\nloin");
  });

  it("sans chemin et sans sélection, copie la note de la colonne active", async () => {
    const t = setup();
    copyNote(t.deps);
    await expect.poll(() => t.shown).toEqual(["Note copiée"]);
    expect(t.log).toEqual(["lire Travail/voyage.md"]);
  });

  it("sans chemin, copie seulement la sélection de la colonne active, sans relire la note", async () => {
    const t = setup({ selection: "**gras** et ![](pixel.gif)" });
    copyNote(t.deps);
    await expect.poll(() => t.shown).toEqual(["Sélection copiée"]);
    expect(t.log).toEqual([]);
    const [html, text] = t.copied[0] as [string, string];
    expect(html).toContain(
      `<p><strong>gras</strong> et <img style="max-width: 100%" src="${PIXEL}"`,
    );
    expect(text).toBe("gras et");
  });

  it("sans note dans la colonne active, ne copie rien", async () => {
    const t = setup();
    t.columns.open.current = () => columnsStarted;
    copyNote(t.deps);
    await settle();
    expect(t.copied).toEqual([]);
    expect(t.shown).toEqual([]);
  });

  it("laisse de côté les images introuvables et ce qui n'est pas une image", async () => {
    const t = setup({ content: "![](absente.png)![](texte.txt)![](pixel.gif)" });
    copyNote(t.deps, "Travail/voyage.md");
    await expect.poll(() => t.shown).toEqual(["Note copiée"]);
    const [html] = t.copied[0] as [string, string];
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toContain(`src="${PIXEL}"`);
  });

  it("un presse-papiers qui refuse est signalé, sans message de copie", async () => {
    const t = setup();
    t.deps.backend.copyRichText = async () => {
      throw new Error("refusé");
    };
    copyNote(t.deps, "Travail/voyage.md");
    await expect.poll(() => t.log.at(-1)).toBe("erreur Error: refusé");
    expect(t.shown).toEqual([]);
  });
});
