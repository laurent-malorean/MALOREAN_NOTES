import { describe, expect, it } from "vitest";
import { fakeColumns } from "../../test-support/app-fixture";
import type { NoteContent } from "../bridge";
import { columnsStarted, noteOpened } from "../state/columns";
import { screenActions } from "./screen-actions";

const content = (path: string): NoteContent => ({ path, content: "", title: "", fingerprint: "" });

function setup() {
  const calls: string[] = [];
  const ran: unknown[] = [];
  const done = (call: string) => async () => void calls.push(call);
  const columns = fakeColumns(noteOpened(columnsStarted, "a.md"));
  const backend = {
    pinNote: async (path: string) => content(path),
    unpinNote: async (path: string) => content(path),
  };
  const actions = screenActions({
    backend,
    columns: columns.open,
    folders: {
      select: (folder) => done(`choisir ${folder}`)(),
      create: (parent, name) => done(`créer ${parent} ${name}`)(),
      rename: (path, name) => done(`renommer ${path} ${name}`)(),
      move: (path, into) => done(`déplacer ${path} ${into}`)(),
      fold: (path) => void calls.push(`plier ${path}`),
    },
    workspace: {
      moveNote: (path, into) => done(`déplacer la note ${path} ${into}`)(),
      changePin: (path, change) =>
        done(`${change === backend.pinNote ? "épingler" : "désépingler"} ${path}`)(),
      sortBy: (order) => done(`trier par ${order}`)(),
    },
    trash: {
      trashNote: (path) => done(`jeter ${path}`)(),
      trashFolder: (path) => done(`jeter le dossier ${path}`)(),
      restoreNote: (path) => done(`rendre ${path}`)(),
      restoreFolder: (path) => done(`rendre le dossier ${path}`)(),
      empty: done("vider"),
    },
    tags: {
      select: (tag) => done(`filtrer #${tag}`)(),
      clear: () => (calls.push("retirer le filtre"), true),
    },
    recent: { show: done("récentes") },
    exporting: {
      exportNote: (path) => void calls.push(`exporter ${path}`),
      printNote: (path) => void calls.push(`imprimer ${path}`),
      copyNote: (path) => void calls.push(`copier ${path}`),
    },
    run: (action) => void ran.push(action),
  });
  return { actions, calls, ran, columns };
}

describe("demandes de l'écran", () => {
  it("chaque demande des dossiers, des notes, de Récentes et de la corbeille va au module de son domaine", async () => {
    const t = setup();
    t.actions.select("projets");
    t.actions.create("projets", "neuf");
    t.actions.rename("projets", "travaux");
    t.actions.move("projets", "archives");
    t.actions.moveNote("a.md", "projets");
    t.actions.pin("a.md");
    t.actions.unpin("b.md");
    t.actions.exportNote("c.md");
    t.actions.printNote("b.md");
    t.actions.copyNote("c.md");
    t.actions.trash("a.md");
    t.actions.trashFolder("projets");
    t.actions.restoreNote("a.md");
    t.actions.restoreFolder("projets");
    t.actions.empty();
    t.actions.fold("projets");
    t.actions.selectTag("perso");
    t.actions.clearTag();
    t.actions.sortNotes("title");
    t.actions.showRecent();
    await Promise.all(t.ran);
    expect(t.calls).toEqual([
      "choisir projets",
      "créer projets neuf",
      "renommer projets travaux",
      "déplacer projets archives",
      "déplacer la note a.md projets",
      "épingler a.md",
      "désépingler b.md",
      "exporter c.md",
      "imprimer b.md",
      "copier c.md",
      "jeter a.md",
      "jeter le dossier projets",
      "rendre a.md",
      "rendre le dossier projets",
      "vider",
      "plier projets",
      "filtrer #perso",
      "retirer le filtre",
      "trier par title",
      "récentes",
    ]);
    expect(t.ran).toHaveLength(15);
  });

  it("ouvre une note, la place ou la ferme dans les colonnes", async () => {
    const t = setup();
    t.actions.open("b.md");
    t.actions.place("c.md", "newTab");
    t.actions.closeNote("a.md");
    await Promise.all(t.ran);
    expect(t.columns.log).toEqual(["ouvrir b.md", "colonnes", "colonnes"]);
    expect(t.columns.columns().list[0]?.tabs.map((tab) => tab.note)).toEqual(["b.md", "c.md"]);
  });
});
