import { describe, expect, it, vi } from "vitest";
import { createCrmHost, hasCrmBackend } from "./crm-host";

const backend = {
  readCrm: vi.fn(),
  createCrmAction: vi.fn(),
  moveCrmAction: vi.fn(),
  changeCrmAction: vi.fn(),
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
    const host = createCrmHost({ backend: backend as never, dialog });
    expect(host.backend).toBe(backend);
    const asking = host.confirm("Retirer l'étape ?", "Retirer");
    expect(dialog.querySelector(".confirmation-question")?.textContent).toBe("Retirer l'étape ?");
    (dialog.querySelector("button.danger") as HTMLButtonElement).click();
    expect(await asking).toBe(true);
    const refusing = host.confirm("Retirer ?", "Retirer");
    dialog.close();
    expect(await refusing).toBe(false);
  });
});
