import { beforeEach, describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  libraryScreen,
  recordedScreen,
  settle,
} from "../../test-support/app-fixture";
import type { LibraryNoteItem } from "../bridge";
import { createLayout } from "../screens/layout";
import { columnsStarted, noteOpened } from "../state/columns";
import { welcome } from "../state/screen";
import { createTemplates } from "./templates";

const root = document.createElement("div");
const layout = createLayout(root);
const NOTES: LibraryNoteItem[] = [
  { path: "Modèles/reunion.md", title: "Réunion", folder: "Modèles" },
  { path: "Modèles/journal.md", title: "Journal", folder: "Modèles" },
  { path: "courses.md", title: "Courses", folder: "" },
];

function setup(stored: Record<string, string> = {}) {
  const items = new Map(Object.entries(stored));
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
  const log: string[] = [];
  const shown: string[] = [];
  const { screen } = recordedScreen(
    libraryScreen([], (s) => ({ ...s, folders: ["Modèles", "Travail"], folder: "Travail" })),
  );
  const columns = fakeColumns(noteOpened(columnsStarted, "a.md"));
  const pane = fakePane("a.md");
  columns.panes.set(columns.columns().active, pane);
  const templates = createTemplates({
    backend: {
      listAllNotes: async () => NOTES,
      createNoteFromTemplate: async (template, folder) => {
        log.push(`créer ${folder} depuis ${template}`);
        return { path: "Travail/reunion.md" };
      },
    },
    storage,
    screen,
    columns: columns.open,
    library: {
      path: () => "/lib",
      refreshList: async () => void log.push("liste"),
      refreshTags: async () => void log.push("étiquettes"),
    },
    picker: layout.picker,
    show: (message) => shown.push(message),
    run: (action) => void action.catch((error: unknown) => log.push(`erreur ${String(error)}`)),
  });
  return { templates, items, log, shown, screen, columns, pane };
}

const options = () =>
  [...layout.picker.querySelectorAll(".picker-option")].map((o) => o.textContent);

beforeEach(() => {
  document.body.replaceChildren(root);
  if (layout.picker.open) layout.picker.close();
});

describe("modèles de note", () => {
  it("sans dossier des modèles, l'action le dit", async () => {
    const t = setup();
    await t.templates.newNote();
    expect(t.shown).toEqual(["Aucun dossier des modèles : choisissez-en un dans les réglages."]);
    expect(layout.picker.open).toBe(false);
  });

  it("un dossier sans note le dit aussi", async () => {
    const t = setup({ "malorean.templates:/lib": "Travail" });
    await t.templates.newNote();
    expect(t.shown).toEqual(["Le dossier des modèles « Travail » ne contient aucune note."]);
    expect(layout.picker.open).toBe(false);
  });

  it("sur l'accueil, rien ne se passe", async () => {
    const t = setup({ "malorean.templates:/lib": "Modèles" });
    t.screen.show(welcome);
    await t.templates.newNote();
    expect([t.shown, layout.picker.open]).toEqual([[], false]);
  });

  it("le modèle choisi au clavier donne une note du dossier affiché, dans un nouvel onglet", async () => {
    const t = setup({ "malorean.templates:/lib": "Modèles" });
    await t.templates.newNote();
    expect(layout.picker.getAttribute("aria-label")).toBe("Nouvelle note depuis un modèle");
    const input = layout.picker.querySelector("input") as HTMLInputElement;
    expect(input.placeholder).toBe("Titre du modèle");
    expect(options()).toEqual(["Réunion", "Journal"]);
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    expect(layout.picker.textContent).toContain("Aucun modèle ne correspond");
    input.value = "réu";
    input.dispatchEvent(new Event("input"));
    layout.picker.querySelector<HTMLElement>(".picker-option")?.click();
    await settle();
    expect(t.columns.log[0]).toBe("enregistrer Modèles/reunion.md");
    expect(t.log).toEqual(["créer Travail depuis Modèles/reunion.md", "liste", "étiquettes"]);
    expect(t.columns.columns().list[0]?.tabs.map((tab) => tab.note)).toEqual([
      "a.md",
      "Travail/reunion.md",
    ]);
    expect(t.pane.editor.focus).toHaveBeenCalled();
  });

  it("le réglage propose les dossiers de la bibliothèque et garde le choix", () => {
    const t = setup({ "malorean.templates:/lib": "Modèles" });
    const [group] = t.templates.settingsGroups();
    const select = group?.querySelector("select") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["", "Modèles", "Travail"]);
    expect(select.value).toBe("Modèles");
    select.value = "Travail";
    select.dispatchEvent(new Event("change"));
    expect(t.items.get("malorean.templates:/lib")).toBe("Travail");
    select.value = "";
    select.dispatchEvent(new Event("change"));
    expect(t.items.has("malorean.templates:/lib")).toBe(false);
  });

  it("sans bibliothèque ouverte, pas de réglage des modèles", () => {
    const t = setup();
    t.screen.show(welcome);
    expect(t.templates.settingsGroups()).toEqual([]);
  });
});
