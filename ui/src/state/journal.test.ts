import { describe, expect, it } from "vitest";
import type { PreferenceStorage } from "./focus-preference";
import {
  DEFAULT_JOURNAL,
  journalFolder,
  journalTemplate,
  loadJournal,
  saveJournal,
} from "./journal";

function memoryStorage(refused = false) {
  const items = new Map<string, string>();
  const check = () => {
    if (refused) throw new Error("stockage refusé");
  };
  const storage: PreferenceStorage = {
    getItem: (key) => (check(), items.get(key) ?? null),
    setItem: (key, value) => (check(), void items.set(key, value)),
    removeItem: (key) => (check(), void items.delete(key)),
  };
  return { storage, items };
}

describe("réglages du journal", () => {
  it("par défaut, le dossier Journal et la note du jour créée au lancement", () => {
    expect(DEFAULT_JOURNAL).toEqual({ folder: "Journal", atLaunch: true });
    expect(loadJournal(memoryStorage().storage, "/notes")).toEqual(DEFAULT_JOURNAL);
  });

  it("chaque bibliothèque garde les siens", () => {
    const { storage, items } = memoryStorage();
    saveJournal(storage, "/notes", { folder: "Perso/Jours", atLaunch: false });
    saveJournal(storage, "/autres", { folder: "Carnet", atLaunch: true });
    expect(loadJournal(storage, "/notes")).toEqual({ folder: "Perso/Jours", atLaunch: false });
    expect(loadJournal(storage, "/autres")).toEqual({ folder: "Carnet", atLaunch: true });
    expect(JSON.parse(items.get("malorean.journal:/notes") ?? "")).toEqual({
      folder: "Perso/Jours",
      atLaunch: false,
    });
  });

  it("une valeur gardée illisible redonne les réglages par défaut, champ par champ", () => {
    const { storage, items } = memoryStorage();
    const stored = (value: string) => (
      items.set("malorean.journal:/notes", value),
      loadJournal(storage, "/notes")
    );
    expect(stored("{pas du json")).toEqual(DEFAULT_JOURNAL);
    expect(stored("null")).toEqual(DEFAULT_JOURNAL);
    expect(stored("3")).toEqual(DEFAULT_JOURNAL);
    expect(stored('{"folder": 3, "atLaunch": "oui"}')).toEqual(DEFAULT_JOURNAL);
    expect(stored('{"folder": "", "atLaunch": false}')).toEqual({
      folder: "Journal",
      atLaunch: false,
    });
    expect(stored('{"folder": "Carnet"}')).toEqual({ folder: "Carnet", atLaunch: true });
  });

  it("un stockage refusé redonne les réglages par défaut et n'empêche rien", () => {
    const { storage } = memoryStorage(true);
    expect(() => saveJournal(storage, "/notes", DEFAULT_JOURNAL)).not.toThrow();
    expect(loadJournal(storage, "/notes")).toEqual(DEFAULT_JOURNAL);
  });

  it("le dossier tapé est nettoyé ; vide, il redevient Journal", () => {
    expect(journalFolder("  Perso/Jours  ")).toBe("Perso/Jours");
    expect(journalFolder("/Carnet/")).toBe("Carnet");
    expect(journalFolder("//Carnet//")).toBe("Carnet");
    expect(journalFolder("   ")).toBe("Journal");
    expect(journalFolder("//")).toBe("Journal");
  });
});

describe("modèle du journal", () => {
  const notes = [
    { path: "Modèles/reunion.md", title: "Réunion", folder: "Modèles" },
    { path: "Modèles/Archives/journal.md", title: "Journal", folder: "Modèles/Archives" },
    { path: "Modèles/jour.md", title: "Journal", folder: "Modèles" },
    { path: "journal.md", title: "Journal", folder: "" },
  ];

  it("est la note titrée Journal, directement dans le dossier des modèles", () => {
    expect(journalTemplate(notes, "Modèles")).toBe("Modèles/jour.md");
    expect(journalTemplate(notes, "Travail")).toBeNull();
    expect(journalTemplate(notes.slice(0, 2), "Modèles")).toBeNull();
  });
});
