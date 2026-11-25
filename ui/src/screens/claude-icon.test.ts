import { describe, expect, it } from "vitest";
import { CLAUDE_RAY_COUNT, claudeRay } from "./claude-icon";

describe("rayons de l'icône de Claude", () => {
  it("sont douze, autour d'un centre vide, dans une grille de 24", () => {
    expect(CLAUDE_RAY_COUNT).toBe(12);
  });

  it("le premier rayon monte droit du centre, du quatrième au dixième et demi de la hauteur", () => {
    expect(claudeRay(0)).toEqual({ from: ["12.00", "8.00"], to: ["12.00", "1.50"] });
  });

  it("le quart de tour suivant part vers la droite", () => {
    expect(claudeRay(3)).toEqual({ from: ["16.00", "12.00"], to: ["22.50", "12.00"] });
  });

  it("le sixième rayon descend, le neuvième part vers la gauche", () => {
    expect(claudeRay(6)).toEqual({ from: ["12.00", "16.00"], to: ["12.00", "22.50"] });
    expect(claudeRay(9)).toEqual({ from: ["8.00", "12.00"], to: ["1.50", "12.00"] });
  });
});
