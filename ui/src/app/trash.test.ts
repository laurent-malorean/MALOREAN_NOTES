import { describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  workspaceScreen,
  listed,
  recordedScreen,
} from "../../test-support/app-fixture";
import type { NoteListItem } from "../bridge";
import { activeNote, type Columns, columnsStarted, noteOpened } from "../state/columns";
import { currentFolder, type Screen, welcome } from "../state/screen";
import { createTrash } from "./trash";

const EMPTY_TRASH = { notes: [], folders: ["vieux"] };

function setup(
  start: Screen = workspaceScreen(),
  columnsStart: Columns = columnsStarted,
  options: { accept?: boolean; listed?: NoteListItem[]; fiches?: number } = {},
) {
  const { screen } = recordedScreen(start);
  const columns = fakeColumns(columnsStart);
  const log: string[] = [];
  const asked: string[] = [];
  const askedFiches: number[] = [];
  const trash = createTrash({
    backend: {
      trashNote: async (path) => (log.push(`corbeille ${path}`), path),
      deleteAgenda12Event: async (path) => (log.push(`corbeille événement ${path}`), path),
      crmFichesInTrash: async () => options.fiches ?? 0,
      trashFolder: async (path) => (log.push(`corbeille ${path}/`), path),
      listTrash: async () => (log.push("corbeille"), EMPTY_TRASH),
      listFolders: async () => (log.push("dossiers"), ["projets"]),
      listNotes: async (folder, order) => (
        log.push(`notes de «${folder}» par ${order}`),
        options.listed ?? []
      ),
      restoreNote: async (path) => (log.push(`restaurer ${path}`), { path }),
      restoreFolder: async (path) => (log.push(`restaurer ${path}/`), path),
      emptyTrash: async () => (log.push("vider"), null),
    },
    screen,
    columns: columns.open,
    ask: async (name, fiches) => (
      asked.push(name),
      askedFiches.push(fiches),
      options.accept ?? true
    ),
    refreshList: async () => {
      log.push("liste");
      if (options.listed) screen.show(workspaceScreen(options.listed));
    },
    refreshTags: async () => void log.push("étiquettes"),
  });
  const tabs = () => columns.columns().list[0]?.tabs.map((tab) => tab.note);
  return { trash, screen, columns, log, asked, askedFiches, tabs };
}

const notes = [listed("a.md", "Alpha"), listed("b.md", "Bêta"), listed("c.md")];
const open = (...paths: string[]) => paths.reduce(noteOpened, columnsStarted);

describe("corbeille : une note", () => {
  it("demande d'abord, par son titre ; refusée, rien ne part", async () => {
    const t = setup(workspaceScreen(notes), open("a.md"), { accept: false });
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
    const t = setup(workspaceScreen(notes), open("c.md", "a.md"), { listed: notes.slice(1) });
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
    const t = setup(workspaceScreen(notes), open("a.md", "c.md"), { listed: notes.slice(1) });
    await t.trash.trashNote("a.md");
    expect(t.tabs()).toEqual(["c.md"]);
  });

  it("sur l'accueil, aucune suivante ne s'ouvre", async () => {
    const t = setup(welcome, open("a.md"));
    await t.trash.trashNote("a.md");
    expect(t.tabs()).toEqual([]);
  });

  it("une note ordinaire est demandée sans fiche", async () => {
    const t = setup(workspaceScreen(notes), open("a.md"), { listed: notes.slice(1) });
    await t.trash.trashNote("a.md");
    expect(t.askedFiches).toEqual([0]);
  });

  it("un CRM dit combien de fiches partent avec lui et ferme aussi leurs onglets", async () => {
    const crm = [listed("c.md", "CRM1"), listed("b.md", "Bêta")];
    const t = setup(
      workspaceScreen(crm),
      open("c.md", "c/actions/x.md", "c/personnes/p.md", "cc/y.md"),
      {
        listed: crm.slice(1),
        fiches: 2,
      },
    );
    await t.trash.trashNote("c.md");
    expect(t.asked).toEqual(["CRM1"]);
    expect(t.askedFiches).toEqual([2]);
    expect(t.tabs()).toEqual(["cc/y.md"]);
  });

  it("sans fiche, les onglets d'un dossier du même nom restent ouverts", async () => {
    const t = setup(workspaceScreen(notes), open("a.md", "a/x.md"), {
      listed: notes.slice(1),
      fiches: 0,
    });
    await t.trash.trashNote("a.md");
    expect(t.tabs()).toEqual(["a/x.md"]);
  });
});

