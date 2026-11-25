import { describe, expect, it } from "vitest";
import { declaredType } from "./declared-type";

describe("type déclaré par l'en-tête", () => {
  it("lit la valeur de la clé type", () => {
    expect(declaredType("---\ntype: crm\n---\n# Clients\n")).toBe("crm");
  });

  it("retire les guillemets, les espaces et le commentaire", () => {
    expect(declaredType('---\ntype : "crm"  # clients\n---\n')).toBe("crm");
    expect(declaredType("---\ntype: 'crm-action'\n---\n")).toBe("crm-action");
  });

  it("prend la première clé type, parmi d'autres propriétés", () => {
    expect(declaredType("---\nsite: a\ntype: crm\ntype: autre\n---\n")).toBe("crm");
  });

  it("rend null sans en-tête, sans type, ou si l'en-tête ne se ferme pas", () => {
    expect(declaredType("# Note\ntype: crm\n")).toBeNull();
    expect(declaredType("---\ntags: [a]\n---\n# Note\n")).toBeNull();
    expect(declaredType("---\ntype: crm\n# Note\n")).toBeNull();
  });

  it("ne lit pas une clé qui finit par type, ni un type indenté", () => {
    expect(declaredType("---\nsubtype: crm\n---\n")).toBeNull();
    expect(declaredType("---\n  type: crm\n---\n")).toBeNull();
  });

  it("accepte un en-tête terminé par la fin du texte et des fins de ligne Windows", () => {
    expect(declaredType("---\r\ntype: crm\r\n---")).toBe("crm");
  });
});
