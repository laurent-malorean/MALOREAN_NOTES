import { describe, expect, it } from "vitest";
import { settle } from "../../test-support/app-fixture";
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
    actions: { closeSearch: () => log.push("fermer la recherche") },
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

  it("la croix de la fenêtre de recherche la ferme", () => {
    const { layout, log } = setup();
    layout.searchClose.click();
    expect(log).toEqual(["fermer la recherche"]);
  });
});
