import { describe, expect, it } from "vitest";
import { isCrmContent } from "./crm";

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
