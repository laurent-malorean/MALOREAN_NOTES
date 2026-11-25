import { describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  workspaceScreen,
  recordedScreen,
  settle,
} from "../../test-support/app-fixture";
import type { WorkspaceChanged } from "../bridge";
import { columnsStarted, noteOpened } from "../state/columns";
import { type Screen, welcome } from "../state/screen";
import { connectExternalChanges } from "./external-changes";

function setup(start: Screen = workspaceScreen(), options: { failListen?: boolean } = {}) {
  const { screen } = recordedScreen(start);
  const columns = fakeColumns(noteOpened(noteOpened(columnsStarted, "a.md"), "b.md"));
  const log: string[] = [];
  let announce: (change: WorkspaceChanged) => void = () => {};
  connectExternalChanges({
    backend: {
      onWorkspaceChanged: async (handler) => {
        if (options.failListen) throw new Error("sourde");
        announce = handler;
        return () => {};
      },
      listAllNotes: async () => (
        log.push("toutes les notes"),
        [{ path: "c.md", title: "Cé", folder: "" }]
      ),
    },
    screen,
    columns: columns.open,
    workspace: {
      refreshFolders: async () => void log.push("dossiers"),
      refreshList: async () => void log.push("liste"),
    },
    messages: {
      run: (action) => void action.then(() => log.push("fini")),
      error: (error) => log.push(`erreur ${(error as Error).message}`),
    },
  });
  const tabs = () => columns.columns().list[0]?.tabs.map((tab) => `${tab.note} ${tab.title}`);
  return { announce: (notes: string[]) => announce({ notes }), log, columns, tabs };
}

describe("modifications faites hors de l'application", () => {
  it("dossiers, liste et onglets suivent ; seules les colonnes de notes touchées relisent le disque, les autres relisent leurs fiches", async () => {
    const t = setup();
    t.columns.panes.set(1, fakePane("a.md", t.log));
    t.columns.panes.set(2, fakePane("b.md", t.log));
    t.announce(["b.md", "c.md"]);
    await settle();
    expect(t.log).toEqual([
      "dossiers",
      "liste",
      "toutes les notes",
      "liens a.md",
      "proches a.md",
      "fiches a.md b.md,c.md",
      "liens b.md",
      "proches b.md",
      "relire b.md",
      "fini",
    ]);
    expect(t.tabs()).toEqual(["a.md null", "c.md Cé"]);
  });

  it("rien sur l'accueil", async () => {
    const t = setup(welcome);
    t.announce(["a.md"]);
    await settle();
    expect(t.log).toEqual(["fini"]);
  });

  it("une écoute impossible est signalée", async () => {
    const t = setup(workspaceScreen(), { failListen: true });
    await settle();
    expect(t.log).toEqual(["erreur sourde"]);
  });
});
