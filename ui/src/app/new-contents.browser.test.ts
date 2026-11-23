import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedNote } from "../bridge";
import { createNewContents } from "./new-contents";

const calls: string[] = [];
let kind = "workspace";
const dialog = document.createElement("dialog");
document.body.append(dialog);

function setup() {
  return createNewContents({
    backend: {
      createMindMap: async (folder: string, title: string): Promise<SavedNote> => {
        calls.push(`carte ${folder} ${title}`);
        return { path: "carte.md" };
      },
      createResearchNotebook: async () => ({ path: "cahier.md" }),
      addEntry: async () => ({ anchor: "", label: "", text: "", line: 0 }),
    },
    screen: { get: () => ({ kind, folder: "Idees" }) },
    columns: {
      current: () => ({}),
      panes: () => new Map(),
      activePane: () => ({}),
      openNote: async (path: string) => void calls.push(`ouvrir ${path}`),
    },
    workspace: { refreshList: async () => void calls.push("liste") },
    dialog,
    show: () => {},
    error: () => {},
  } as never);
}

const answer = (name: string | null) => {
  const input = dialog.querySelector("input") as HTMLInputElement;
  input.value = name ?? "";
  if (name === null) dialog.close();
  else (dialog.querySelector("button.primary") as HTMLButtonElement).click();
};

beforeEach(() => {
  calls.length = 0;
  kind = "workspace";
  if (dialog.open) dialog.close();
});

describe("nouvelle carte mentale", () => {
  it("demande le nom, crée la carte dans le dossier donné, la liste est relue et la carte s'ouvre", async () => {
    const creating = setup().createMindMap("Clic");
    answer("Projet");
    await creating;
    expect(calls).toEqual(["carte Clic Projet", "liste", "ouvrir carte.md"]);
  });

  it("sans dossier donné, c'est le dossier affiché", async () => {
    const creating = setup().createMindMap();
    answer("Projet");
    await creating;
    expect(calls[0]).toBe("carte Idees Projet");
  });

  it("refuse un nom vide : la demande revient ; Échap annule", async () => {
    const creating = setup().createMindMap();
    answer("   ");
    await vi.waitFor(() => expect(dialog.open).toBe(true));
    answer(null);
    await creating;
    expect(calls).toEqual([]);
  });

  it("ne fait rien hors d'un espace de travail", async () => {
    kind = "welcome";
    await setup().createMindMap();
    expect(dialog.open).toBe(false);
    expect(calls).toEqual([]);
  });
});
