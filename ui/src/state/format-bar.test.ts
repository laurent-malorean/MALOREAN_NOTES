import { describe, expect, it } from "vitest";
import { FORMAT_BAR, formatButtonName, formatButtonTitle } from "./format-bar";

describe("barre de mise en forme", () => {
  it("range ses boutons en deux pilules, dans l'ordre validé", () => {
    expect(FORMAT_BAR.map((group) => group.map((button) => button.command))).toEqual([
      [
        "bold",
        "italic",
        "insert-link",
        "heading-1",
        "heading-2",
        "heading-3",
        "bullet-list",
        "numbered-list",
        "insert-date",
      ],
      ["copy-markdown", "copy-note"],
    ]);
  });

  it("donne une icône à chaque bouton, jamais la même deux fois", () => {
    const icons = FORMAT_BAR.flat().map((button) => button.icon);
    expect(icons).toEqual([
      "bold",
      "italic",
      "link",
      "heading-1",
      "heading-2",
      "heading-3",
      "bullet-list",
      "numbered-list",
      "date",
      "markdown",
      "copy",
    ]);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("nomme chaque bouton comme sa commande", () => {
    expect(formatButtonName("bold")).toBe("Gras");
    expect(formatButtonName("copy-note")).toBe("Copier en texte mis en forme");
  });

  it("donne dans la bulle d'aide le nom de la commande et son raccourci", () => {
    expect(formatButtonTitle("bold")).toBe("Gras (Cmd+B)");
    expect(formatButtonTitle("insert-date")).toBe("Insérer la date du jour (Cmd+Maj+D)");
  });

  it("sans raccourci, la bulle d'aide ne donne que le nom", () => {
    expect(formatButtonTitle("open-link")).toBe("Ouvrir le lien");
  });
});
