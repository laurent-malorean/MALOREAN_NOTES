import { describe, expect, it } from "vitest";
import { NEW_CONTENT_MENU } from "../state/new-content-menu";
import { APP_ICONS, appIcon } from "./app-icons";
import { CANVAS_ICON_PATHS } from "./canvas-icons";
import { FORMAT_ICON_PATHS } from "./format-icons";

const shape = (svg: SVGElement) =>
  [...svg.querySelectorAll("path")].map((p) => p.getAttribute("d")).join("|");

describe("jeu d'icônes de l'application", () => {
  it("chaque dessin est décoratif, à trait fin de la couleur du texte", () => {
    for (const icon of APP_ICONS) {
      const svg = appIcon(icon);
      expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("focusable")).toBe("false");
      expect(svg.getAttribute("fill")).toBe("none");
      expect(svg.getAttribute("stroke")).toBe("currentColor");
      expect(svg.getAttribute("stroke-linecap")).toBe("round");
      expect(svg.getAttribute("stroke-linejoin")).toBe("round");
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    }
  });

  it("les dessins sont tous différents (aucun doublon dans le jeu)", () => {
    const shapes = APP_ICONS.map((icon) => shape(appIcon(icon)));
    expect(new Set(shapes).size).toBe(APP_ICONS.length);
  });

  it("contient les sept contenus du menu de création, le chevron et les dessins des menus", () => {
    for (const { icon } of NEW_CONTENT_MENU) expect(APP_ICONS).toContain(icon);
    expect(APP_ICONS).toContain("chevron");
    expect(APP_ICONS.length).toBe(54);
  });

  it("a deux dessins pour le bouton des panneaux latéraux : panneau plein (montrés), panneau vide (cachés)", () => {
    expect(APP_ICONS).toContain("side-panels-shown");
    expect(APP_ICONS).toContain("side-panels-hidden");
  });

  it("reprend sans les redessiner ceux de la barre de mise en forme et du canvas", () => {
    expect(shape(appIcon("copy"))).toBe(FORMAT_ICON_PATHS.copy.join("|"));
    expect(shape(appIcon("markdown"))).toBe(FORMAT_ICON_PATHS.markdown.join("|"));
    expect(shape(appIcon("trash"))).toBe(CANVAS_ICON_PATHS.trash.join("|"));
    expect(shape(appIcon("export"))).toBe(CANVAS_ICON_PATHS.export.join("|"));
    expect(shape(appIcon("edit"))).toBe(CANVAS_ICON_PATHS.edit.join("|"));
  });
});
