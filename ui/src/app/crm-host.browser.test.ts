import { describe, expect, it, vi } from "vitest";
import { createCrmHost, hasCrmBackend } from "./crm-host";

const backend = {
  readCrm: vi.fn(),
  createCrmAction: vi.fn(),
  moveCrmAction: vi.fn(),
  changeCrmAction: vi.fn(),
  deleteCrmAction: vi.fn(),
  changeCrmStages: vi.fn(),
  copyPlainText: vi.fn(),
  openWebAddress: vi.fn(),
  listAllNotes: vi.fn(async () => [
    { path: "a/plan.md", title: "Plan de la salle", folder: "a" },
    { path: "cahier.md", title: "Cahier des charges", folder: "" },
  ]),
};

describe("pont du CRM d'une colonne", () => {
  it("n'est complet que si chaque commande du Kanban est là", () => {
    expect(hasCrmBackend(backend)).toBe(true);
    for (const key of Object.keys(backend))
      expect(hasCrmBackend({ ...backend, [key]: undefined })).toBe(false);
    expect(hasCrmBackend({})).toBe(false);
  });

  it("confirme par la fenêtre de confirmation : accepté, puis refusé", async () => {
    const dialog = document.createElement("dialog");
    document.body.replaceChildren(dialog);
    const host = createCrmHost({ backend: backend as never, dialog, picker: dialog });
    expect(host.backend).toBe(backend);
    const asking = host.confirm("Retirer l'étape ?", "Retirer");
    expect(dialog.querySelector(".confirmation-question")?.textContent).toBe("Retirer l'étape ?");
    (dialog.querySelector("button.danger") as HTMLButtonElement).click();
    expect(await asking).toBe(true);
    const refusing = host.confirm("Retirer ?", "Retirer");
    dialog.close();
    expect(await refusing).toBe(false);
  });

  it("fait choisir une note par la recherche de notes : son titre, ou rien si on annule", async () => {
    const picker = document.createElement("dialog");
    document.body.replaceChildren(picker);
    const host = createCrmHost({
      backend: backend as never,
      dialog: document.createElement("dialog"),
      picker,
    });
    const choosing = host.chooseNote();
    await vi.waitFor(() => expect(picker.querySelectorAll(".picker-option")).toHaveLength(2));
    expect(picker.getAttribute("aria-label")).toBe("Lier une note");
    expect(picker.querySelector("input")?.placeholder).toBe("Titre de la note");
    expect(picker.querySelector(".picker-detail")?.textContent).toBe("a");
    (picker.querySelectorAll(".picker-option")[1] as HTMLElement).click();
    expect(await choosing).toBe("Cahier des charges");
    const cancelling = host.chooseNote();
    await vi.waitFor(() => expect(picker.open).toBe(true));
    picker.close();
    expect(await cancelling).toBeNull();
  });
});
