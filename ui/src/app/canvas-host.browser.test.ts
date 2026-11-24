import { afterEach, describe, expect, it, vi } from "vitest";
import { attachedPath, createCanvasHost, hasCanvasBackend } from "./canvas-host";

const picker = document.createElement("dialog");
const dialog = document.createElement("dialog");
document.body.append(picker, dialog);

const notes = [
  { path: "A/une.md", title: "Une note", folder: "A" },
  { path: "dessin.canvas", title: "dessin", folder: "" },
];
const backend = {
  readCanvas: vi.fn(),
  saveCanvas: vi.fn(),
  chooseExportFile: vi.fn(),
  exportImage: vi.fn(),
  openWebAddress: vi.fn(),
  listAllNotes: async () => notes,
  attachFile: vi.fn(async () => ({ markdown: "![b.png](plan.assets/b%20c.png)" })),
};
const host = () => createCanvasHost({ backend: backend as never, picker, dialog });

afterEach(() => {
  for (const d of [picker, dialog]) if (d.open) d.close();
  vi.restoreAllMocks();
});

describe("ce que le canvas demande à l'application", () => {
  it("le chemin d'un média attaché est celui du lien, depuis la racine", () => {
    expect(attachedPath("Notes/plan.canvas", "![b](plan.assets/b%20c.png)")).toBe(
      "Notes/plan.assets/b c.png",
    );
    expect(attachedPath("plan.canvas", "![b](plan.assets/b.png)")).toBe("plan.assets/b.png");
    expect(attachedPath("plan.canvas", "rien")).toBeNull();
  });

  it("le pont doit avoir tout ce qu'il faut", () => {
    expect(hasCanvasBackend(backend as never)).toBe(true);
    expect(hasCanvasBackend({ readCanvas: backend.readCanvas } as never)).toBe(false);
    expect(hasCanvasBackend({})).toBe(false);
  });

  it("choisir une note propose les notes, jamais les canvas ; Échap rend rien", async () => {
    const choosing = host().chooseNote();
    await vi.waitFor(() => expect(picker.open).toBe(true));
    const labels = [...picker.querySelectorAll(".picker-label")].map((e) => e.textContent);
    expect(labels).toEqual(["Une note"]);
    (picker.querySelector("li") as HTMLElement).click();
    expect(await choosing).toBe("A/une.md");
    const cancelled = host().chooseNote();
    await vi.waitFor(() => expect(picker.open).toBe(true));
    picker.close();
    expect(await cancelled).toBeNull();
  });

  it("choisir un groupe propose ceux dont le nom contient ce qui est tapé", async () => {
    const groups = [
      { id: "a", title: "Phase 1" },
      { id: "b", title: "" },
    ];
    const choosing = host().chooseGroup(groups);
    await vi.waitFor(() => expect(picker.open).toBe(true));
    const input = picker.querySelector("input") as HTMLInputElement;
    expect([...picker.querySelectorAll(".picker-label")].map((e) => e.textContent)).toEqual([
      "Phase 1",
      "Groupe sans nom",
    ]);
    input.value = "phase";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(picker.querySelectorAll("li")).toHaveLength(1);
    (picker.querySelector("li") as HTMLElement).click();
    expect(await choosing).toBe("a");
    const cancelled = host().chooseGroup(groups);
    await vi.waitFor(() => expect(picker.open).toBe(true));
    picker.close();
    expect(await cancelled).toBeNull();
  });

  it("saisir un texte passe par la fenêtre de saisie", async () => {
    const asking = host().askText("Adresse", "https://", "Enregistrer");
    await vi.waitFor(() => expect(dialog.open).toBe(true));
    expect(dialog.textContent).toContain("Adresse");
    (dialog.querySelector("input") as HTMLInputElement).value = "https://x.fr";
    (dialog.querySelector("button.primary") as HTMLButtonElement).click();
    expect(await asking).toBe("https://x.fr");
  });

  it("un média choisi sur le Mac est joint au canvas, son chemin rendu", async () => {
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      const transfer = new DataTransfer();
      transfer.items.add(new File(["x"], "b c.png", { type: "image/png" }));
      this.files = transfer.files;
      this.dispatchEvent(new Event("change"));
    });
    expect(await host().chooseMedia("plan.canvas")).toBe("plan.assets/b c.png");
    expect(backend.attachFile).toHaveBeenCalledWith("plan.canvas", expect.any(File), {
      kind: "dropped",
      fileName: "b c.png",
    });
  });

  it("annuler le choix d'un média ne joint rien", async () => {
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      this.dispatchEvent(new Event("cancel"));
    });
    backend.attachFile.mockClear();
    expect(await host().chooseMedia("plan.canvas")).toBeNull();
    expect(backend.attachFile).not.toHaveBeenCalled();
  });

  it("copier écrit dans le presse-papiers", () => {
    const write = vi.fn(async () => undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(write);
    host().copy("https://x.fr");
    expect(write).toHaveBeenCalledWith("https://x.fr");
  });
});
