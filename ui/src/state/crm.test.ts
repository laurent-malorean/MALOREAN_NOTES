import { describe, expect, it } from "vitest";
import { DEFAULT_TAB, isCrmContent, isFiltered, NO_FILTERS, storedTab, TABS, toggled } from "./crm";

describe("note CRM", () => {
  it("est un CRM quand l'en-tête déclare type: crm, guillemets permis", () => {
    expect(isCrmContent("---\ntype: crm\n---\n# Clients\n")).toBe(true);
    expect(isCrmContent('---\ntype: "crm"\n---\n# Clients\n')).toBe(true);
  });

  it("n'est pas un CRM sans cet en-tête, ni pour une fiche du CRM", () => {
    expect(isCrmContent("# Clients\n")).toBe(false);
    expect(isCrmContent("---\ntype: crm-action\n---\n# Devis\n")).toBe(false);
    expect(isCrmContent("---\ntype: carte-mentale\n---\n# Idées\n")).toBe(false);
  });
});

describe("onglets du CRM", () => {
  it("sont cinq, dans l'ordre, le Kanban d'abord", () => {
    expect(TABS.map((tab) => tab.label)).toEqual([
      "Kanban",
      "Ma semaine",
      "Personnes",
      "Entreprises",
      "Projets",
    ]);
    expect(DEFAULT_TAB).toBe("kanban");
  });

  it("rouvrent l'onglet gardé, ou le Kanban si ce qui est gardé n'en est pas un", () => {
    expect(storedTab("week")).toBe("week");
    expect(storedTab("projects")).toBe("projects");
    expect(storedTab("autre")).toBe("kanban");
    expect(storedTab(null)).toBe("kanban");
  });
});

describe("filtres du Kanban", () => {
  it("au repos, aucun n'est actif ; un espace cherché n'en est pas un", () => {
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, search: "  " })).toBe(false);
  });

  it("chacun suffit à filtrer", () => {
    expect(isFiltered({ ...NO_FILTERS, search: "devis" })).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, person: "jean" })).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, company: { kind: "noData" } })).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, projects: ["refonte"] })).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, tags: ["urgent"] })).toBe(true);
  });

  it("cumule les projets et les étiquettes cliqués, et retire celui qu'on reclique", () => {
    expect(toggled([], "a")).toEqual(["a"]);
    expect(toggled(["a"], "b")).toEqual(["a", "b"]);
    expect(toggled(["a", "b"], "a")).toEqual(["b"]);
  });
});
