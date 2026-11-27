import { describe, expect, it } from "vitest";
import { recordedScreen, workspaceScreen } from "../../test-support/app-fixture";
import { newContentEntries } from "./new-content-menu";

function setup(folder = "") {
  const log: string[] = [];
  const start = workspaceScreen([], (screen) => ({ ...screen, folder }));
  const { screen } = recordedScreen(start);
  const entries = newContentEntries({
    screen,
    actions: {
      newNote: (where) => log.push(`note dans « ${where} »`),
      newNotebook: (where) => log.push(`cahier dans « ${where} »`),
      newMindMap: (where) => log.push(`carte mentale dans « ${where} »`),
      newCanvas: (where) => log.push(`canvas dans « ${where} »`),
      newCrm: (where) => log.push(`CRM dans « ${where} »`),
      newAgenda12: (where) => log.push(`agenda 12 dans « ${where} »`),
    },
    templates: { newNote: async () => void log.push("note depuis un modèle") },
    run: (action) => void action.catch((error: unknown) => log.push(`erreur ${String(error)}`)),
  });
  return { entries, log };
}

describe("entrées du menu de création", () => {
  it("sont, dans l'ordre, Note, Note depuis un modèle, Cahier de recherche, Carte mentale, Canvas, CRM, Agenda 12", () => {
    expect(setup().entries.map((entry) => entry.label)).toEqual([
      "Note",
      "Note depuis un modèle",
      "Cahier de recherche",
      "Carte mentale",
      "Canvas",
      "CRM",
      "Agenda 12",
    ]);
  });

  it("ont leur icône, et le raccourci de leur commande", () => {
    const { entries } = setup();
    expect(entries.map((entry) => entry.icon)).toEqual([
      "note",
      "template",
      "notebook",
      "mind-map",
      "canvas",
      "crm",
      "agenda-12",
    ]);
    expect(entries.map((entry) => entry.shortcut)).toEqual([
      "Cmd+N",
      "Cmd+Maj+N",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(entries.every((entry) => entry.disabled === undefined)).toBe(true);
  });

  it("chaque entrée lance sa création dans le dossier affiché", async () => {
    const { entries, log } = setup("Voyages");
    for (const entry of entries) entry.run();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual([
      "note dans « Voyages »",
      "note depuis un modèle",
      "cahier dans « Voyages »",
      "carte mentale dans « Voyages »",
      "canvas dans « Voyages »",
      "CRM dans « Voyages »",
      "agenda 12 dans « Voyages »",
    ]);
  });

  it("à la racine, le dossier est la racine", () => {
    const { entries, log } = setup();
    entries[4]?.run();
    expect(log).toEqual(["canvas dans «  »"]);
  });
});
