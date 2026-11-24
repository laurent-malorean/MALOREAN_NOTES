import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedNote } from "../bridge";
import { createNewContents } from "./new-contents";

const calls: string[] = [];
let kind = "workspace";
let active: string | null = null;
const dialog = document.createElement("dialog");
document.body.append(dialog);

function setup() {
  return createNewContents({
    backend: {
      createMindMap: async (folder: string, title: string): Promise<SavedNote> => {
        calls.push(`carte ${folder} ${title}`);
        return { path: "carte.md" };
      },
      createCanvas: async (folder: string, title: string): Promise<SavedNote> => {
        calls.push(`canvas ${folder} ${title}`);
        return { path: "plan.canvas" };
      },
      createResearchNotebook: async () => ({ path: "cahier.md" }),
      addEntry: async () => ({ anchor: "", label: "", text: "", line: 0 }),
    },
    screen: { get: () => ({ kind, folder: "Idees" }) },
    columns: {
      current: () => ({}),
      panes: () => new Map(),
      activePane: () => ({ note: () => active }),
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
  active = null;
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

describe("nouveau canvas", () => {
  it("demande le nom, crée le canvas dans le dossier donné, la liste est relue et il s'ouvre", async () => {
    const creating = setup().createCanvas("Clic");
    answer("Plan");
    await creating;
    expect(calls).toEqual(["canvas Clic Plan", "liste", "ouvrir plan.canvas"]);
  });

  it("sans dossier donné, c'est celui du fichier actif, à défaut le dossier affiché", async () => {
    active = "Notes/Projet/idee.md";
    const first = setup().createCanvas();
    answer("Plan");
    await first;
    expect(calls[0]).toBe("canvas Notes/Projet Plan");
    calls.length = 0;
    active = null;
    const second = setup().createCanvas();
    answer("Plan");
    await second;
    expect(calls[0]).toBe("canvas Idees Plan");
  });

  it("refuse un nom vide, Échap annule, rien hors d'un espace de travail", async () => {
    const creating = setup().createCanvas();
    answer(" ");
    await vi.waitFor(() => expect(dialog.open).toBe(true));
    answer(null);
    await creating;
    kind = "welcome";
    await setup().createCanvas();
    expect(calls).toEqual([]);
  });
});
