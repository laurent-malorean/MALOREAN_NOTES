import { describe, expect, it } from "vitest";
import { COMMANDS, matchingCommands } from "./commands";

const labels = (query: string) => matchingCommands(query).map((c) => c.label);

describe("palette de commandes", () => {
  it("propose chaque action de l'application, avec son raccourci", () => {
    expect(COMMANDS.map((c) => [c.id, c.label, c.shortcut ?? null])).toEqual([
      ["quick-open", "Ouvrir une note", "Cmd+O"],
      ["new-note", "Nouvelle note", null],
      ["new-folder", "Nouveau dossier", null],
      ["search-library", "Rechercher dans toutes les notes", null],
      ["find-in-note", "Rechercher dans la note", "Cmd+F"],
      ["toggle-focus", "Mode focus", "Cmd+Maj+F"],
      ["toggle-typewriter", "Mode machine à écrire", "Cmd+Maj+T"],
      ["toggle-outline", "Plan de la note", "Cmd+Maj+O"],
      ["toggle-full-screen", "Plein écran", "Ctrl+Cmd+F"],
      ["show-trash", "Corbeille", null],
      ["open-settings", "Réglages", "Cmd+,"],
      ["choose-library", "Changer de dossier de notes", null],
    ]);
  });

  it("garde les commandes dont le nom contient chaque mot tapé, sans tenir compte des accents", () => {
    expect(labels("reglage")).toEqual(["Réglages"]);
    expect(labels("note")).toEqual([
      "Ouvrir une note",
      "Nouvelle note",
      "Rechercher dans toutes les notes",
      "Rechercher dans la note",
      "Plan de la note",
      "Changer de dossier de notes",
    ]);
    expect(labels("")).toHaveLength(COMMANDS.length);
  });
});
