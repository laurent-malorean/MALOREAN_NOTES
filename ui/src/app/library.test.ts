import { describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  libraryScreen,
  listed,
  recordedScreen,
} from "../../test-support/app-fixture";
import type { NoteContent } from "../bridge";
import { activeNote, type Columns, columnsStarted, noteOpened } from "../state/columns";
import type { NoteOrder } from "../state/note-order";
import {
  noteOrder,
  recentShown,
  type Screen,
  searchTyped,
  tagSelected,
  welcome,
} from "../state/screen";
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
  const storage = memoryStorage();
  const state = {
    chosen: { name: "Autres", path: "/autres" } as { name: string; path: string } | null,
    restored: null as Columns | null,
  };
  const recentMoves: string[] = [];
  const library = createLibrary({
    backend: {
      chooseLibrary: async () => (calls.push("choisir"), state.chosen),
      listFolders: async () => (calls.push("dossiers"), ["projets"]),
      listNotes: async (folder, order) => (
        calls.push(`notes de «${folder}»${sortedBy(order)}`),
        [listed(`${folder}n.md`)]
      ),
      listTaggedNotes: async (tag, order) => (
        calls.push(`notes #${tag}${sortedBy(order)}`),
        [listed(`${tag}.md`)]
      ),
      listTags: async () => (calls.push("étiquettes"), [{ name: "perso", count: 2 }]),
      createNote: async (folder) => (calls.push(`créer dans «${folder}»`), { path: "neuve.md" }),
      resolveLink: async (title) => (calls.push(`lien ${title}`), title === "A" ? "a.md" : null),
      moveNote: async (path, into) => (
        calls.push(`déplacer ${path} ${into}`),
        { path: `${into}/${path}` }
      ),
    },
    screen,
    columns: columns.open,
    layout: { restore: async (path) => (calls.push(`disposition de ${path}`), state.restored) },
    folds: { load: (path) => (path === "/notes" ? ["projets"] : []) },
    storage,
    show: (message) => messages.push(message),
    search: async (query) => void calls.push(`chercher ${query}`),
    recent: {
      list: async () => (calls.push("notes récentes"), [listed("r.md")]),
      moved: (rename) => void recentMoves.push(`${rename("a.md")} ${rename("b.md")}`),
    },
  });
  return { library, screen, shown, columns, calls, messages, state, storage, recentMoves };
}

/** Le tri demandé, noté seulement s'il n'est pas celui par défaut. */
const sortedBy = (order: NoteOrder) => (order === "modified" ? "" : ` par ${order}`);

function memoryStorage() {
  const values: Record<string, string> = {};
  return {
    values,
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => void (values[key] = value),
    removeItem: (key: string) => void Reflect.deleteProperty(values, key),
  };
}