describe("corbeille : un événement d'un agenda 12", () => {
  const event = { path: "pro/salons/a.md", title: "Salon A", agenda: "pro/salons.md" };

  it("demande d'abord, par son titre ; refusée, rien ne part", async () => {
    const t = setup(workspaceScreen(notes), open(event.path), { accept: false });
    await t.trash.trashEvent(event);
    expect(t.asked).toEqual(["Salon A"]);
    expect(t.askedFiches).toEqual([0]);
    expect(t.log).toEqual([]);
  });

  it("accepté, il part par la commande de l'agenda 12, et l'agenda 12 s'ouvre à sa place", async () => {
    const t = setup(workspaceScreen(notes), open("pro/salons.md", event.path), { listed: notes });
    const pane = fakePane(event.path);
    t.columns.panes.set(t.columns.columns().active, pane);
    await t.trash.trashEvent(event);
    expect(t.log).toEqual(["corbeille événement pro/salons/a.md", "liste", "étiquettes"]);
    expect(pane.forget).toHaveBeenCalled();
    expect(t.tabs()).toEqual(["pro/salons.md"]);
    expect(activeNote(t.columns.columns())).toBe("pro/salons.md");
  });
});

describe("corbeille : un dossier", () => {
  it("demande d'abord, par son nom", async () => {
    const t = setup(workspaceScreen(), open(), { accept: false });
    await t.trash.trashFolder("projets/plans");
    expect(t.asked).toEqual(["plans"]);
    expect(t.log).toEqual([]);
  });

  it("si on y était, la liste revient à la racine, dans son tri, et sa première note s'ouvre", async () => {
    const inside = workspaceScreen([], (s) => ({ ...s, folder: "projets/plans", order: "title" }));
    const t = setup(inside, open("projets/plans/a.md", "b.md"), { listed: [listed("r.md")] });
    const pane = fakePane("projets/plans/a.md");
    t.columns.panes.set(2, pane);
    await t.trash.trashFolder("projets");
    expect(t.log).toEqual([
      "corbeille projets/",
      "dossiers",
      "étiquettes",
      "notes de «» par title",
    ]);
    expect(t.columns.log).toEqual(["tout enregistrer", "colonnes"]);
    expect(pane.forget).toHaveBeenCalled();
    expect(currentFolder(t.screen.get())).toBe("");
    expect(t.tabs()).toEqual(["r.md"]);
  });

  it("ailleurs, la liste est relue ; la note active partie, une autre s'ouvre", async () => {
    const t = setup(workspaceScreen(), open("b.md", "projets/a.md"), { listed: [listed("r.md")] });
    await t.trash.trashFolder("projets");
    expect(t.log).toEqual(["corbeille projets/", "dossiers", "étiquettes", "liste"]);
    expect(t.tabs()).toEqual(["b.md", "r.md"]);
  });

  it("un dossier au nom voisin, ou une note active ailleurs, ne bougent pas", async () => {
    const t = setup(
      workspaceScreen([], (s) => ({ ...s, folder: "projets-bis" })),
      open("projets/a.md", "projets-bis/b.md"),
      { listed: [listed("r.md")] },
    );
    await t.trash.trashFolder("projets");
    expect(t.log).toEqual(["corbeille projets/", "dossiers", "étiquettes", "liste"]);
    expect(t.tabs()).toEqual(["projets-bis/b.md"]);
  });

  it("sans note active, aucune autre ne s'ouvre", async () => {
    const t = setup(workspaceScreen(), open(), { listed: [listed("r.md")] });
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
    expect(now.kind === "workspace" && now.trash).toEqual(EMPTY_TRASH);
  });

  it("restaurer ou vider relit les dossiers, les étiquettes, la liste et la corbeille", async () => {
    const t = setup(workspaceScreen([], (s) => ({ ...s, folder: "projets" })));
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
    expect(now.kind === "workspace" && now.folders).toEqual(["projets"]);
  });
});
