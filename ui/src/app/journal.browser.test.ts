import { describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  workspaceScreen,
  recordedScreen,
} from "../../test-support/app-fixture";
import type { WorkspaceNoteItem } from "../bridge";
import { columnsStarted, noteOpened } from "../state/columns";
import { welcome } from "../state/screen";
import { createJournal } from "./journal";

const NOTES: WorkspaceNoteItem[] = [
  { path: "Modèles/reunion.md", title: "Réunion", folder: "Modèles" },
  { path: "Modèles/jour.md", title: "Journal", folder: "Modèles" },
];
const TODAY = "Journal/2026-11-18.md";

function setup(stored: Record<string, string> = {}, open = ["a.md"]) {
  const items = new Map(Object.entries(stored));
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
  const log: string[] = [];
  const { screen } = recordedScreen(workspaceScreen());
  const columns = fakeColumns(open.reduce(noteOpened, columnsStarted));
  const pane = fakePane("a.md");
  columns.panes.set(columns.columns().active, pane);
  const journal = createJournal({
    backend: {
      listAllNotes: async () => (log.push("toutes les notes"), NOTES),
      createDailyNote: async (folder, template) => {
        log.push(`note du jour dans ${folder} depuis ${String(template)}`);
        return { path: TODAY };
      },
    },
    storage,
    screen,
    columns: columns.open,
    workspace: {
      path: () => "/lib",
      refreshFolders: async () => void log.push("dossiers"),
      refreshList: async () => void log.push("liste"),
    },
  });
  const tabs = () => columns.columns().list[0]?.tabs.map((tab) => tab.note);
  return { journal, items, log, screen, columns, pane, tabs };
}

describe("note du jour", () => {
  it("sans dossier des modèles, elle est demandée dans le journal par défaut et ouverte dans un nouvel onglet", async () => {
    const j = setup();
    await j.journal.open();
    expect(j.log).toEqual(["note du jour dans Journal depuis null", "dossiers", "liste"]);
    expect(j.columns.log.filter((line) => line.startsWith("enregistrer"))).toEqual([]);
    expect(j.tabs()).toEqual(["a.md", TODAY]);
    expect(j.pane.editor.focus).toHaveBeenCalled();
  });

  it("part du modèle Journal du dossier des modèles, enregistré d'abord, dans le dossier choisi", async () => {
    const j = setup({
      "malorean.templates:/lib": "Modèles",
      "malorean.journal:/lib": JSON.stringify({ folder: "Carnet", atLaunch: true }),
    });
    await j.journal.open();
    expect(j.columns.log[0]).toBe("enregistrer Modèles/jour.md");
    expect(j.log.slice(0, 2)).toEqual([
      "toutes les notes",
      "note du jour dans Carnet depuis Modèles/jour.md",
    ]);
  });

  it("un dossier des modèles sans modèle Journal donne la note avec son seul titre", async () => {
    const j = setup({ "malorean.templates:/lib": "Travail" });
    await j.journal.open();
    expect(j.log.slice(0, 2)).toEqual([
      "toutes les notes",
      "note du jour dans Journal depuis null",
    ]);
  });

  it("déjà ouverte, son onglet revient au lieu d'en ajouter un", async () => {
    const j = setup({}, [TODAY, "a.md"]);
    await j.journal.open();
    expect(j.tabs()).toEqual([TODAY, "a.md"]);
    expect(j.columns.columns().list[0]?.activeTab).toBe(j.columns.columns().list[0]?.tabs[0]?.id);
  });

  it("sur l'accueil, rien ne se passe", async () => {
    const j = setup();
    j.screen.show(welcome);
    await j.journal.open();
    await j.journal.atLaunch();
    expect(j.log).toEqual([]);
  });

  it("au lancement, elle est ouverte si la case est cochée, sinon rien", async () => {
    const on = setup();
    await on.journal.atLaunch();
    expect(on.tabs()).toEqual(["a.md", TODAY]);
    const off = setup({
      "malorean.journal:/lib": JSON.stringify({ folder: "Journal", atLaunch: false }),
    });
    await off.journal.atLaunch();
    expect([off.log, off.tabs()]).toEqual([[], ["a.md"]]);
  });

  it("le réglage montre et garde les choix de l'espace de travail ouvert", () => {
    const j = setup();
    j.screen.show(workspaceScreen([], (now) => ({ ...now, folders: ["Notes", "Notes/Travail"] })));
    const [group] = j.journal.settingsGroups();
    const folder = group?.querySelector<HTMLSelectElement>("select[name=journalFolder]");
    if (!folder) throw new Error("champ introuvable");
    expect(folder.value).toBe("Journal");
    // Les dossiers de l'espace de travail ouvert, plus « Journal », le choix en cours, même absent.
    expect([...folder.options].map((o) => o.value)).toEqual([
      ...["Notes", "Notes/Travail", "Journal"],
      "\0nouveau",
    ]);
    folder.value = "\0nouveau";
    folder.dispatchEvent(new Event("change"));
    const name = group?.querySelector<HTMLInputElement>(".folder-new-input");
    if (!name) throw new Error("champ du nom introuvable");
    name.value = "Carnet";
    name.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(JSON.parse(j.items.get("malorean.journal:/lib") ?? "")).toEqual({
      folder: "Carnet",
      atLaunch: true,
    });
  });

  it("sans espace de travail ouvert, pas de réglage du journal", () => {
    const j = setup();
    j.screen.show(welcome);
    expect(j.journal.settingsGroups()).toEqual([]);
  });
});
