import { describe, expect, it } from "vitest";
import {
  DISPLAY_TOOLS,
  FORMAT_BAR,
  displayToolTitle,
  formatButtonName,
  formatButtonTitle,
} from "./format-bar";

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

describe("bloc d'outils d'affichage", () => {
  it("range les cinq boutons dans l'ordre d'avant, sans les panneaux latéraux (devenus le bouton de la barre de la fenêtre) : Focus, Plan, Machine à écrire, plein écran, Claude", () => {
    expect(DISPLAY_TOOLS.map((tool) => [tool.key, tool.label])).toEqual([
      ["focus", "Focus"],
      ["outline", "Plan"],
      ["typewriter", "Machine à écrire"],
      ["full-screen", "Plein écran"],
      ["claude", "Claude"],
    ]);
  });

  it("lance les mêmes commandes qu'avant, avec leurs raccourcis", () => {
    expect(DISPLAY_TOOLS.map((tool) => tool.command)).toEqual([
      "toggle-focus",
      "toggle-outline",
      "toggle-typewriter",
      "toggle-full-screen",
      "toggle-claude-column",
    ]);
  });

  it("donne à chaque bouton sa propre icône, absente des autres boutons de la barre", () => {
    const icons = DISPLAY_TOOLS.map((tool) => tool.icon);
    expect(icons).toEqual(["focus", "outline", "typewriter", "full-screen", "claude"]);
    const used = [...FORMAT_BAR.flat().map((button) => button.icon), ...icons];
    expect(new Set(used).size).toBe(used.length);
  });

  it("la bulle d'aide dit le nom du bouton et le raccourci de sa commande", () => {
    expect(displayToolTitle("Focus", "toggle-focus")).toBe("Focus (Cmd+Maj+F)");
    expect(displayToolTitle("Quitter le plein écran", "toggle-full-screen")).toBe(
      "Quitter le plein écran (Ctrl+Cmd+F)",
    );
    expect(displayToolTitle("Claude", "toggle-claude-column")).toBe("Claude (Ctrl+Cmd+L)");
  });

  it("sans raccourci, la bulle d'aide ne donne que le nom", () => {
    expect(displayToolTitle("Lien", "open-link")).toBe("Lien");
  });
});
