import { describe, expect, it, vi } from "vitest";
import { action, crm, sample } from "../../test-support/crm-fixture";
import {
  buttonNamed,
  callsTo,
  column,
  cardsOf,
  mountCrm,
  type MountedCrm,
  type,
} from "../../test-support/crm-view-fixture";
import "../theme.css";
import "../style.css";

const lastFilters = (m: MountedCrm) => callsTo(m, "readCrm").at(-1)?.[2];
const select = (label: string) =>
  document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`) as HTMLSelectElement;
const options = (list: HTMLSelectElement) => [...list.options].map((o) => o.textContent);
const choose = (list: HTMLSelectElement, value: string) => {
  list.value = value;
  list.dispatchEvent(new Event("change", { bubbles: true }));
};
const pills = (row: string) =>
  [...document.querySelectorAll<HTMLElement>(`.${row} .crm-pill`)].map((p) => [
    p.textContent,
    p.getAttribute("aria-pressed"),
  ]);

describe("CRM : colonnes terminées", () => {
  const many = (count: number) => {
    const actions = Array.from({ length: count }, (_, i) =>
      action(`f${String(i).padStart(2, "0")}`, { status: "Done", open: false }),
    );
    return crm({ actions });
  };

  it("montre les 10 premières cartes, puis 10 de plus à chaque clic, jusqu'au bout", async () => {
    await mountCrm({ crm: many(25) });
    expect(cardsOf(column("Done"))).toHaveLength(10);
    expect(column("Done").querySelector(".crm-count")?.textContent).toBe("25");
    expect(buttonNamed("Afficher 10 de plus (15 restantes)")).toBeDefined();
    buttonNamed("Afficher 10 de plus (15 restantes)").click();
    expect(cardsOf(column("Done"))).toHaveLength(20);
    buttonNamed("Afficher 10 de plus (5 restantes)").click();
    expect(cardsOf(column("Done"))).toHaveLength(25);
    expect(document.querySelector(".crm-more")).toBeNull();
  });

  it("dit « 1 restante » au singulier, et n'a pas de bouton pour 10 cartes", async () => {
    await mountCrm({ crm: many(11) });
    expect(buttonNamed("Afficher 10 de plus (1 restante)")).toBeDefined();
    await mountCrm({ crm: many(10) });
    expect(document.querySelector(".crm-more")).toBeNull();
  });

  it("garde l'ordre de Rust : les premières cartes restent les premières", async () => {
    await mountCrm({ crm: many(12) });
    expect(cardsOf(column("Done")).slice(0, 2)).toEqual(["f00", "f01"]);
  });

  it("n'a pas de bouton dans une colonne ouverte", async () => {
    const actions = Array.from({ length: 12 }, (_, i) => action(`t${String(i)}`));
    await mountCrm({ crm: crm({ actions }) });
    expect(cardsOf(column("TODO"))).toHaveLength(12);
    expect(document.querySelector(".crm-more")).toBeNull();
  });
});

describe("CRM : recherche et filtres", () => {
  it("transmet le mot cherché à la lecture, sans refaire le champ", async () => {
    const m = await mountCrm();
    const search = document.querySelector<HTMLInputElement>(".crm-search") as HTMLInputElement;
    search.focus();
    type(search, "dev");
    await vi.waitFor(() => expect(lastFilters(m)).toMatchObject({ search: "dev" }));
    await vi.waitFor(() => expect(callsTo(m, "readCrm")).toHaveLength(2));
    expect(document.querySelector(".crm-search")).toBe(search);
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe("dev");
    expect(search.getAttribute("aria-label")).toBe("Rechercher une action");
  });

  it("propose « Toutes les personnes » puis chaque personne par ordre alphabétique", async () => {
    await mountCrm();
    expect(options(select("Filtrer par personne"))).toEqual([
      "Toutes les personnes",
      "Jean Dupont",
      "Marie Durand",
    ]);
  });

  it("filtre par personne, et revient à toutes", async () => {
    const m = await mountCrm();
    choose(select("Filtrer par personne"), "marie-durand");
    await vi.waitFor(() => expect(lastFilters(m)).toMatchObject({ person: "marie-durand" }));
    await vi.waitFor(() => expect(select("Filtrer par personne").value).toBe("marie-durand"));
    choose(select("Filtrer par personne"), "");
    await vi.waitFor(() => expect(lastFilters(m)).toMatchObject({ person: null }));
  });

  it("propose NODATA en tête des entreprises, et filtre par entreprise ou par NODATA", async () => {
    const m = await mountCrm();
    expect(options(select("Filtrer par entreprise"))).toEqual([
      "Toutes les entreprises",
      "NODATA",
      "Acme",
    ]);
    choose(select("Filtrer par entreprise"), "company:acme");
    await vi.waitFor(() =>
      expect(lastFilters(m)).toMatchObject({ company: { kind: "company", name: "acme" } }),
    );
    await vi.waitFor(() => expect(select("Filtrer par entreprise").value).toBe("company:acme"));
    choose(select("Filtrer par entreprise"), "nodata");
    await vi.waitFor(() => expect(lastFilters(m)).toMatchObject({ company: { kind: "noData" } }));
    await vi.waitFor(() => expect(select("Filtrer par entreprise").value).toBe("nodata"));
    choose(select("Filtrer par entreprise"), "");
    await vi.waitFor(() => expect(lastFilters(m)).toMatchObject({ company: null }));
  });

  it("montre un bouton par projet après « Tous les projets », actif d'office, et les cumule", async () => {
    const data = sample();
    data.projects.push({
      ...(data.projects[0] as (typeof data.projects)[number]),
      name: "autre",
      title: "Autre",
      color: "vert",
    });
    const m = await mountCrm({ crm: data });
    expect(pills("crm-filter-projects")).toEqual([
      ["Tous les projets", "true"],
      ["Refonte du site", "false"],
      ["Autre", "false"],
    ]);
    buttonNamed("Refonte du site").click();
    await vi.waitFor(() => expect(lastFilters(m)).toMatchObject({ projects: ["refonte"] }));
    await vi.waitFor(() =>
      expect(pills("crm-filter-projects")[1]).toEqual(["Refonte du site", "true"]),
    );
    expect(pills("crm-filter-projects")[0]).toEqual(["Tous les projets", "false"]);
    buttonNamed("Autre").click();
    await vi.waitFor(() =>
      expect(lastFilters(m)).toMatchObject({ projects: ["refonte", "autre"] }),
    );
    buttonNamed("Refonte du site").click();
    await vi.waitFor(() => expect(lastFilters(m)).toMatchObject({ projects: ["autre"] }));
    buttonNamed("Tous les projets").click();
    await vi.waitFor(() => expect(lastFilters(m)).toMatchObject({ projects: [] }));
  });

  it("colore le bouton d'un projet de sa couleur", async () => {
    await mountCrm();
    const pill = buttonNamed("Refonte du site");
    expect(pill.style.getPropertyValue("--label-color")).toBe("var(--palette-bleu)");
  });

  it("ne montre pas la rangée des projets sans projet, ni celle des étiquettes sans étiquette", async () => {
    await mountCrm({ crm: crm({ actions: [action("a")] }) });
    expect(document.querySelector(".crm-filter-projects")).toBeNull();
    expect(document.querySelector(".crm-filter-tags")).toBeNull();
  });

  it("montre un bouton par étiquette et les cumule", async () => {
    const m = await mountCrm();
    expect(pills("crm-filter-tags")).toEqual([
      ["salon", "false"],
      ["urgent", "false"],
    ]);
    buttonNamed("urgent").click();
    await vi.waitFor(() => expect(lastFilters(m)).toMatchObject({ tags: ["urgent"] }));
    await vi.waitFor(() => expect(pills("crm-filter-tags")[1]).toEqual(["urgent", "true"]));
    buttonNamed("salon").click();
    await vi.waitFor(() => expect(lastFilters(m)).toMatchObject({ tags: ["urgent", "salon"] }));
    buttonNamed("urgent").click();
    await vi.waitFor(() => expect(lastFilters(m)).toMatchObject({ tags: ["salon"] }));
  });

  it("valent aussi pour Ma semaine, et ne sont pas gardés à la réouverture", async () => {
    const m = await mountCrm({ tab: "week" });
    choose(select("Filtrer par personne"), "jean-dupont");
    await vi.waitFor(() => expect(lastFilters(m)).toMatchObject({ person: "jean-dupont" }));
    const fresh = await mountCrm();
    expect(lastFilters(fresh)).toMatchObject({ person: null, search: "" });
  });
});
