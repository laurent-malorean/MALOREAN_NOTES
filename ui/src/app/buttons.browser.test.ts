import { describe, expect, it } from "vitest";
import { recordedScreen, settle } from "../../test-support/app-fixture";
import { createLayout } from "../screens/layout";
import { connectButtons } from "./buttons";

function setup() {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const layout = createLayout(root);
  const log: string[] = [];
  connectButtons(layout, {
    workspaces: {
      add: async () => void log.push("ajouter un espace de travail"),
      choose: async () => void log.push("changer d'espace de travail"),
      menu: async () => {
        log.push("menu des espaces de travail");
        return [];
      },
    },
    workspace: { createNote: async () => void log.push("nouvelle note") },
    search: { type: (query) => log.push(`chercher ${query}`) },
    trash: { show: async () => void log.push("corbeille") },
    folders: { startCreation: () => log.push("nouveau dossier") },
    screen: recordedScreen().screen,
    templates: { newNote: async () => void log.push("note depuis un modèle") },
    actions: {
      closeSearch: () => log.push("fermer la recherche"),
      newNote: (folder) => log.push(`note dans « ${folder} »`),
      newNotebook: (folder) => log.push(`cahier dans « ${folder} »`),
      newMindMap: (folder) => log.push(`carte mentale dans « ${folder} »`),
      newCanvas: (folder) => log.push(`canvas dans « ${folder} »`),
      newCrm: (folder) => log.push(`CRM dans « ${folder} »`),
    },
    error: (error) => log.push(`erreur ${String(error)}`),
    run: (action) => void action.catch((error: unknown) => log.push(`erreur ${String(error)}`)),
  });
  return { layout, log };
}

describe("boutons de la fenêtre", () => {
  it("chaque bouton lance son action", async () => {
    const { layout, log } = setup();
    layout.addButton.click();
    layout.switchButton.click();
    layout.newNoteButton.click();
    layout.trashButton.click();
    layout.newFolderButton.click();
    await settle();
    expect(log).toEqual([
      "ajouter un espace de travail",
      "changer d'espace de travail",
      "nouvelle note",
      "corbeille",
      "nouveau dossier",
    ]);
  });

  it("le sélecteur ouvre le menu des espaces de travail, la recherche suit la frappe", async () => {
    const { layout, log } = setup();
    layout.workspaceSwitcher.click();
    layout.searchField.value = "rome";
    layout.searchField.dispatchEvent(new Event("input"));
    await settle();
    expect(log).toEqual(["menu des espaces de travail", "chercher rome"]);
  });

  it("le « + » crée une note, le chevron ouvre le menu de création dont chaque entrée crée dans le dossier affiché", async () => {
    const { layout, log } = setup();
    layout.newNoteButton.click();
    layout.newContentButton.click();
    await settle();
    expect(log).toEqual(["nouvelle note"]);
    const entries = [...document.querySelectorAll<HTMLButtonElement>(".context-menu button")];
    expect(entries.map((entry) => entry.querySelector(".context-menu-label")?.textContent)).toEqual(
      ["Note", "Note depuis un modèle", "Cahier de recherche", "Carte mentale", "Canvas", "CRM"],
    );
    for (const entry of entries) entry.click();
    await settle();
    expect(log.slice(1)).toEqual([
      "note dans «  »",
      "note depuis un modèle",
      "cahier dans «  »",
      "carte mentale dans «  »",
      "canvas dans «  »",
      "CRM dans «  »",
    ]);
  });

  it("la croix de la fenêtre de recherche la ferme", () => {
    const { layout, log } = setup();
    layout.searchClose.click();
    expect(log).toEqual(["fermer la recherche"]);
  });
});
