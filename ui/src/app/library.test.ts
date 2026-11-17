import { describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  libraryScreen,
  listed,
  recordedScreen,
} from "../../test-support/app-fixture";
import type { NoteContent } from "../bridge";
import { activeNote, columnsStarted, noteOpened } from "../state/columns";
import { type Screen, searchTyped, welcome } from "../state/screen";
import { createLibrary } from "./library";

const content = (path: string, text: string): NoteContent => ({
  path,
  content: text,
  title: text,
  fingerprint: text,
});

function setup(start: Screen = libraryScreen(), columnsStart = columnsStarted) {
  const { screen, shown } = recordedScreen(start);
  const columns = fakeColumns(columnsStart);
  const calls: string[] = [];
  const messages: string[] = [];
  const state = {
    chosen: { name: "Autres", path: "/autres" } as { name: string; path: string } | null,
  };
  const library = createLibrary({
    backend: {
      chooseLibrary: async () => (calls.push("choisir"), state.chosen),
      listFolders: async () => (calls.push("dossiers"), ["projets"]),
      listNotes: async (folder) => (calls.push(`notes de «${folder}»`), [listed(`${folder}n.md`)]),
      createNote: async (folder) => (calls.push(`créer dans «${folder}»`), { path: "neuve.md" }),
      resolveLink: async (title) => (calls.push(`lien ${title}`), title === "A" ? "a.md" : null),
      moveNote: async (path, into) => (
        calls.push(`déplacer ${path} ${into}`),
        { path: `${into}/${path}` }
      ),
    },
    screen,
    columns: columns.open,
    show: (message) => messages.push(message),
    search: async (query) => void calls.push(`chercher ${query}`),
  });
  return { library, screen, shown, columns, calls, messages, state };
}

describe("bibliothèque ouverte", () => {
  it("s'ouvre sur sa racine ; les colonnes oublient les notes de la précédente", async () => {
    const t = setup(welcome, noteOpened(noteOpened(columnsStarted, "un.md"), "deux.md"));
    expect(t.library.path()).toBe("");
    await t.library.open({ name: "Notes", path: "/notes" });
    expect(t.library.path()).toBe("/notes");
    expect(t.calls).toEqual(["dossiers", "notes de «»"]);
    const now = t.screen.get();
    expect(now.kind === "library" && now.folders).toEqual(["projets"]);
    expect(now.kind === "library" && now.library.path).toBe("/notes");
    expect(activeNote(t.columns.columns())).toBe("n.md");
    expect(t.columns.columns().list[0]?.tabs.map((tab) => tab.note)).toEqual(["n.md"]);
  });

  it("en choisir une autre enregistre d'abord ce qui est tapé ; renoncer ne change rien", async () => {
    const t = setup();
    await t.library.choose();
    expect(t.columns.log[0]).toBe("tout enregistrer");
    expect(t.library.path()).toBe("/autres");
    t.state.chosen = null;
    t.calls.length = 0;
    await t.library.choose();
    expect(t.calls).toEqual(["choisir"]);
    expect(t.library.path()).toBe("/autres");
  });

  it("relit ses dossiers, et la liste du dossier affiché avec la recherche en cours", async () => {
    const t = setup(libraryScreen([], (screen) => ({ ...screen, folder: "projets" })));
    await t.library.refreshFolders();
    await t.library.refreshList();
    expect(t.calls).toEqual(["dossiers", "notes de «projets»"]);
    const now = t.screen.get();
    expect(now.kind === "library" && now.notes).toEqual([listed("projetsn.md")]);
    t.screen.show(searchTyped(t.screen.get(), "courses"));
    await t.library.refreshList();
    expect(t.calls.slice(2)).toEqual(["notes de «projets»", "chercher courses"]);
  });

  it("sur l'accueil, la liste relue ne cherche rien", async () => {
    const t = setup(welcome);
    await t.library.refreshList();
    expect(t.calls).toEqual(["notes de «»"]);
  });

  it("crée une note dans le dossier affiché, l'ouvre et y met le curseur", async () => {
    const t = setup(libraryScreen([], (screen) => ({ ...screen, folder: "projets" })));
    const pane = fakePane();
    t.columns.panes.set(t.columns.columns().active, pane);
    await t.library.createNote();
    expect(t.calls).toEqual(["créer dans «projets»", "notes de «projets»"]);
    expect(t.columns.log).toEqual(["ouvrir neuve.md"]);
    expect(pane.editor.focus).toHaveBeenCalled();
  });

  it("suit un lien une fois ce qui est tapé enregistré ; un titre inconnu est signalé", async () => {
    const t = setup();
    const log: string[] = [];
    t.columns.panes.set(t.columns.columns().active, fakePane("b.md", log));
    await t.library.followLink("A");
    expect(log).toEqual(["enregistrer b.md"]);
    expect(t.columns.log).toEqual(["ouvrir a.md"]);
    await t.library.followLink("Inconnu");
    expect(t.messages).toEqual(["Aucune note ne porte le titre « Inconnu »."]);
    expect(t.columns.log).toEqual(["ouvrir a.md"]);
  });

  it("déplace une note : la liste est relue, ses onglets suivent son nouveau chemin", async () => {
    const t = setup(libraryScreen(), noteOpened(noteOpened(columnsStarted, "a.md"), "b.md"));
    await t.library.moveNote("a.md", "projets");
    expect(t.calls).toEqual(["déplacer a.md projets", "notes de «»"]);
    expect(t.columns.log).toEqual(["enregistrer a.md", "colonnes"]);
    const tabs = t.columns.columns().list[0]?.tabs.map((tab) => tab.note);
    expect(tabs).toEqual(["projets/a.md", "b.md"]);
  });

  it("épingle une note : les colonnes qui la montrent affichent son nouvel en-tête", async () => {
    const t = setup();
    const showing = fakePane("a.md");
    const other = fakePane("b.md");
    t.columns.panes.set(1, showing);
    t.columns.panes.set(2, other);
    const pinned: string[] = [];
    await t.library.changePin("a.md", async (path) => {
      pinned.push(path);
      return content(path, "---\npinned: true\n---\n# A");
    });
    expect(pinned).toEqual(["a.md"]);
    expect(showing.editor.show).toHaveBeenCalledWith("---\npinned: true\n---\n# A");
    expect(other.editor.show).not.toHaveBeenCalled();
    expect(t.calls).toEqual(["notes de «»"]);
  });
});