describe("bibliothèque ouverte", () => {
  it("s'ouvre sur sa racine ; les colonnes oublient les notes de la précédente", async () => {
    const t = setup(welcome, noteOpened(noteOpened(columnsStarted, "un.md"), "deux.md"));
    expect(t.library.path()).toBe("");
    await t.library.open({ name: "Notes", path: "/notes" });
    expect(t.library.path()).toBe("/notes");
    expect(t.calls).toEqual(["dossiers", "notes de «»", "étiquettes", "disposition de /notes"]);
    const now = t.screen.get();
    expect(now.kind === "library" && now.folders).toEqual(["projets"]);
    expect(now.kind === "library" && now.tags).toEqual([{ name: "perso", count: 2 }]);
    expect(now.kind === "library" && now.library.path).toBe("/notes");
    expect(activeNote(t.columns.columns())).toBe("n.md");
    expect(t.columns.columns().list[0]?.tabs.map((tab) => tab.note)).toEqual(["n.md"]);
  });

  it("s'ouvre avec ses dossiers pliés gardés", async () => {
    const t = setup(welcome);
    await t.library.open({ name: "Notes", path: "/notes" });
    const now = t.screen.get();
    expect(now.kind === "library" && now.folded).toEqual(["projets"]);
    await t.library.open({ name: "Autres", path: "/autres" });
    const other = t.screen.get();
    expect(other.kind === "library" && other.folded).toEqual([]);
  });

  it("s'ouvre avec le tri gardé pour elle", async () => {
    const t = setup(welcome);
    t.storage.values["malorean.order:/notes"] = "title";
    await t.library.open({ name: "Notes", path: "/notes" });
    expect(t.calls[1]).toBe("notes de «» par title");
    expect(noteOrder(t.screen.get())).toBe("title");
    await t.library.open({ name: "Autres", path: "/autres" });
    expect(noteOrder(t.screen.get())).toBe("modified");
  });

  it("trie la liste autrement, relit la liste et la recherche, et garde ce tri", async () => {
    const t = setup(welcome);
    await t.library.open({ name: "Notes", path: "/notes" });
    t.screen.show(searchTyped(t.screen.get(), "courses"));
    t.calls.length = 0;
    await t.library.sortBy("title");
    expect(noteOrder(t.screen.get())).toBe("title");
    expect(t.calls).toEqual(["notes de «» par title", "chercher courses"]);
    expect(t.storage.values).toEqual({ "malorean.order:/notes": "title" });
  });

  it("le filtre par étiquette suit le tri de la liste", async () => {
    const t = setup(
      tagSelected(
        libraryScreen([], (s) => ({ ...s, order: "title" })),
        "perso",
        [],
      ),
    );
    await t.library.refreshList();
    expect(t.calls).toEqual(["notes #perso par title"]);
  });

  it("retrouve les colonnes gardées pour elle, s'il y en a", async () => {
    const t = setup(welcome, noteOpened(columnsStarted, "un.md"));
    t.state.restored = noteOpened(noteOpened(columnsStarted, "a.md"), "b.md");
    await t.library.open({ name: "Notes", path: "/notes" });
    expect(t.columns.columns()).toBe(t.state.restored);
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
    expect(t.calls).toEqual(["dossiers", "étiquettes", "notes de «projets»"]);
    const now = t.screen.get();
    expect(now.kind === "library" && now.notes).toEqual([listed("projetsn.md")]);
    expect(now.kind === "library" && now.tags).toEqual([{ name: "perso", count: 2 }]);
    t.screen.show(searchTyped(t.screen.get(), "courses"));
    await t.library.refreshList();
    expect(t.calls.slice(3)).toEqual(["notes de «projets»", "chercher courses"]);
  });

  it("avec un filtre par étiquette, la liste relue est celle des notes qui la portent", async () => {
    const t = setup(tagSelected(libraryScreen(), "perso", []));
    await t.library.refreshList();
    expect(t.calls).toEqual(["notes #perso"]);
    const now = t.screen.get();
    expect(now.kind === "library" && now.notes).toEqual([listed("perso.md")]);
    expect(now.kind === "library" && now.tag).toBe("perso");
  });

  it("sur Récentes, la liste relue est celle des notes récentes, sans tri", async () => {
    const t = setup(
      recentShown(
        libraryScreen([], (s) => ({ ...s, order: "title" })),
        [],
      ),
    );
    await t.library.refreshList();
    expect(t.calls).toEqual(["notes récentes"]);
    const now = t.screen.get();
    expect(now.kind === "library" && now.notes).toEqual([listed("r.md")]);
    expect(now.kind === "library" && now.recent).toBe(true);
  });

  it("relit la liste des étiquettes seule", async () => {
    const t = setup();
    await t.library.refreshTags();
    expect(t.calls).toEqual(["étiquettes"]);
    const now = t.screen.get();
    expect(now.kind === "library" && now.tags).toEqual([{ name: "perso", count: 2 }]);
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

  it("une note déplacée reste dans les notes récentes, sous son nouveau chemin", async () => {
    const t = setup();
    await t.library.moveNote("a.md", "projets");
    expect(t.recentMoves).toEqual(["projets/a.md b.md"]);
  });

  it("une note déposée dans un dossier déplie ceux qui le contiennent", async () => {
    const folded = ["a", "a/b", "a/b/c", "x"];
    const t = setup(libraryScreen([], (screen) => ({ ...screen, folded })));
    await t.library.moveNote("n.md", "a/b/c");
    const now = t.screen.get();
    expect(now.kind === "library" && now.folded).toEqual(["a/b/c", "x"]);
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
