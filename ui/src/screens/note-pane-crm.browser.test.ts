import { afterEach, describe, expect, it, vi } from "vitest";
import { sample } from "../../test-support/crm-fixture";
import { fakeBackend } from "../../test-support/pane-fixture";
import { createPane } from "./note-pane";
import { createSharedNotes } from "./shared-notes";
import { crmFolder } from "./crm-pane";
import "../theme.css";
import "../style.css";

const CRM_NOTE = "---\ntype: crm\n---\n# Clients\n";

afterEach(() => localStorage.clear());

function mount(withCrm = true, failing = false) {
  const element = document.createElement("section");
  element.className = "column";
  element.style.cssText = "width:1400px;height:600px;display:flex;flex-direction:column";
  const backlinks = document.createElement("nav");
  const related = document.createElement("nav");
  element.append(backlinks, related);
  document.body.replaceChildren(element);
  const fake = fakeBackend({ "Clients/prospects.md": CRM_NOTE, "autre.md": "# Autre\n\ntexte" });
  const reads: string[] = [];
  const errors: unknown[] = [];
  const ignore = () => {};
  const shared = createSharedNotes({
    backend: fake.backend,
    events: { saved: ignore, titled: ignore, deleted: ignore, error: ignore },
  });
  const crm = {
    backend: {
      readCrm: async (path: string) => {
        reads.push(path);
        if (failing) throw new Error("CRM illisible");
        return sample();
      },
      createCrmAction: async () => "a",
      moveCrmAction: async () => null,
      changeCrmAction: async () => null,
      deleteCrmAction: async () => null,
      changeCrmStages: async () => [],
      copyPlainText: async () => null,
      openWebAddress: async () => null,
    },
    confirm: async () => true,
    chooseNote: async () => null,
  };
  const pane = createPane(
    { element, backlinks, related },
    {
      backend: fake.backend,
      shared,
      events: { openNote: ignore, openLink: ignore, error: (e) => errors.push(e) },
      resolveImage: (src) => src,
      ...(withCrm ? { crm } : {}),
    },
  );
  return { pane, element, reads, errors };
}

const shown = (element: HTMLElement) => element.classList.contains("crm-shown");
const cards = (element: HTMLElement) => element.querySelectorAll(".crm-card").length;

describe("colonne : un CRM", () => {
  it("montre ses onglets à la place de l'éditeur, puis l'éditeur pour une note ordinaire", async () => {
    const m = mount();
    await m.pane.load("Clients/prospects.md");
    expect(shown(m.element)).toBe(true);
    await vi.waitFor(() => expect(cards(m.element)).toBe(4));
    expect(m.reads).toEqual(["Clients/prospects.md"]);
    expect(getComputedStyle(m.element.querySelector(".cm-editor") as HTMLElement).display).toBe(
      "none",
    );
    await m.pane.load("autre.md");
    expect(shown(m.element)).toBe(false);
    expect(m.element.querySelector(".crm")).toBeNull();
    await m.pane.load(null);
    expect(shown(m.element)).toBe(false);
  });

  it("s'ouvre sur le Kanban, et rouvre l'onglet gardé sur ce Mac pour ce CRM", async () => {
    const m = mount();
    await m.pane.load("Clients/prospects.md");
    await vi.waitFor(() => expect(cards(m.element)).toBe(4));
    expect(m.element.querySelector(".crm-tab[aria-selected='true']")?.textContent).toBe("Kanban");
    (m.element.querySelector(".crm-tab[data-tab='week']") as HTMLElement).click();
    expect(localStorage.getItem("crm-tab:Clients/prospects.md")).toBe("week");
    m.pane.destroy();
    const again = mount();
    await again.pane.load("Clients/prospects.md");
    await vi.waitFor(() =>
      expect(again.element.querySelector(".crm-tab[aria-selected='true']")?.textContent).toBe(
        "Ma semaine",
      ),
    );
  });

  it("suit un changement venu du disque, sur la note ou sur l'une de ses fiches", async () => {
    const m = mount();
    await m.pane.load("Clients/prospects.md");
    await vi.waitFor(() => expect(m.reads).toHaveLength(1));
    await m.pane.followDisk();
    expect(m.reads).toHaveLength(2);
    await m.pane.followCrm(["Clients/prospects/actions/2026-11-25-devis.md"]);
    expect(m.reads).toHaveLength(3);
  });

  it("ne relit pas le CRM pour une note qui n'est pas l'une de ses fiches", async () => {
    const m = mount();
    await m.pane.load("Clients/prospects.md");
    await vi.waitFor(() => expect(m.reads).toHaveLength(1));
    await m.pane.followCrm([
      "Clients/prospects-2/actions/a.md",
      "autre.md",
      "Clients/prospects.md",
    ]);
    expect(m.reads).toHaveLength(1);
  });

  it("ne fait rien pour un changement quand aucun CRM n'est montré", async () => {
    const m = mount();
    await m.pane.load("autre.md");
    await m.pane.followCrm(["Clients/prospects/actions/a.md"]);
    expect(m.reads).toEqual([]);
    const without = mount(false);
    await without.pane.load("Clients/prospects.md");
    await without.pane.followCrm(["x"]);
    expect(shown(without.element)).toBe(false);
  });

  it("détruire la colonne retire le CRM", async () => {
    const m = mount();
    await m.pane.load("Clients/prospects.md");
    await vi.waitFor(() => expect(cards(m.element)).toBe(4));
    m.pane.destroy();
    expect(m.element.querySelector(".crm")).toBeNull();
  });

  it("sans CRM branché, la note reste du texte", async () => {
    const m = mount(false);
    await m.pane.load("Clients/prospects.md");
    expect(shown(m.element)).toBe(false);
  });

  it("une erreur de lecture du CRM est annoncée", async () => {
    const m = mount(true, true);
    await m.pane.load("Clients/prospects.md");
    await vi.waitFor(() => expect(m.errors).toHaveLength(1));
  });

  it("l'onglet gardé est celui de ce CRM, pas d'un autre", async () => {
    localStorage.setItem("crm-tab:autre/chemin.md", "week");
    const m = mount();
    await m.pane.load("Clients/prospects.md");
    await vi.waitFor(() => expect(cards(m.element)).toBe(4));
    expect(m.element.querySelector(".crm-tab[aria-selected='true']")?.textContent).toBe("Kanban");
  });
});

describe("dossier des fiches d'un CRM", () => {
  it("porte le nom de fichier du CRM", () => {
    expect(crmFolder("clients.md")).toBe("clients/");
    expect(crmFolder("Clients/prospects.md")).toBe("Clients/prospects/");
    expect(crmFolder("Clients/prospects.MD")).toBe("Clients/prospects/");
  });
});
