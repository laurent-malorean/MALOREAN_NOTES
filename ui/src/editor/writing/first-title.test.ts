import { describe, expect, it } from "vitest";
import { titleTyped } from "./first-title";

describe("titre d'une note vide", () => {
  it("met la marque de titre devant ce qu'on tape dans une note vide", () => {
    expect(titleTyped("", "L")).toBe("# L");
  });

  it("laisse le texte d'une note qui n'est pas vide", () => {
    expect(titleTyped("# Liste", "L")).toBeNull();
  });

  it("laisse un titre déjà commencé par sa marque", () => {
    expect(titleTyped("", "#")).toBeNull();
  });

  it("laisse un espace ou un retour à la ligne tapé au début", () => {
    expect(titleTyped("", " ")).toBeNull();
    expect(titleTyped("", "\n")).toBeNull();
    expect(titleTyped("", " L")).toBeNull();
  });
});
