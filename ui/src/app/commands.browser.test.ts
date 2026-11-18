import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeColumns,
  fakePane,
  libraryScreen,
  recordedScreen,
  settle,
} from "../../test-support/app-fixture";
import { createLayout } from "../screens/layout";
import { activeNote, columnsStarted, noteOpened } from "../state/columns";
import { COMMANDS } from "../state/commands";
import { welcome } from "../state/screen";
import { commandActions, connectCommands, type CommandsDeps } from "./commands";

const root = document.createElement("div");
const layout = createLayout(root);
const log: string[] = [];
const { screen } = recordedScreen(libraryScreen());
let columns = fakeColumns();
let fullScreen = false;
let tagFilter = false;
let recentPaths: string[] = [];

/** Ce que les commandes pilotent, chaque demande notée dans `log`. */
const deps: CommandsDeps = {
  backend: {
    listAllNotes: async () => [
      { path: "rome.md", title: "Rome", folder: "voyages" },
      { path: "lyon.md", title: "Lyon", folder: "" },
    ],
  },
  screen,
  columns: {
    update: (next) => columns.open.update(next),
    split: async () => void log.push("diviser"),
    openNote: async (path) => void log.push(`ouvrir ${path}`),
    activePane: () => columns.open.activePane(),
  },
  writing: {
    toggleFocus: () => log.push("focus"),
    toggleTypewriter: () => log.push("machine à écrire"),
    toggleOutline: () => log.push("plan"),
  },
  window: {
    toggleFullScreen: async () => void log.push("plein écran"),
    leaveFullScreen: () => (log.push("quitter le plein écran"), fullScreen),
    toggleSidePanels: () => log.push("panneaux"),
  },
  picker: layout.picker,
  searchField: layout.searchField,
  library: {
    createNote: async () => void log.push("nouvelle note"),
    choose: async () => void log.push("changer de dossier"),
    sortBy: async (order) => void log.push(`trier par ${order}`),
  },
  templates: { newNote: async () => void log.push("depuis un modèle") },
  journal: { open: async () => void log.push("note du jour") },
  folders: { startCreation: () => log.push("nouveau dossier") },
  trash: { show: async () => void log.push("corbeille") },
  settings: { open: () => log.push("réglages") },
  tags: { clear: () => (log.push("retirer le filtre"), tagFilter) },
  recent: { paths: () => recentPaths },
  run: (action) => void action.catch((error: unknown) => log.push(`erreur ${String(error)}`)),
};
connectCommands(deps);

const picker = () => layout.picker;
const options = () => [...picker().querySelectorAll(".picker-option")].map((o) => o.textContent);
const press = (key: string, modifiers: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  document.body.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  document.body.replaceChildren(root);
  if (picker().open) picker().close();
  log.length = 0;
  fullScreen = false;
  recentPaths = [];
  screen.show(libraryScreen());
  columns = fakeColumns(["a.md", "b.md", "c.md"].reduce(noteOpened, columnsStarted));
  columns.panes.set(columns.columns().active, fakePane("c.md"));
});

describe("commandes de la palette", () => {
  it("chaque commande lance son action", async () => {
    const actions = commandActions(deps);
    for (const id of [
      "new-note",
      "new-note-from-template",
      "daily-note",
      "new-folder",
      "toggle-focus",
      "toggle-typewriter",
      "toggle-outline",
      "toggle-full-screen",
      "toggle-side-panels",
      "split-column",
      "show-trash",
      "open-settings",
      "choose-library",
    ] as const)
      actions[id]();
    await settle();
    expect(log).toEqual([
      "nouvelle note",
      "depuis un modèle",
      "note du jour",
      "nouveau dossier",
      "focus",
      "machine à écrire",
      "plan",
      "plein écran",
      "panneaux",
      "diviser",
      "corbeille",
      "réglages",
      "changer de dossier",
    ]);
  });

  it("chercher met le curseur dans la recherche, ou dans la note", () => {
    const actions = commandActions(deps);
    const focus = vi.spyOn(layout.searchField, "focus");
    actions["search-library"]();
    expect(focus).toHaveBeenCalled();
    actions["find-in-note"]();
    expect(columns.open.activePane().editor.openFind).toHaveBeenCalled();
  });

  it("les onglets se ferment et se parcourent dans la colonne active", async () => {
    const actions = commandActions(deps);
    actions["previous-tab"]();
    await settle();
    expect(activeNote(columns.columns())).toBe("b.md");
    actions["next-tab"]();
    await settle();
    expect(activeNote(columns.columns())).toBe("c.md");
    actions["close-tab"]();
    await settle();
    expect(columns.columns().list[0]?.tabs.map((tab) => tab.note)).toEqual(["a.md", "b.md"]);
  });

  it("l'ouverture rapide propose les notes de toute la bibliothèque et ouvre la choisie", async () => {
    commandActions(deps)["quick-open"]();
    await settle();
    expect(picker().open).toBe(true);
    expect(picker().getAttribute("aria-label")).toBe("Ouvrir une note");
    const input = picker().querySelector("input") as HTMLInputElement;
    expect(input.placeholder).toBe("Titre de la note");
    expect(options()).toEqual(["Romevoyages", "Lyon"]);
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    expect(picker().textContent).toContain("Aucune note ne correspond");
    input.value = "lyo";
    input.dispatchEvent(new Event("input"));
    picker().querySelector<HTMLElement>(".picker-option")?.click();
    await settle();
    expect(log).toEqual(["ouvrir lyon.md"]);
  });

  it("un nouvel onglet montre la note choisie après l'onglet actif, même déjà ouverte", async () => {
    commandActions(deps)["new-tab"]();
    await settle();
    expect(picker().getAttribute("aria-label")).toBe("Nouvel onglet");
    picker().querySelector<HTMLElement>(".picker-option")?.click();
    await settle();
    expect(columns.columns().list[0]?.tabs.map((tab) => tab.note)).toEqual([
      "a.md",
      "b.md",
      "c.md",
      "rome.md",
    ]);
  });

  it("trier la liste propose les deux tris, marque celui en cours et applique le choisi", async () => {
    screen.show(libraryScreen([], (now) => ({ ...now, order: "title" })));
    commandActions(deps)["sort-notes"]();
    expect(picker().getAttribute("aria-label")).toBe("Trier la liste");
    expect(options()).toEqual(["Date de modification", "Titreactuel"]);
    const input = picker().querySelector("input") as HTMLInputElement;
    expect(input.placeholder).toBe("Trier par");
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    expect(picker().textContent).toContain("Aucun tri ne correspond");
    input.value = "modif";
    input.dispatchEvent(new Event("input"));
    picker().querySelector<HTMLElement>(".picker-option")?.click();
    await settle();
    expect(log).toEqual(["trier par modified"]);
  });

  it("l'ouverture rapide propose d'abord les notes récentes, tant que rien n'est tapé", async () => {
    recentPaths = ["lyon.md"];
    commandActions(deps)["quick-open"]();
    await settle();
    expect(options()).toEqual(["Lyon", "Romevoyages"]);
    const input = picker().querySelector("input") as HTMLInputElement;
    input.value = "o";
    input.dispatchEvent(new Event("input"));
    expect(options()).toEqual(["Romevoyages", "Lyon"]);
  });

  it("sur l'accueil, ni ouverture rapide ni palette", async () => {
    screen.show(welcome);
    commandActions(deps)["quick-open"]();
    press("p", { metaKey: true, shiftKey: true });
    await settle();
    expect(picker().open).toBe(false);
  });
});

