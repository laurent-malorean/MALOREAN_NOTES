import { describe, expect, it } from "vitest";
import { COMMANDS } from "./commands";
import { LONG_PRESS_MS, NEW_CONTENT_MENU } from "./new-content-menu";

describe("menu de création", () => {
  it("propose, dans cet ordre, la note, la note depuis un modèle, le cahier, la carte mentale, le canvas, le CRM et l'agenda 12", () => {
    expect(NEW_CONTENT_MENU.map((item) => [item.label, item.command])).toEqual([
      ["Note", "new-note"],
      ["Note depuis un modèle", "new-note-from-template"],
      ["Cahier de recherche", "new-research-notebook"],
      ["Carte mentale", "new-mind-map"],
      ["Canvas", "new-canvas"],
      ["CRM", "new-crm"],
      ["Agenda 12", "new-agenda-12"],
    ]);
  });

  it("a une icône différente par entrée", () => {
    expect(NEW_CONTENT_MENU.map((item) => item.icon)).toEqual([
      "note",
      "template",
      "notebook",
      "mind-map",
      "canvas",
      "crm",
      "agenda-12",
    ]);
  });

  it("montre le raccourci de la commande : Cmd+N et Cmd+Maj+N, aucun pour les autres", () => {
    expect(NEW_CONTENT_MENU.map((item) => item.shortcut)).toEqual([
      "Cmd+N",
      "Cmd+Maj+N",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("ne reprend que des commandes qui existent", () => {
    const ids = COMMANDS.map((command) => command.id);
    for (const item of NEW_CONTENT_MENU) expect(ids).toContain(item.command);
  });

  it("n'a ni nouveau dossier ni note du jour", () => {
    const commands = NEW_CONTENT_MENU.map((item) => item.command as string);
    expect(commands).not.toContain("new-folder");
    expect(commands).not.toContain("daily-note");
  });

  it("l'appui prolongé dure une demi-seconde", () => {
    expect(LONG_PRESS_MS).toBe(500);
  });
});
