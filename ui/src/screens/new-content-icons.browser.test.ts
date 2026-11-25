import { describe, expect, it } from "vitest";
import { NEW_CONTENT_MENU } from "../state/new-content-menu";
import { newContentIcon } from "./new-content-icons";

describe("icônes du menu de création", () => {
  it("chaque entrée a son dessin, décoratif, à trait fin de la couleur du texte", () => {
    for (const { icon } of NEW_CONTENT_MENU) {
      const svg = newContentIcon(icon);
      expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("focusable")).toBe("false");
      expect(svg.getAttribute("fill")).toBe("none");
      expect(svg.getAttribute("stroke")).toBe("currentColor");
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    }
  });

  it("les six dessins sont tous différents, et le chevron aussi", () => {
    const shapes = [...NEW_CONTENT_MENU.map((item) => item.icon), "chevron" as const].map((icon) =>
      [...newContentIcon(icon).querySelectorAll("path")].map((p) => p.getAttribute("d")).join("|"),
    );
    expect(new Set(shapes).size).toBe(7);
  });
});
