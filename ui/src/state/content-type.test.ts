import { describe, expect, it } from "vitest";
import { contentTypeLabel, placeLabel } from "./content-type";

describe("type de contenu", () => {
  it("chaque type a son nom", () => {
    expect(contentTypeLabel("note")).toBe("Note");
    expect(contentTypeLabel("researchNotebook")).toBe("Cahier de recherche");
    expect(contentTypeLabel("entry")).toBe("Entrée");
  });

  it("une entrée est suivie du titre de son cahier, une note de rien", () => {
    expect(placeLabel("entry", "Levures")).toBe("Entrée · Levures");
    expect(placeLabel("note", null)).toBe("Note");
  });
});
