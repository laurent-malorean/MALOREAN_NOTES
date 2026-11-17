import { describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  libraryScreen,
  listed,
  recordedScreen,
  settle,
} from "../../test-support/app-fixture";
import { activeNote, columnsStarted, noteOpened } from "../state/columns";
import { currentFolder, type Screen, selectedNote, welcome } from "../state/screen";
import { createFolders } from "./folders";

function setup(start: Screen = libraryScreen()) {
  const { screen } = recordedScreen(start);
  const columns = fakeColumns(noteOpened(noteOpened(columnsStarted, "projets/a.md"), "b.md"));
  const log: string[] = [];
  columns.panes.set(columns.columns().active, fakePane("b.md", log));
  const list = document.createElement("nav");
  document.body.replaceChildren(list);
  const errors: unknown[] = [];
  const folders = createFolders({
    backend: {
      listFolders: async () => (log.push("dossiers"), ["projets", "neuf"]),
      listNotes: async (folder) => (log.push(`notes de «${folder}»`), [listed(`${folder}/x.md`)]),
      createFolder: async (parent, name) => (log.push(`créer ${parent} ${name}`), name),
      renameFolder: async (path, name) => (log.push(`renommer ${path} ${name}`), name),
      moveFolder: async (path, into) => (log.push(`déplacer ${path} ${into}`), `${into}/${path}`),
    },
    screen,
    columns: columns.open,
    refreshList: async () => void log.push("liste"),
    list,
    run: (action) => void action.catch((error: unknown) => errors.push(error)),
  });
  const tabs = () => columns.columns().list[0]?.tabs.map((tab) => tab.note);
  return { folders, screen, columns, log, list, tabs };
}

describe("dossiers", () => {
  it("en choisir un enregistre ce qui est tapé, montre ses notes et ouvre la plus récente", async () => {
    const t = setup();
    await t.folders.select("projets");
    expect(t.log).toEqual(["enregistrer b.md", "notes de «projets»"]);
    expect(currentFolder(t.screen.get())).toBe("projets");
    expect(t.columns.log).toEqual(["montrer projets/x.md"]);
    expect(activeNote(t.columns.columns())).toBe("projets/x.md");
  });

  it("rechoisir le dossier affiché ne le recharge pas, sauf pour quitter la corbeille", async () => {
    const t = setup();
    await t.folders.select("");
    expect(t.log).toEqual([]);
    const trash = setup(
      libraryScreen([], (screen) => ({ ...screen, trash: { notes: [], folders: [] } })),
    );
    await trash.folders.select("");
    expect(trash.log).toEqual(["enregistrer b.md", "notes de «»"]);
    const now = trash.screen.get();
    expect(now.kind === "library" && now.trash).toBe(null);
  });

  it("sur l'accueil, la racine n'est pas rechargée", async () => {
    const t = setup(welcome);
    await t.folders.select("");
    expect(t.log).toEqual([]);
  });

  it("en crée un, puis l'affiche", async () => {
    const t = setup();
    await t.folders.create("", "neuf");
    expect(t.log).toEqual(["créer  neuf", "dossiers", "enregistrer b.md", "notes de «neuf»"]);
    const now = t.screen.get();
    expect(now.kind === "library" && now.folders).toEqual(["projets", "neuf"]);
    expect(currentFolder(now)).toBe("neuf");
  });

  it("renommé, il reste affiché sous son nouveau nom, et les onglets suivent", async () => {
    const t = setup(libraryScreen([listed("projets/a.md")], (s) => ({ ...s, folder: "projets" })));
    await t.folders.rename("projets", "travaux");
    expect(t.log).toEqual(["renommer projets travaux", "dossiers", "liste"]);
    expect(t.columns.log).toEqual(["tout enregistrer", "colonnes"]);
    expect(currentFolder(t.screen.get())).toBe("travaux");
    expect(selectedNote(t.screen.get())).toBe("travaux/a.md");
    expect(t.tabs()).toEqual(["travaux/a.md", "b.md"]);
  });

  it("déplacé, il emmène ses notes et leurs onglets", async () => {
    const t = setup();
    await t.folders.move("projets", "archives");
    expect(t.log).toEqual(["déplacer projets archives", "dossiers", "liste"]);
    expect(t.tabs()).toEqual(["archives/projets/a.md", "b.md"]);
  });

  it("fait écrire le nom d'un nouveau dossier dans le dossier affiché", async () => {
    const t = setup(libraryScreen([], (screen) => ({ ...screen, folder: "projets" })));
    t.folders.startCreation();
    const input = t.list.querySelector("input") as HTMLInputElement;
    expect(input.placeholder).toBe("Nom du dossier");
    input.value = "plans";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await settle();
    expect(t.log.slice(0, 2)).toEqual(["créer projets plans", "dossiers"]);
    expect(currentFolder(t.screen.get())).toBe("plans");
  });
});
