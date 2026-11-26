import { beforeEach, describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  workspaceScreen,
  recordedScreen,
  settle,
} from "../../test-support/app-fixture";
import type { WorkspaceNoteItem } from "../bridge";
import { createLayout } from "../screens/layout";
import { columnsStarted, noteOpened } from "../state/columns";
import { welcome } from "../state/screen";
import { createTemplates } from "./templates";

const root = document.createElement("div");
const layout = createLayout(root);
const NOTES: WorkspaceNoteItem[] = [
  { path: "Modèles/reunion.md", title: "Réunion", folder: "Modèles" },
  { path: "Modèles/journal.md", title: "Journal", folder: "Modèles" },
  { path: "courses.md", title: "Courses", folder: "" },
];

interface Setup {
  /** Le dossier des modèles que garde le moteur, s'il y en a un. */
  readonly chosen?: string | null;
  /** Ce que le stockage de la page garde d'avant la fiche 0077. */
  readonly stored?: Record<string, string>;
  /** Le moteur refuse la reprise. */
  readonly importFails?: boolean;
  /** Le moteur ne sait pas dire le choix en cours. */
  readonly readFails?: boolean;
}

function setup({ chosen = null, stored = {}, importFails = false, readFails = false }: Setup = {}) {
  const items = new Map(Object.entries(stored));
  const storage = {
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
  const log: string[] = [];
  const shown: string[] = [];
  const engine = { folder: chosen };
  const { screen } = recordedScreen(
    workspaceScreen([], (s) => ({ ...s, folders: ["Modèles", "Travail"], folder: "Travail" })),
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
      templatesFolder: async () => {
        if (readFails) throw new Error("illisible");
        return engine.folder;
      },
      setTemplatesFolder: async (folder) => {
        engine.folder = folder;
        log.push(`moteur : ${String(folder)}`);
        return null;
      },
      importTemplatesFolders: async (kept) => {
        log.push(`reprise ${JSON.stringify(kept)}`);
        if (importFails) throw new Error("préférences illisibles");
        return kept.length;
      },
      errorMessage: (error) => String((error as Error).message),
    },
    storage,
    screen,
    columns: columns.open,
    workspace: {
      refreshList: async () => void log.push("liste"),
      refreshTags: async () => void log.push("étiquettes"),
    },
    picker: layout.picker,
    show: (message, kind) => shown.push(kind ? `[${kind}] ${message}` : message),
    run: (action) => void action.catch((error: unknown) => log.push(`erreur ${String(error)}`)),
  });
  return { templates, items, engine, log, shown, screen, columns, pane };
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
    expect(t.shown).toEqual([
      "[info] Aucun dossier des modèles : choisissez-en un dans les réglages.",
    ]);
    expect(layout.picker.open).toBe(false);
  });

  it("un dossier sans note le dit aussi", async () => {
    const t = setup({ chosen: "Travail" });
    await t.templates.newNote();
    expect(t.shown).toEqual(["[info] Le dossier des modèles « Travail » ne contient aucune note."]);
    expect(layout.picker.open).toBe(false);
  });

  it("sur l'accueil, rien ne se passe", async () => {
    const t = setup({ chosen: "Modèles" });
    t.screen.show(welcome);
    await t.templates.newNote();
    expect([t.shown, layout.picker.open]).toEqual([[], false]);
  });

  it("le modèle choisi au clavier donne une note du dossier affiché, dans un nouvel onglet", async () => {
    const t = setup({ chosen: "Modèles" });
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

  it("le réglage propose les dossiers de l'espace de travail et garde le choix dans le moteur", async () => {
    const t = setup({ chosen: "Modèles" });
    const [group] = t.templates.settingsGroups();
    expect(group?.querySelector("legend")?.textContent).toBe("Modèles");
    expect(group?.querySelector("select")).toBeNull();
    await settle();
    const select = group?.querySelector("select") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["", "Modèles", "Travail"]);
    expect(select.value).toBe("Modèles");
    select.value = "Travail";
    select.dispatchEvent(new Event("change"));
    await settle();
    expect(t.engine.folder).toBe("Travail");
    select.value = "";
    select.dispatchEvent(new Event("change"));
    await settle();
    expect(t.engine.folder).toBeNull();
    expect(t.log).toEqual(["moteur : Travail", "moteur : null"]);
  });

  it("le réglage sans choix en cours montre « Aucun »", async () => {
    const t = setup();
    const [group] = t.templates.settingsGroups();
    await settle();
    expect(group?.querySelector("select")?.selectedOptions[0]?.text).toBe("Aucun");
  });

  it("le choix est celui du moteur : l'interface n'en garde plus de copie", async () => {
    const t = setup({ chosen: "Modèles" });
    const [group] = t.templates.settingsGroups();
    await settle();
    const select = group?.querySelector("select") as HTMLSelectElement;
    select.value = "Travail";
    select.dispatchEvent(new Event("change"));
    await settle();
    expect(t.items.size).toBe(0);
  });

  it("une erreur du moteur à la lecture du choix est montrée et la ligne ne paraît pas", async () => {
    const t = setup({ readFails: true });
    const [group] = t.templates.settingsGroups();
    await settle();
    expect(group?.querySelector("select")).toBeNull();
    expect(group?.querySelector("legend")?.textContent).toBe("Modèles");
    expect(t.log).toEqual(["erreur Error: illisible"]);
  });

  it("sans espace de travail ouvert, pas de réglage des modèles", () => {
    const t = setup();
    t.screen.show(welcome);
    expect(t.templates.settingsGroups()).toEqual([]);
  });

  describe("reprise de ce que l'interface gardait", () => {
    const STORED = {
      "malorean.templates:/Users/moi/Notes": "Modèles",
      "malorean.templates:/Users/moi/Travail": "Gabarits",
      "malorean.journal:/Users/moi/Notes": '{"folder":"Journal"}',
    };

    it("passe au moteur chaque dossier gardé, puis efface ces clés seulement", async () => {
      const t = setup({ stored: STORED });
      await t.templates.migrate();
      expect(t.log).toEqual([
        'reprise [{"location":"/Users/moi/Notes","folder":"Modèles"},{"location":"/Users/moi/Travail","folder":"Gabarits"}]',
      ]);
      expect([...t.items.keys()]).toEqual(["malorean.journal:/Users/moi/Notes"]);
      expect(t.shown).toEqual([]);
    });

    it("n'appelle pas le moteur quand il n'y a rien à reprendre", async () => {
      const t = setup({ stored: { "malorean.journal:/Users/moi/Notes": "{}" } });
      await t.templates.migrate();
      expect(t.log).toEqual([]);
      expect(t.items.size).toBe(1);
    });

    it("une reprise refusée est dite, les clés restent pour le prochain lancement, et rien ne rejette", async () => {
      const t = setup({ stored: STORED, importFails: true });
      await expect(t.templates.migrate()).resolves.toBeUndefined();
      expect(t.shown).toEqual(["[error] préférences illisibles"]);
      expect(t.items.size).toBe(3);
    });
  });
});
