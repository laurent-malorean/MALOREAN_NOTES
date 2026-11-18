import { describe, expect, it } from "vitest";
import { fakeColumns, fakePane, settle } from "../../test-support/app-fixture";
import { createLayout } from "../screens/layout";
import { columnsStarted, noteOpened, noteTitled } from "../state/columns";
import { createHistory, RESTORED } from "./history";

function setup(versions = [{ id: "2026-11-18 14h30", label: "18 novembre 2026 à 14:30" }]) {
  const layout = createLayout(document.createElement("div"));
  document.body.replaceChildren(layout.confirmation);
  const log: string[] = [];
  const columns = fakeColumns(noteOpened(columnsStarted, "Travail/voyage.md"));
  const errors: unknown[] = [];
  const history = createHistory({
    backend: {
      listVersions: async (path) => (log.push(`versions ${path}`), versions),
      compareVersion: async (path, id) => (log.push(`comparer ${path} ${id}`), []),
      restoreVersion: async (path, id) => {
        log.push(`restaurer ${path} ${id}`);
        return { path, content: "", title: "", fingerprint: "" };
      },
    },
    columns: columns.open,
    layout,
    show: (message) => log.push(`message ${message}`),
    error: (error) => errors.push(error),
    run: (action) => void action.catch((error: unknown) => errors.push(error)),
  });
  const dialog = layout.confirmation;
  return { history, log, columns, dialog, errors };
}

describe("historique de la note", () => {
  it("sans chemin, ouvre celui de la note de la colonne active, une fois ce qui est tapé enregistré", async () => {
    const t = setup();
    t.history.show();
    await settle();
    expect(t.columns.log).toEqual(["enregistrer Travail/voyage.md"]);
    expect(t.log).toEqual([
      "versions Travail/voyage.md",
      "comparer Travail/voyage.md 2026-11-18 14h30",
    ]);
    expect(t.dialog.querySelector(".history-title")?.textContent).toBe("Historique de « voyage »");
  });

  it("le titre de la fenêtre est celui que montre l'onglet de la note", async () => {
    const t = setup();
    await t.columns.open.update((now) => noteTitled(now, "Travail/voyage.md", "Voyage à Rome"));
    t.history.show("Travail/voyage.md");
    await settle();
    expect(t.dialog.querySelector(".history-title")?.textContent).toBe(
      "Historique de « Voyage à Rome »",
    );
  });

  it("une note qui n'est dans aucun onglet porte le nom de son fichier, sans l'extension finale", async () => {
    const t = setup();
    t.history.show("Perso/idées.mdx.md");
    await settle();
    expect(t.dialog.querySelector(".history-title")?.textContent).toBe(
      "Historique de « idées.mdx »",
    );
  });

  it("sans note montrée, rien ne s'ouvre", async () => {
    const t = setup();
    await t.columns.open.change(columnsStarted);
    t.history.show();
    await settle();
    expect(t.log).toEqual([]);
    expect(t.dialog.open).toBe(false);
  });

  it("restaurer revient à la version, la colonne qui montre la note la relit, et le dit", async () => {
    const t = setup();
    t.columns.panes.set(0, fakePane("Autre.md", t.log));
    t.columns.panes.set(1, fakePane("Travail/voyage.md", t.log));
    t.history.show();
    await settle();
    [...t.dialog.querySelectorAll("button")].find((b) => b.textContent === "Restaurer")?.click();
    await settle();
    expect(t.log.slice(-3)).toEqual([
      "restaurer Travail/voyage.md 2026-11-18 14h30",
      "relire Travail/voyage.md",
      `message ${RESTORED}`,
    ]);
  });

  it("restaurer une note qu'aucune colonne ne montre ne relit rien", async () => {
    const t = setup();
    t.history.show("Perso/idées.md");
    await settle();
    [...t.dialog.querySelectorAll("button")].find((b) => b.textContent === "Restaurer")?.click();
    await settle();
    expect(t.log.slice(-2)).toEqual([
      "restaurer Perso/idées.md 2026-11-18 14h30",
      "message Version restaurée",
    ]);
  });
});
