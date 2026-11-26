import { describe, expect, it } from "vitest";
import { fakeColumns } from "../../test-support/app-fixture";
import type { NoteContent } from "../bridge";
import { columnsStarted, noteOpened } from "../state/columns";
import type { Pane } from "../screens/note-pane";
import type { CurrentScreen } from "./current-screen";
import { screenActions } from "./screen-actions";

const content = (path: string): NoteContent => ({ path, content: "", title: "", fingerprint: "" });

function setup(searching: string | null = null) {
  const calls: string[] = [];
  const ran: unknown[] = [];
  const done = (call: string) => async () => void calls.push(call);
  const columns = fakeColumns(noteOpened(columnsStarted, "a.md"));
  const backend = {
    pinNote: async (path: string) => content(path),
    unpinNote: async (path: string) => content(path),
  };
  columns.panes.set(0, {
    editor: { reveal: (query: string) => void calls.push(`montrer ${query}`) },
    revealNode: (node: string) => void calls.push(`nœud ${node}`),
  } as unknown as Pane);
  const screen = {
    get: () => ({ kind: "workspace", search: searching && { query: searching, results: null } }),
    show: (next: { search: { query: string } | null }) =>
      void calls.push(`écran ${next.search === null ? "sans recherche" : next.search.query}`),
  } as unknown as CurrentScreen;
  const renaming = {
    available: async () => true,
    start: (path: string) => void calls.push(`renommer la note ${path}`),
  };
  const actions = screenActions({
    backend,
    screen,
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
      createNote: (folder) => done(`nouvelle note ${folder}`)(),
    },
    notebooks: {
      create: (folder) => done(`nouveau cahier ${folder}`)(),
      createMindMap: (folder) => done(`nouvelle carte mentale ${folder}`)(),
      createCanvas: (folder) => done(`nouveau canvas ${folder}`)(),
      createCrm: (folder) => done(`nouveau CRM ${folder}`)(),
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
      copyMarkdown: (path) => void calls.push(`copier en Markdown ${path}`),
    },
    history: { show: (path) => void calls.push(`historique ${path}`) },
    renaming,
    settings: { openTab: (name) => void calls.push(`réglages ${name}`) },
    run: (action) => void ran.push(action),
  });
  return { actions, calls, ran, columns, renaming };
}

describe("demandes de l'écran", () => {
  it("le menu d'une note de la liste et des résultats renomme par le module du renommage", () => {
    const t = setup();
    expect(t.actions.renaming).toBe(t.renaming);
    t.actions.renaming?.start("a.md");
    expect(t.calls).toEqual(["renommer la note a.md"]);
  });

  it("une carte mentale trouvée par un nœud s'ouvre sur lui, sans chercher le terme dans le texte", async () => {
    const t = setup("pain");
    t.actions.open("carte.md", "0.1");
    await Promise.all(t.ran);
    expect(t.calls).toContain("nœud 0.1");
    expect(t.calls).not.toContain("montrer pain");
  });

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
    t.actions.copyMarkdown("a.md");
    t.actions.showHistory("b.md");
    t.actions.trash("a.md");
    t.actions.trashFolder("projets");
    t.actions.restoreNote("a.md");
    t.actions.restoreFolder("projets");
    t.actions.empty();
    t.actions.fold("projets");
    t.actions.newNote("projets");
    t.actions.newMindMap("projets");
    t.actions.newNotebook("projets");
    t.actions.newCrm("projets");
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
      "copier en Markdown a.md",
      "historique b.md",
      "jeter a.md",
      "jeter le dossier projets",
      "rendre a.md",
      "rendre le dossier projets",
      "vider",
      "plier projets",
      "nouvelle note projets",
      "nouvelle carte mentale projets",
      "nouveau cahier projets",
      "nouveau CRM projets",
      "filtrer #perso",
      "retirer le filtre",
      "trier par title",
      "récentes",
    ]);
    expect(t.ran).toHaveLength(19);
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

  it("ouvre une note trouvée par une recherche sur le terme cherché, et sans recherche, au début", async () => {
    const searched = setup("beagle");
    searched.actions.open("b.md");
    await Promise.all(searched.ran);
    expect(searched.calls).toEqual(["écran sans recherche", "montrer beagle"]);
    const shortSearch = setup("be");
    shortSearch.actions.open("b.md");
    await Promise.all(shortSearch.ran);
    expect(shortSearch.calls).toEqual([]);
    const plain = setup();
    plain.actions.open("b.md");
    await Promise.all(plain.ran);
    expect(plain.calls).toEqual([]);
  });

  it("ouvrir un résultat ferme la recherche ; dans un nouvel onglet aussi, mais pas hors recherche", async () => {
    const searched = setup("beagle");
    searched.actions.place("c.md", "newTab");
    await Promise.all(searched.ran);
    expect(searched.calls).toEqual(["écran sans recherche"]);
    const plain = setup();
    plain.actions.place("c.md", "newTab");
    plain.actions.open("b.md");
    await Promise.all(plain.ran);
    expect(plain.calls).toEqual([]);
  });

  it("une carte mentale ouverte par un nœud ferme aussi la recherche", async () => {
    const t = setup("pain");
    t.actions.open("carte.md", "0.1");
    await Promise.all(t.ran);
    expect(t.calls).toEqual(["écran sans recherche", "nœud 0.1"]);
  });

  it("ferme la recherche à la demande de la fenêtre, et ne touche à rien sans recherche", () => {
    const searched = setup("beagle");
    searched.actions.closeSearch();
    expect(searched.calls).toEqual(["écran sans recherche"]);
    const plain = setup();
    plain.actions.closeSearch();
    expect(plain.calls).toEqual([]);
  });

  it("mène la fenêtre de recherche aux réglages de l'index", () => {
    const t = setup("beagle");
    t.actions.openIndexSettings();
    expect(t.calls).toEqual(["réglages Index"]);
  });
});
