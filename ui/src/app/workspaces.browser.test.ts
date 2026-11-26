import { describe, expect, it } from "vitest";
import { fakeColumns, recordedScreen, workspaceScreen } from "../../test-support/app-fixture";
import type { WorkspaceInfo, WorkspaceItem } from "../bridge";
import { type Screen, welcome } from "../state/screen";
import { createWorkspaces } from "./workspaces";

const NOTES: WorkspaceItem = { name: "Notes", active: true };
const TRAVAIL: WorkspaceItem = { name: "Travail", active: false };

function setup(start: Screen = workspaceScreen()) {
  const { screen } = recordedScreen(start);
  const columns = fakeColumns();
  const calls: string[] = [];
  const state = {
    list: [NOTES, TRAVAIL] as WorkspaceItem[],
    folder: { name: "Perso", path: "/Users/moi/Perso" } as { name: string; path: string } | null,
    typed: "Mon perso" as string | null,
    removalAccepted: true,
  };
  const info = (name: string): WorkspaceInfo => ({ name, path: `/${name}` });
  const picker = document.createElement("dialog");
  document.body.replaceChildren(picker);
  const workspaces = createWorkspaces({
    backend: {
      listWorkspaces: async () => (calls.push("liste"), state.list),
      chooseWorkspaceFolder: async () => (calls.push("choisir un dossier"), state.folder),
      addWorkspace: async (name, folder) => (calls.push(`ajouter ${name} ${folder}`), info(name)),
      openWorkspace: async (name) => (calls.push(`ouvrir ${name}`), info(name)),
      renameWorkspace: async (name, newName) => (
        calls.push(`renommer ${name} ${newName}`),
        newName.trim()
      ),
      removeWorkspace: async (name) => (calls.push(`retirer ${name}`), null),
    },
    screen,
    columns: columns.open,
    workspace: { open: async (opened) => void calls.push(`montrer ${opened.name} ${opened.path}`) },
    picker,
    askName: async ({ question, initial, confirm }) => (
      calls.push(`demander « ${question} » ${initial} ${confirm}`),
      state.typed
    ),
    askRemoval: async (name) => (calls.push(`confirmer ${name}`), state.removalAccepted),
    run: (action) => void action,
  });
  return { workspaces, screen, columns, calls, state, picker };
}

