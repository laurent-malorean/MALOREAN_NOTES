import { describe, expect, it, vi } from "vitest";
import { listsSample, moreBackend } from "../../test-support/crm-lists-fixture";
import { field } from "../../test-support/crm-window-fixture";
import "../theme.css";
import "../style.css";
import { createFichePane, SHOWN_CLASS } from "./crm-fiche-pane";

const PERSON = "---\ntype: crm-personne\n---\n# Jean Dupont\n";
const COMPANY = "---\ntype: crm-entreprise\n---\n# Acme\n";

function mount() {
  const column = document.createElement("section");
  column.className = "column";
  column.style.cssText = "width:1000px;height:600px;display:flex;flex-direction:column";
  document.body.replaceChildren(column);
  const reads: string[] = [];
  const errors: unknown[] = [];
  const opened: string[] = [];
  const titles: string[] = [];
  const state = { fail: false };
  const backend = {
    ...moreBackend(async () => {}),
    readCrm: async (path: string) => {
      reads.push(path);
      if (state.fail) throw new Error("CRM illisible");
      return listsSample();
    },
  };
  const deps = {
    backend: backend as never,
    confirm: async () => true,
    chooseNote: async () => null,
  };
  const pane = createFichePane(column, {
    ...{ deps, error: (e: unknown) => errors.push(e), openFiche: (p: string) => opened.push(p) },
    ...{ openNote: (title: string) => titles.push(title), notice: vi.fn() },
  });
  return { pane, column, reads, errors, opened, titles, state };
}

describe("colonne : une fiche d'entreprise ou de personne", () => {
  it("prend la place de l'éditeur pour une fiche rangée dans le dossier de son CRM", async () => {
    const m = mount();
    await m.pane.sync("clients/personnes/jean-dupont.md", PERSON);
    expect(m.pane.shown()).toBe(true);
    expect(m.column.classList.contains(SHOWN_CLASS)).toBe(true);
    expect(SHOWN_CLASS).toBe("fiche-shown");
    expect(m.reads).toEqual(["clients.md"]);
    expect(m.column.querySelector(".crm-fiche-title")?.textContent).toBe("Jean Dupont");
    await m.pane.sync("Ventes/clients/entreprises/acme.md", COMPANY);
    expect(m.reads).toEqual(["clients.md", "Ventes/clients.md"]);
    expect(m.column.querySelectorAll(".crm-fiche")).toHaveLength(1);
  });

  it("rend l'éditeur à une note ordinaire, à une fiche hors de son dossier et à aucune note", async () => {
    const m = mount();
    await m.pane.sync("clients/personnes/jean-dupont.md", PERSON);
    await m.pane.sync("autre.md", "# Autre\n");
    expect(m.pane.shown()).toBe(false);
    expect(m.column.classList.contains(SHOWN_CLASS)).toBe(false);
    expect(m.column.querySelector(".crm-fiche")).toBeNull();
    await m.pane.sync("clients/actions/jean.md", PERSON);
    expect(m.pane.shown()).toBe(false);
    await m.pane.sync("clients/personnes/jean-dupont.md", PERSON);
    await m.pane.sync(null, "");
    expect(m.pane.shown()).toBe(false);
  });

  it("relit la fiche quand la même note est resynchronisée, sans en créer une seconde", async () => {
    const m = mount();
    await m.pane.sync("clients/personnes/jean-dupont.md", PERSON);
    await m.pane.sync("clients/personnes/jean-dupont.md", PERSON);
    expect(m.reads).toHaveLength(2);
    expect(m.column.querySelectorAll(".crm-fiche")).toHaveLength(1);
  });

  it("suit un changement venu du disque dans le dossier du CRM ou sur le CRM, pas ailleurs", async () => {
    const m = mount();
    await m.pane.refresh(["clients/actions/a.md"]);
    expect(m.reads).toEqual([]);
    await m.pane.sync("clients/personnes/jean-dupont.md", PERSON);
    await m.pane.refresh(["clients/actions/a.md"]);
    expect(m.reads).toHaveLength(2);
    await m.pane.refresh(["clients.md"]);
    expect(m.reads).toHaveLength(3);
    await m.pane.refresh(["clients-2/actions/a.md", "autre.md", "clients2.md"]);
    expect(m.reads).toHaveLength(3);
  });

  it("annonce une erreur de lecture", async () => {
    const m = mount();
    m.state.fail = true;
    await m.pane.sync("clients/personnes/jean-dupont.md", PERSON);
    expect(m.errors).toHaveLength(1);
  });

  it("ouvre une autre fiche par un clic sur un nom, et la fenêtre d'une action par un clic sur une ligne", async () => {
    const m = mount();
    await m.pane.sync("clients/entreprises/acme.md", COMPANY);
    (m.column.querySelector(".crm-fiche-person .crm-name") as HTMLElement).click();
    expect(m.opened).toEqual(["clients/personnes/jean-dupont.md"]);
    (m.column.querySelector(".crm-line") as HTMLElement).click();
    expect(document.querySelectorAll(".crm-aw")).toHaveLength(1);
    expect(field<HTMLInputElement>("title").value).toBe("Appeler Jean");
  });

  it("détruire la colonne retire la fiche et la fenêtre de l'action ouverte", async () => {
    const m = mount();
    await m.pane.sync("clients/entreprises/acme.md", COMPANY);
    (m.column.querySelector(".crm-line") as HTMLElement).click();
    m.pane.destroy();
    expect(document.querySelector(".crm-aw")).toBeNull();
    expect(m.column.querySelector(".crm-fiche")).toBeNull();
    expect(m.column.classList.contains(SHOWN_CLASS)).toBe(false);
  });
});
