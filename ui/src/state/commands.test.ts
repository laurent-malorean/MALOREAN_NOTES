import { describe, expect, it } from "vitest";
import { COMMANDS, matchingCommands } from "./commands";

const labels = (query: string) => matchingCommands(query).map((c) => c.label);

describe("palette de commandes", () => {
  it("propose chaque action de l'application, avec son raccourci", () => {
    expect(COMMANDS.map((c) => [c.id, c.label, c.shortcut ?? null])).toEqual([
      ["quick-open", "Ouvrir une note", "Cmd+O"],
      ["new-note", "Nouvelle note", null],
      ["new-note-from-template", "Nouvelle note depuis un modèle", "Cmd+Maj+N"],
      ["daily-note", "Note du jour", "Cmd+Maj+J"],
      ["new-folder", "Nouveau dossier", null],
      ["search-workspace", "Rechercher dans toutes les notes", null],
      ["find-in-note", "Rechercher dans la note", "Cmd+F"],
      ["toggle-focus", "Mode focus", "Cmd+Maj+F"],
      ["toggle-typewriter", "Mode machine à écrire", "Cmd+Maj+T"],
      ["toggle-outline", "Plan de la note", "Cmd+Maj+O"],
      ["toggle-full-screen", "Plein écran", "Ctrl+Cmd+F"],
      ["toggle-side-panels", "Panneaux latéraux", "Ctrl+Cmd+S"],
      ["new-tab", "Nouvel onglet", "Cmd+T"],
      ["close-tab", "Fermer l'onglet", "Cmd+W"],
      ["next-tab", "Onglet suivant", "Ctrl+Tab"],
      ["previous-tab", "Onglet précédent", "Ctrl+Maj+Tab"],
      ["split-column", "Diviser la colonne", "Ctrl+Cmd+T"],
      ["export-note", "Exporter…", "Cmd+E"],
      ["print-note", "Imprimer…", "Cmd+P"],
      ["copy-note", "Copier en texte mis en forme", "Cmd+Maj+C"],
      ["copy-markdown", "Copier en Markdown", "Ctrl+Cmd+C"],
      ["sort-notes", "Trier la liste", null],
      ["show-trash", "Corbeille", null],
      ["open-settings", "Réglages", "Cmd+,"],
      ["switch-workspace", "Changer d'espace de travail", "Cmd+Maj+E"],
      ["add-workspace", "Ajouter un espace de travail", null],
      ["rename-workspace", "Renommer l'espace de travail", null],
      ["remove-workspace", "Retirer un espace de travail", null],
    ]);
  });

  it("garde les commandes dont le nom contient chaque mot tapé, sans tenir compte des accents", () => {
    expect(labels("reglage")).toEqual(["Réglages"]);
    expect(labels("note")).toEqual([
      "Note du jour",
      "Ouvrir une note",
      "Nouvelle note",
      "Nouvelle note depuis un modèle",
      "Rechercher dans toutes les notes",
      "Rechercher dans la note",
      "Plan de la note",
    ]);
    expect(labels("")).toHaveLength(COMMANDS.length);
  });
});