describe("raccourcis clavier", () => {
  it("chaque raccourci lance sa commande et garde la touche", async () => {
    const keys: [string, KeyboardEventInit][] = [
      ["f", { metaKey: true, shiftKey: true }],
      ["t", { metaKey: true, shiftKey: true }],
      ["o", { metaKey: true, shiftKey: true }],
      ["f", { metaKey: true, ctrlKey: true }],
      ["s", { metaKey: true, ctrlKey: true }],
      [",", { metaKey: true }],
      ["t", { metaKey: true, ctrlKey: true }],
      ["N", { metaKey: true, shiftKey: true }],
      ["J", { metaKey: true, shiftKey: true }],
    ];
    for (const [key, modifiers] of keys) expect(press(key, modifiers).defaultPrevented).toBe(true);
    await settle();
    expect(log).toEqual([
      "focus",
      "machine à écrire",
      "plan",
      "plein écran",
      "panneaux",
      "réglages",
      "diviser",
      "depuis un modèle",
      "note du jour",
    ]);
  });

  it("les raccourcis des onglets", async () => {
    press("Tab", { ctrlKey: true, shiftKey: true });
    await settle();
    expect(activeNote(columns.columns())).toBe("b.md");
    press("Tab", { ctrlKey: true });
    await settle();
    expect(activeNote(columns.columns())).toBe("c.md");
    expect(press("w", { metaKey: true }).defaultPrevented).toBe(true);
    await settle();
    expect(columns.columns().list[0]?.tabs.map((tab) => tab.note)).toEqual(["a.md", "b.md"]);
    press("t", { metaKey: true });
    await settle();
    expect(picker().getAttribute("aria-label")).toBe("Nouvel onglet");
  });

  it("Cmd+O ouvre l'ouverture rapide", async () => {
    press("o", { metaKey: true });
    await settle();
    expect(picker().getAttribute("aria-label")).toBe("Ouvrir une note");
  });

  it("Échap quitte le plein écran, sinon retire le filtre par étiquette, sinon ne sert pas", () => {
    expect(press("Escape").defaultPrevented).toBe(false);
    expect(log).toEqual(["quitter le plein écran", "retirer le filtre"]);
    log.length = 0;
    tagFilter = true;
    expect(press("Escape").defaultPrevented).toBe(true);
    expect(log).toEqual(["quitter le plein écran", "retirer le filtre"]);
    log.length = 0;
    fullScreen = true;
    expect(press("Escape").defaultPrevented).toBe(true);
    expect(log).toEqual(["quitter le plein écran"]);
    fullScreen = false;
    tagFilter = false;
  });

  it("une touche déjà prise, ou une fenêtre ouverte, n'est pas servie une seconde fois", () => {
    const taken = new KeyboardEvent("keydown", {
      key: "f",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    taken.preventDefault();
    document.body.dispatchEvent(taken);
    layout.settings.showModal();
    press("f", { metaKey: true, shiftKey: true });
    layout.settings.close();
    expect(press("x", { metaKey: true }).defaultPrevented).toBe(false);
    expect(log).toEqual([]);
  });

  it("la palette propose chaque commande et lance la choisie", async () => {
    press("p", { metaKey: true, shiftKey: true });
    expect(picker().getAttribute("aria-label")).toBe("Palette de commandes");
    const input = picker().querySelector("input") as HTMLInputElement;
    expect(input.placeholder).toBe("Nom de la commande");
    expect(options()).toHaveLength(COMMANDS.length);
    expect(options()[0]).toBe("Ouvrir une noteCmd+O");
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    expect(picker().textContent).toContain("Aucune commande ne correspond");
    input.value = "Corbeille";
    input.dispatchEvent(new Event("input"));
    picker().querySelector<HTMLElement>(".picker-option")?.click();
    await settle();
    expect(log).toEqual(["corbeille"]);
  });
});
