import { describe, expect, it } from "vitest";
import type { MenuEntryItem } from "../bridge";
import { keyOf } from "../screens/shortcuts";
import { APP_MENU, accelerator, menuBar, menuCommand, NOTE_COMMANDS } from "./app-menu";
import { COMMANDS, MENU_COMMANDS, type MenuCommandId, PALETTE } from "./commands";

type CommandEntry = Extract<MenuEntryItem, { kind: "command" }>;
const commandEntries = (noteShown: boolean): CommandEntry[] =>
  menuBar(noteShown).flatMap((menu) =>
    menu.entries.filter((entry): entry is CommandEntry => entry.kind === "command"),
  );

describe("barre des menus", () => {
  it("range les menus comme le Mac, en français", () => {
    expect(menuBar(true).map((menu) => [menu.title, menu.role])).toEqual([
      ["MALOREAN Notes", null],
      ["Fichier", null],
      ["Édition", null],
      ["Présentation", null],
      ["Fenêtre", "window"],
      ["Aide", "help"],
    ]);
  });

  it("chaque menu, de haut en bas, avec le raccourci de chaque commande", () => {
    const shown = menuBar(true).map((menu) => [
      menu.title,
      menu.entries.map((entry) => {
        if (entry.kind !== "command") return entry.kind === "separator" ? "—" : entry.label;
        return entry.accelerator === null ? entry.label : `${entry.label} ${entry.accelerator}`;
      }),
    ]);
    expect(shown).toEqual([
      [
        "MALOREAN Notes",
        [
          "À propos de MALOREAN Notes",
          "—",
          "Réglages… Cmd+,",
          "—",
          "Services",
          "—",
          "Masquer MALOREAN Notes",
          "Masquer les autres",
          "Tout afficher",
          "—",
          "Quitter MALOREAN Notes",
        ],
      ],
      [
        "Fichier",
        [
          "Nouvelle note Cmd+N",
          "Nouvelle note depuis un modèle… Cmd+Shift+N",
          "Note du jour Cmd+Shift+J",
          "Nouveau dossier",
          "—",
          "Ouverture rapide… Cmd+O",
          "Nouvel onglet… Cmd+T",
          "Fermer l'onglet Cmd+W",
          "—",
          "Exporter… Cmd+E",
          "Imprimer… Cmd+P",
          "—",
          "Changer d'espace de travail… Cmd+Shift+E",
          "Ajouter un espace de travail…",
          "Renommer l'espace de travail…",
          "Retirer un espace de travail…",
          "—",
          "Corbeille",
          "Reconstruire l'index",
        ],
      ],
      [
        "Édition",
        [
          "Annuler",
          "Rétablir",
          "—",
          "Couper",
          "Copier",
          "Coller",
          "Tout sélectionner",
          "—",
          "Copier en texte mis en forme Cmd+Shift+C",
          "Copier en Markdown Ctrl+Cmd+C",
          "—",
          "Rechercher… Cmd+F",
          "Rechercher et remplacer… Alt+Cmd+F",
          "Rechercher dans toutes les notes…",
        ],
      ],
      [
        "Présentation",
        [
          "Panneaux latéraux Ctrl+Cmd+S",
          "Plein écran Ctrl+Cmd+F",
          "—",
          "Mode focus Cmd+Shift+F",
          "Mode machine à écrire Cmd+Shift+T",
          "Plan de la note Cmd+Shift+O",
          "—",
          "Diviser la colonne Ctrl+Cmd+T",
          "Onglet suivant Ctrl+Tab",
          "Onglet précédent Ctrl+Shift+Tab",
          "—",
          "Trier la liste…",
        ],
      ],
      ["Fenêtre", ["Placer dans le Dock", "Réduire/agrandir", "—", "Tout ramener au premier plan"]],
      ["Aide", ["Palette de commandes… Cmd+Shift+P"]],
    ]);
  });

  it("chaque élément de commande lance une commande de la palette, ou la palette elle-même", () => {
    const known = new Set<string>(MENU_COMMANDS.map((command) => command.id));
    for (const entry of commandEntries(true)) expect(known).toContain(entry.id);
    expect(commandEntries(true).map((entry) => entry.id)).toContain(PALETTE.id);
  });

  it("aucune commande n'est deux fois dans la barre", () => {
    const ids = commandEntries(true).map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toute commande qui a un raccourci est dans la barre, pour qu'on le voie", () => {
    const ids = new Set(commandEntries(true).map((entry) => entry.id));
    for (const command of MENU_COMMANDS)
      if (command.shortcut !== undefined) expect(ids).toContain(command.id);
  });

  it("chaque élément montre le raccourci de sa commande, écrit pour le Mac", () => {
    const shortcuts = new Map(MENU_COMMANDS.map((command) => [command.id, command.shortcut]));
    for (const entry of commandEntries(true)) {
      const shortcut = shortcuts.get(entry.id as MenuCommandId);
      expect(entry.accelerator).toBe(shortcut === undefined ? null : accelerator(shortcut));
    }
    const close = commandEntries(true).find((entry) => entry.id === "close-tab");
    expect(close?.accelerator).toBe("Cmd+W");
    const template = commandEntries(true).find((entry) => entry.id === "new-note-from-template");
    expect(template?.accelerator).toBe("Cmd+Shift+N");
  });

  it("deux commandes n'ont jamais le même raccourci", () => {
    const keys = MENU_COMMANDS.flatMap((command) =>
      command.shortcut === undefined ? [] : [keyOf(command.shortcut)],
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Cmd+W ferme l'onglet : aucun élément standard ne ferme la fenêtre", () => {
    const standards = APP_MENU.flatMap((menu) => menu.items).flatMap((item) =>
      item !== "separator" && "standard" in item ? [item.standard] : [],
    );
    expect(standards).toEqual([
      "about",
      "services",
      "hide",
      "hideOthers",
      "showAll",
      "quit",
      "undo",
      "redo",
      "cut",
      "copy",
      "paste",
      "selectAll",
      "minimize",
      "zoom",
      "bringAllToFront",
    ]);
  });

  it("garde le nom de la palette, sauf les points de suspension des éléments qui ouvrent une fenêtre", () => {
    const labels = new Map(commandEntries(true).map((entry) => [entry.id, entry.label]));
    expect(labels.get("open-settings")).toBe("Réglages…");
    expect(labels.get("close-tab")).toBe("Fermer l'onglet");
    expect(labels.get("command-palette")).toBe("Palette de commandes…");
  });

  it("met les éléments standard et les traits tels quels", () => {
    const [app] = menuBar(true);
    expect(app?.entries.slice(0, 3)).toEqual([
      { kind: "standard", item: "about", label: "À propos de MALOREAN Notes" },
      { kind: "separator" },
      {
        kind: "command",
        id: "open-settings",
        label: "Réglages…",
        accelerator: "Cmd+,",
        enabled: true,
      },
    ]);
  });

  it("grise les commandes d'une note tant qu'aucune note n'est montrée, et elles seules", () => {
    for (const entry of commandEntries(false))
      expect(entry.enabled).toBe(!NOTE_COMMANDS.has(entry.id as MenuCommandId));
    for (const entry of commandEntries(true)) expect(entry.enabled).toBe(true);
    expect([...NOTE_COMMANDS]).toEqual([
      "find-in-note",
      "find-and-replace",
      "close-tab",
      "split-column",
      "export-note",
      "print-note",
      "copy-note",
      "copy-markdown",
    ]);
  });

  it("refuse un menu qui nomme une commande inconnue", () => {
    const menus = [{ title: "X", items: [{ command: "nope" as MenuCommandId }] }];
    expect(() => menuBar(true, menus)).toThrow("commande inconnue : nope");
  });

  it("reconnaît l'identifiant d'une commande reçu de la barre, et rien d'autre", () => {
    expect(menuCommand("close-tab")).toBe("close-tab");
    expect(menuCommand("command-palette")).toBe("command-palette");
    expect(menuCommand("quit")).toBeNull();
    expect(menuCommand("")).toBeNull();
  });

  it("écrit Maj « Shift » pour le Mac, le reste tel quel", () => {
    expect(accelerator("Ctrl+Maj+Tab")).toBe("Ctrl+Shift+Tab");
    expect(accelerator("Ctrl+Cmd+F")).toBe("Ctrl+Cmd+F");
    expect(COMMANDS.length + 1).toBe(MENU_COMMANDS.length);
  });
});
