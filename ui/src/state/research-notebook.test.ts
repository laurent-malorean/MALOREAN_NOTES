import { describe, expect, it } from "vitest";
import { entryReference, formatEntryNumber, lineStart, notebookTitle } from "./research-notebook";

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

  it("écrit le numéro d'entrée sur 4 chiffres, le nombre entier au-delà de 9999", () => {
    expect(formatEntryNumber(1)).toBe("0001");
    expect(formatEntryNumber(7)).toBe("0007");
    expect(formatEntryNumber(42)).toBe("0042");
    expect(formatEntryNumber(123)).toBe("0123");
    expect(formatEntryNumber(9999)).toBe("9999");
    expect(formatEntryNumber(10000)).toBe("10000");
    expect(formatEntryNumber(123456)).toBe("123456");
  });

  it("donne la référence d'une entrée : le titre du cahier, un point médian, son numéro", () => {
    expect(entryReference("Levures", 7)).toBe("Levures · 0007");
    expect(entryReference("Bières belges", 12345)).toBe("Bières belges · 12345");
  });

  it("prend pour titre le premier titre « # » après l'en-tête, sinon le nom du fichier", () => {
    const header = "---\ntype: cahier-de-recherche\n# pas un titre\n---\n";
    expect(notebookTitle(`${header}# Levures\n\n## 2026\n`, "Labo/levures.md")).toBe("Levures");
    expect(notebookTitle("# Sans en-tête  \n", "x.md")).toBe("Sans en-tête");
    expect(notebookTitle(`${header}\n## 2026\n`, "Labo/mes-levures.md")).toBe("mes-levures");
    expect(notebookTitle("---\r\ntype: cahier-de-recherche\r\n---\r\n# CRLF\r\n", "x.md")).toBe(
      "CRLF",
    );
  });
});
