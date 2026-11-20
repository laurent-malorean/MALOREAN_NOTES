import { describe, expect, it } from "vitest";
import { lineStart } from "./research-notebook";

describe("cahier de recherche", () => {
  it("trouve le début d'une ligne, ou la fin d'un texte trop court", () => {
    const content = "# Cahier\n\n- 09:42 - un\n- 10:00 - deux";
    expect(lineStart(content, 0)).toBe(0);
    expect(lineStart(content, 1)).toBe(9);
    expect(lineStart(content, 2)).toBe(10);
    expect(lineStart(content, 3)).toBe(content.indexOf("- 10:00"));
    expect(lineStart(content, 4)).toBe(content.length);
    expect(lineStart(content, 9)).toBe(content.length);
  });
});
