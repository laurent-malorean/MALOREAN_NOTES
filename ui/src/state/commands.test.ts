import { describe, expect, it } from "vitest";
import { COMMANDS, MENU_COMMANDS, matchingCommands, PALETTE } from "./commands";

const labels = (query: string) => matchingCommands(query).map((c) => c.label);

describe("palette de commandes", () => {
  it("propose chaque action de l'application, avec son raccourci", () => {
    expect(COMMANDS.map((c) => [c.id, c.label, c.shortcut ?? null])).toEqual([
      ["quick-open", "Ouvrir une note", "Cmd+O"],
      ["open-link", "Ouvrir le lien", null],
      ["new-note", "Nouvelle note", "Cmd+N"],
      ["new-note-from-template", "Nouvelle note depuis un modèle", "Cmd+Maj+N"],
      ["daily-note", "Note du jour", "Cmd+Maj+J"],
      ["new-research-notebook", "Nouveau cahier de recherche", null],
      ["add-entry", "Ajouter au cahier", null],
      ["new-folder", "Nouveau dossier", null],
      ["search-workspace", "Rechercher dans toutes les notes", null],
      ["find-in-note", "Rechercher dans la note", "Cmd+F"],
      ["find-and-replace", "Rechercher et remplacer", "Alt+Cmd+F"],
      ["bold", "Gras", "Cmd+B"],
      ["italic", "Italique", "Cmd+I"],
      ["insert-link", "Lien", "Cmd+K"],
      ["heading-1", "Titre 1", "Cmd+1"],
      ["heading-2", "Titre 2", "Cmd+2"],
      ["heading-3", "Titre 3", "Cmd+3"],
      ["bullet-list", "Liste à puces", "Cmd+Maj+8"],
      ["numbered-list", "Liste numérotée", "Cmd+Maj+7"],
      ["insert-date", "Insérer la date du jour", "Cmd+Maj+D"],
      ["correct-selection", "Corriger la sélection", "Ctrl+Cmd+K"],
      ["rephrase-selection", "Reformuler la sélection", "Ctrl+Cmd+R"],
      ["summarize-selection", "Résumer la sélection", "Ctrl+Cmd+U"],
      ["toggle-focus", "Mode focus", "Cmd+Maj+F"],
      ["toggle-typewriter", "Mode machine à écrire", "Cmd+Maj+T"],
      ["toggle-outline", "Plan de la note", "Cmd+Maj+O"],
      ["toggle-claude-column", "Colonne Claude Code", "Ctrl+Cmd+L"],
      ["toggle-full-screen", "Plein écran", "Ctrl+Cmd+F"],
      ["toggle-side-panels", "Panneaux latéraux", "Cmd+0"],
      ["new-tab", "Nouvel onglet", "Cmd+T"],
      ["close-tab", "Fermer l'onglet", "Cmd+W"],
      ["next-tab", "Onglet suivant", "Ctrl+Tab"],
      ["previous-tab", "Onglet précédent", "Ctrl+Maj+Tab"],
      ["split-column", "Diviser la colonne", "Ctrl+Cmd+T"],
      ["export-note", "Exporter…", "Cmd+E"],
      ["print-note", "Imprimer…", "Cmd+P"],
      ["copy-note", "Copier en texte mis en forme", "Cmd+Maj+C"],
      ["copy-markdown", "Copier en Markdown", "Ctrl+Cmd+C"],
      ["note-history", "Historique…", "Cmd+Y"],
      ["sort-notes", "Trier la liste", null],
      ["show-trash", "Corbeille", null],
      ["open-settings", "Réglages", "Cmd+,"],
      ["about", "À propos de MALOREAN Notes", null],
      ["switch-workspace", "Changer d'espace de travail", "Cmd+Maj+E"],
      ["add-workspace", "Ajouter un espace de travail", null],
      ["rename-workspace", "Renommer l'espace de travail", null],
      ["remove-workspace", "Retirer un espace de travail", null],
      ["rebuild-index", "Reconstruire l'index", null],
    ]);
  });

  it("la palette elle-même a un nom et un raccourci, hors de sa propre liste", () => {
    expect(PALETTE).toEqual({
      id: "command-palette",
      label: "Palette de commandes",
      shortcut: "Cmd+Maj+P",
    });
    expect(MENU_COMMANDS).toEqual([...COMMANDS, PALETTE]);
    expect(COMMANDS).not.toContainEqual(PALETTE);
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
      "À propos de MALOREAN Notes",
    ]);
    expect(labels("")).toHaveLength(COMMANDS.length);
  });
});
