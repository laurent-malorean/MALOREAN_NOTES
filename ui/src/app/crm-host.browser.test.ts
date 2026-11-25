import { describe, expect, it, vi } from "vitest";
import type { LinkableItem } from "../bridge";
import { createCrmHost, hasCrmBackend } from "./crm-host";

const backend = {
  readCrm: vi.fn(),
  createCrmAction: vi.fn(),
  moveCrmAction: vi.fn(),
  changeCrmAction: vi.fn(),
  deleteCrmAction: vi.fn(),
  changeCrmStages: vi.fn(),
  createCrmPerson: vi.fn(),
  createCrmCompany: vi.fn(),
  createCrmProject: vi.fn(),
  changeCrmProject: vi.fn(),
  deleteCrmProject: vi.fn(),
  changeCrmPerson: vi.fn(),
  deleteCrmPerson: vi.fn(),
  changeCrmCompany: vi.fn(),
  deleteCrmCompany: vi.fn(),
  crmEmailIsKnown: vi.fn(),
  copyPlainText: vi.fn(),
  openWebAddress: vi.fn(),
  listLinkable: vi.fn(async (): Promise<LinkableItem[]> => [
    {
      path: "a/plan.md",
      title: "Plan de la salle",
      folder: "a",
      contentType: "note",
      link: "Plan de la salle",
    },
    {
      path: "cahier.md",
      title: "Cahier des charges",
      folder: "",
      contentType: "note",
      link: "Cahier des charges",
    },
    {
      path: "Idées/Plan.canvas",
      title: "Plan",
      folder: "Idées",
      contentType: "canvas",
      link: "Plan.canvas",
    },
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

  it("fait choisir un contenu par la recherche : le lien à écrire, ou rien si on annule", async () => {
    const picker = document.createElement("dialog");
    document.body.replaceChildren(picker);
    const host = createCrmHost({
      backend: backend as never,
      dialog: document.createElement("dialog"),
      picker,
    });
    const choosing = host.chooseNote();
    await vi.waitFor(() => expect(picker.querySelectorAll(".picker-option")).toHaveLength(3));
    expect(picker.getAttribute("aria-label")).toBe("Lier une note");
    expect(picker.querySelector("input")?.placeholder).toBe("Nom du contenu");
    expect(picker.querySelector(".picker-detail")?.textContent).toBe("a");
    expect(picker.querySelectorAll(".picker-label svg")).toHaveLength(3);
    (picker.querySelectorAll(".picker-option")[1] as HTMLElement).click();
    expect(await choosing).toBe("Cahier des charges");
    const canvas = host.chooseNote();
    await vi.waitFor(() => expect(picker.querySelectorAll(".picker-option")).toHaveLength(3));
    (picker.querySelectorAll(".picker-option")[2] as HTMLElement).click();
    expect(await canvas).toBe("Plan.canvas");
    const cancelling = host.chooseNote();
    await vi.waitFor(() => expect(picker.open).toBe(true));
    picker.close();
    expect(await cancelling).toBeNull();
  });
});