const flushed = (t: ReturnType<typeof setup>) =>
  t.columns.log.filter((l) => l === "tout enregistrer");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("espaces de travail", () => {
  it("ajouter fait choisir un dossier puis un nom, celui du dossier proposé, enregistre et ouvre", async () => {
    const t = setup();
    await t.workspaces.add();
    expect(t.calls).toEqual([
      "choisir un dossier",
      "demander « Nom de l'espace de travail » Perso Ajouter",
      "ajouter Mon perso /Users/moi/Perso",
      "montrer Mon perso /Mon perso",
    ]);
    expect(flushed(t)).toHaveLength(1);
  });

  it("renoncer au dossier ou au nom n'ajoute rien", async () => {
    const t = setup();
    t.state.folder = null;
    await t.workspaces.add();
    expect(t.calls).toEqual(["choisir un dossier"]);
    t.state.folder = { name: "Perso", path: "/p" };
    t.state.typed = null;
    t.calls.length = 0;
    await t.workspaces.add();
    expect(t.calls).toHaveLength(2);
    expect(flushed(t)).toEqual([]);
  });

  it("passer à un autre espace enregistre d'abord ce qui est tapé, puis l'ouvre", async () => {
    const t = setup();
    await t.workspaces.switchTo("Travail");
    expect(t.calls).toEqual(["ouvrir Travail", "montrer Travail /Travail"]);
    expect(t.columns.log[0]).toBe("tout enregistrer");
  });

  it("passer à l'espace déjà ouvert ne fait rien", async () => {
    const t = setup();
    await t.workspaces.switchTo("Notes");
    expect(t.calls).toEqual([]);
    expect(flushed(t)).toEqual([]);
  });

  it("depuis l'accueil, passer à un espace l'ouvre", async () => {
    const t = setup(welcome);
    await t.workspaces.switchTo("Notes");
    expect(t.calls).toEqual(["ouvrir Notes", "montrer Notes /Notes"]);
  });

  it("renommer l'espace ouvert propose son nom, puis l'écran montre le nom gardé", async () => {
    const t = setup();
    t.state.typed = " Perso ";
    await t.workspaces.rename();
    expect(t.calls).toEqual([
      "demander « Nouveau nom de l'espace de travail » Notes Renommer",
      "renommer Notes  Perso ",
    ]);
    const now = t.screen.get();
    expect(now.kind === "workspace" && now.workspace).toEqual({ name: "Perso", path: "/lib" });
  });

  it("renoncer à renommer, ou renommer depuis l'accueil, ne fait rien", async () => {
    const t = setup();
    t.state.typed = null;
    await t.workspaces.rename();
    expect(t.calls).toHaveLength(1);
    const w = setup(welcome);
    await w.workspaces.rename();
    expect(w.calls).toEqual([]);
  });

  it("retirer demande d'abord ; refusé, rien n'est retiré", async () => {
    const t = setup();
    await t.workspaces.remove("Travail");
    expect(t.calls).toEqual(["confirmer Travail", "retirer Travail"]);
    t.state.removalAccepted = false;
    t.calls.length = 0;
    await t.workspaces.remove("Travail");
    expect(t.calls).toEqual(["confirmer Travail"]);
  });

  it("le menu montre chaque espace, l'ouvert coché, puis ajouter, renommer et retirer les autres", async () => {
    const t = setup();
    const entries = await t.workspaces.menu();
    expect(entries.map((entry) => entry.label)).toEqual([
      "Notes",
      "Travail",
      "Ajouter un espace de travail…",
      "Renommer l'espace de travail…",
      "Retirer « Travail » de la liste…",
    ]);
    expect(entries.map((entry) => entry.checked)).toEqual([
      true,
      false,
      undefined,
      undefined,
      undefined,
    ]);
    expect(entries.map((entry) => entry.stateName)).toEqual([
      "ouvert",
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("chaque choix du menu a son icône : un dossier pour chaque espace, puis ajouter, renommer, retirer", async () => {
    const t = setup();
    const entries = await t.workspaces.menu();
    expect(entries.map((entry) => entry.icon)).toEqual([
      "workspace",
      "workspace",
      "add",
      "edit",
      "remove",
    ]);
  });

  it("un séparateur précède l'ajout d'un espace de travail, et lui seul", async () => {
    const t = setup();
    const entries = await t.workspaces.menu();
    expect(entries.map((entry) => entry.separatorBefore === true)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it("chaque choix du menu fait ce qu'il dit", async () => {
    const t = setup();
    const entries = await t.workspaces.menu();
    t.calls.length = 0;
    entries.forEach((entry) => entry.run());
    await settle();
    expect(t.calls).toEqual(
      expect.arrayContaining([
        "ouvrir Travail",
        "choisir un dossier",
        "demander « Nouveau nom de l'espace de travail » Notes Renommer",
        "confirmer Travail",
      ]),
    );
    expect(t.calls).not.toContain("ouvrir Notes");
  });

  it("au clavier, on choisit l'espace où passer ; l'ouvert est marqué", async () => {
    const t = setup();
    await t.workspaces.choose();
    expect(t.picker.querySelector("input")?.getAttribute("aria-label")).toBe(
      "Changer d'espace de travail",
    );
    const options = [...t.picker.querySelectorAll(".picker-option")];
    expect(options.map((o) => o.textContent)).toEqual(["Notesouvert", "Travail"]);
    (t.picker.querySelector("input") as HTMLInputElement).value = "trav";
    t.picker.querySelector("input")?.dispatchEvent(new Event("input"));
    expect([...t.picker.querySelectorAll(".picker-option")].map((o) => o.textContent)).toEqual([
      "Travail",
    ]);
    expect(t.picker.querySelector("input")?.placeholder).toBe("Nom de l'espace de travail");
    (t.picker.querySelector("input") as HTMLInputElement).value = "perso";
    t.picker.querySelector("input")?.dispatchEvent(new Event("input"));
    expect(t.picker.querySelector(".picker-empty")?.textContent).toBe(
      "Aucun espace de travail ne correspond",
    );
    (t.picker.querySelector("input") as HTMLInputElement).value = "trav";
    t.picker.querySelector("input")?.dispatchEvent(new Event("input"));
    (t.picker.querySelector(".picker-option") as HTMLElement).click();
    await settle();
    expect(t.calls).toContain("ouvrir Travail");
  });

  it("au clavier, on retire un espace parmi ceux qui ne sont pas ouverts", async () => {
    const t = setup();
    await t.workspaces.chooseRemoval();
    const options = [...t.picker.querySelectorAll(".picker-option")];
    expect(options.map((o) => o.textContent)).toEqual(["Travail"]);
    expect(t.picker.querySelector("input")?.getAttribute("aria-label")).toBe(
      "Retirer un espace de travail",
    );
    (options[0] as HTMLElement).click();
    await settle();
    expect(t.calls).toEqual(["liste", "confirmer Travail", "retirer Travail"]);
  });
});
