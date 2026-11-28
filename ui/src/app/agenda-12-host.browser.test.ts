import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { createAgenda12Host, hasAgenda12Backend } from "./agenda-12-host";

const backend = {
  readAgenda12: vi.fn(),
  changeAgenda12Columns: vi.fn(),
  changeAgenda12Layout: vi.fn(),
  createAgenda12Event: vi.fn(),
  readAgenda12Event: vi.fn(),
  changeAgenda12Event: vi.fn(),
  closeAgenda12Event: vi.fn(),
  reopenAgenda12Event: vi.fn(),
  listCountries: vi.fn(),
  errorMessage: (error: unknown) => `dit : ${String(error)}`,
};

function host(currentYear?: () => number) {
  const dialog = document.createElement("dialog");
  document.body.replaceChildren(dialog);
  const focused: string[] = [];
  const opened: string[] = [];
  const trash = { trashEvent: vi.fn(async () => {}) };
  const columns = {
    openNote: async (path: string) => void opened.push(path),
    activePane: () => ({ focusEventTitle: () => focused.push("titre") }) as never,
  };
  return {
    host: createAgenda12Host({ backend, dialog, columns, trash, currentYear }),
    dialog,
    opened,
    focused,
    trash,
  };
}

describe("pont de l'agenda 12 d'une colonne", () => {
  it("n'est complet que si chaque commande de l'agenda 12 est là", () => {
    expect(hasAgenda12Backend(backend)).toBe(true);
    for (const key of Object.keys(backend))
      expect(hasAgenda12Backend({ ...backend, [key]: undefined })).toBe(false);
    expect(hasAgenda12Backend({})).toBe(false);
  });

  it("donne le pont, et le message des erreurs de Rust", () => {
    const { host: deps } = host();
    expect(deps.backend).toBe(backend);
    expect(deps.errorText("x")).toBe("dit : x");
  });

  it("donne l'année en cours, de l'horloge du Mac par défaut ou de celle qu'on lui injecte", () => {
    expect(host().host.currentYear()).toBe(new Date().getFullYear());
    expect(host(() => 2031).host.currentYear()).toBe(2031);
  });

  it("ouvre une note dans la colonne active ; le curseur va sur le titre seulement à la création", async () => {
    const m = host();
    await m.host.open("a.md", false);
    expect(m.opened).toEqual(["a.md"]);
    expect(m.focused).toEqual([]);
    await m.host.open("b.md", true);
    expect(m.opened).toEqual(["a.md", "b.md"]);
    expect(m.focused).toEqual(["titre"]);
  });

  it("demande comment clore par la fenêtre de confirmation", async () => {
    const m = host();
    const answer = m.host.askClosing("Salon A");
    expect(m.dialog.querySelector(".confirmation-question")?.textContent).toContain("Salon A");
    await userEvent.keyboard("{Enter}");
    await expect(answer).resolves.toBe("withSuccessor");
  });

  it("place un événement dans la corbeille par celle de l'application", async () => {
    const m = host();
    const event = { path: "a.md", title: "A", agenda: "s.md" };
    await m.host.trashEvent(event);
    expect(m.trash.trashEvent).toHaveBeenCalledWith(event);
  });
});
