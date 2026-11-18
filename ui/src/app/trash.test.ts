import { describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  libraryScreen,
  listed,
  recordedScreen,
} from "../../test-support/app-fixture";
import type { NoteListItem } from "../bridge";
import { activeNote, type Columns, columnsStarted, noteOpened } from "../state/columns";
import { currentFolder, type Screen, welcome } from "../state/screen";
import { createTrash } from "./trash";

const EMPTY_TRASH = { notes: [], folders: ["vieux"] };

function setup(
  start: Screen = libraryScreen(),
  columnsStart: Columns = columnsStarted,
  options: { accept?: boolean; listed?: NoteListItem[] } = {},
) {
  const { screen } = recordedScreen(start);
  const columns = fakeColumns(columnsStart);
  const log: string[] = [];
  const asked: string[] = [];
  const trash = createTrash({
    backend: {
      trashNote: async (path) => (log.push(`corbeille ${path}`), path),
      trashFolder: async (path) => (log.push(`corbeille ${path}/`), path),
      listTrash: async () => (log.push("corbeille"), EMPTY_TRASH),
      listFolders: async () => (log.push("dossiers"), ["projets"]),
      listNotes: async (folder) => (log.push(`notes de «${folder}»`), options.listed ?? []),
      restoreNote: async (path) => (log.push(`restaurer ${path}`), { path }),
      restoreFolder: async (path) => (log.push(`restaurer ${path}/`), path),
      emptyTrash: async () => (log.push("vider"), null),
    },
    screen,
    columns: columns.open,
    ask: async (name) => (asked.push(name), options.accept ?? true),
    refreshList: async () => {
      log.push("liste");
      if (options.listed) screen.show(libraryScreen(options.listed));
    },
    refreshTags: async () => void log.push("étiquettes"),
  });
  const tabs = () => columns.columns().list[0]?.tabs.map((tab) => tab.note);
  return { trash, screen, columns, log, asked, tabs };
}

const notes = [listed("a.md", "Alpha"), listed("b.md", "Bêta"), listed("c.md")];
const open = (...paths: string[]) => paths.reduce(noteOpened, columnsStarted);

describe("corbeille : une note", () => {
  it("demande d'abord, par son titre ; refusée, rien ne part", async () => {
    const t = setup(libraryScreen(notes), open("a.md"), { accept: false });
    await t.trash.trashNote("a.md");
    await t.trash.trashNote("inconnue.md");
    expect(t.asked).toEqual(["Alpha", "inconnue.md"]);
    expect(t.log).toEqual([]);
  });

  it("sur l'accueil, la note est nommée par son chemin", async () => {
    const t = setup(welcome, open(), { accept: false });
    await t.trash.trashNote("a.md");
    expect(t.asked).toEqual(["a.md"]);
  });

  it("acceptée, elle part ; si la colonne active la montrait, la suivante de la liste s'y ouvre", async () => {
    const t = setup(libraryScreen(notes), open("c.md", "a.md"), { listed: notes.slice(1) });
    const pane = fakePane("a.md");
    t.columns.panes.set(t.columns.columns().active, pane);
    await t.trash.trashNote("a.md");
    expect(t.log).toEqual(["corbeille a.md", "liste", "étiquettes"]);
    expect(t.columns.log).toEqual(["enregistrer a.md", "colonnes"]);
    expect(pane.forget).toHaveBeenCalled();
    expect(t.tabs()).toEqual(["c.md", "b.md"]);
    expect(activeNote(t.columns.columns())).toBe("b.md");
  });

  it("une note d'un onglet en arrière-plan ferme seulement son onglet", async () => {
    const t = setup(libraryScreen(notes), open("a.md", "c.md"), { listed: notes.slice(1) });
    await t.trash.trashNote("a.md");
    expect(t.tabs()).toEqual(["c.md"]);
  });

  it("sur l'accueil, aucune suivante ne s'ouvre", async () => {
    const t = setup(welcome, open("a.md"));
    await t.trash.trashNote("a.md");
    expect(t.tabs()).toEqual([]);
  });
});

describe("corbeille : un dossier", () => {
  it("demande d'abord, par son nom", async () => {
    const t = setup(libraryScreen(), open(), { accept: false });
    await t.trash.trashFolder("projets/plans");
    expect(t.asked).toEqual(["plans"]);
    expect(t.log).toEqual([]);
  });

  it("si on y était, la liste revient à la racine et sa note la plus récente s'ouvre", async () => {
    const inside = libraryScreen([], (s) => ({ ...s, folder: "projets/plans" }));
    const t = setup(inside, open("projets/plans/a.md", "b.md"), { listed: [listed("r.md")] });
    const pane = fakePane("projets/plans/a.md");
    t.columns.panes.set(2, pane);
    await t.trash.trashFolder("projets");
    expect(t.log).toEqual(["corbeille projets/", "dossiers", "étiquettes", "notes de «»"]);
    expect(t.columns.log).toEqual(["tout enregistrer", "colonnes"]);
    expect(pane.forget).toHaveBeenCalled();
    expect(currentFolder(t.screen.get())).toBe("");
    expect(t.tabs()).toEqual(["r.md"]);
  });

  it("ailleurs, la liste est relue ; la note active partie, une autre s'ouvre", async () => {
    const t = setup(libraryScreen(), open("b.md", "projets/a.md"), { listed: [listed("r.md")] });
    await t.trash.trashFolder("projets");
    expect(t.log).toEqual(["corbeille projets/", "dossiers", "étiquettes", "liste"]);
    expect(t.tabs()).toEqual(["b.md", "r.md"]);
  });

  it("un dossier au nom voisin, ou une note active ailleurs, ne bougent pas", async () => {
    const t = setup(
      libraryScreen([], (s) => ({ ...s, folder: "projets-bis" })),
      open("projets/a.md", "projets-bis/b.md"),
      { listed: [listed("r.md")] },
    );
    await t.trash.trashFolder("projets");
    expect(t.log).toEqual(["corbeille projets/", "dossiers", "étiquettes", "liste"]);
    expect(t.tabs()).toEqual(["projets-bis/b.md"]);
  });

  it("sans note active, aucune autre ne s'ouvre", async () => {
    const t = setup(libraryScreen(), open(), { listed: [listed("r.md")] });
    await t.trash.trashFolder("projets");
    expect(t.tabs()).toEqual([]);
  });

  it("la note active partie, sur l'accueil, aucune autre ne s'ouvre", async () => {
    const t = setup(welcome, open("b.md", "projets/a.md"));
    await t.trash.trashFolder("projets");
    expect(t.tabs()).toEqual(["b.md"]);
  });
});

describe("corbeille : la montrer, restaurer, vider", () => {
  it("se montre à la place des notes", async () => {
    const t = setup();
    await t.trash.show();
    const now = t.screen.get();
    expect(now.kind === "library" && now.trash).toEqual(EMPTY_TRASH);
  });

  it("restaurer ou vider relit les dossiers, les étiquettes, la liste et la corbeille", async () => {
    const t = setup(libraryScreen([], (s) => ({ ...s, folder: "projets" })));
    await t.trash.restoreNote("a.md");
    await t.trash.restoreFolder("vieux");
    await t.trash.empty();
    const reread = ["dossiers", "étiquettes", "liste", "corbeille"];
    expect(t.log).toEqual([
      "restaurer a.md",
      ...reread,
      "restaurer vieux/",
      ...reread,
      "vider",
      ...reread,
    ]);
    const now = t.screen.get();
    expect(now.kind === "library" && now.folders).toEqual(["projets"]);
  });
});
