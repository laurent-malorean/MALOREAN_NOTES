import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  SETTING_FIELDS,
  settingChanged,
} from "./settings";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items,
  };
}

const broken = {
  getItem: (): string | null => {
    throw new Error("stockage interdit");
  },
  setItem: () => {
    throw new Error("stockage interdit");
  },
  removeItem: () => {
    throw new Error("stockage interdit");
  },
};

const stored = (value: unknown) => memoryStorage({ "malorean.settings": JSON.stringify(value) });

describe("réglages", () => {
  it("comptent 1 500 caractères par page au premier lancement", () => {
    expect(DEFAULT_SETTINGS.charactersPerPage).toBe(1500);
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it("sont retrouvés d'un lancement à l'autre, sous leur propre clé", () => {
    const storage = memoryStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, charactersPerPage: 2000 });
    expect([...storage.items.keys()]).toEqual(["malorean.settings"]);
    expect(loadSettings(storage).charactersPerPage).toBe(2000);
  });

  it("reprennent la valeur par défaut d'un réglage gardé illisible, sans perdre les autres", () => {
    expect(loadSettings(stored({ charactersPerPage: "beaucoup" }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored({ charactersPerPage: 0 }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored({ charactersPerPage: "2000" }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored({ charactersPerPage: 1500.5 }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored(null))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored([1]))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStorage({ "malorean.settings": "{abîmé" }))).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it("ne bloquent rien si le stockage est refusé", () => {
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe("modifier un réglage", () => {
  const field = SETTING_FIELDS.find((f) => f.key === "charactersPerPage");
  if (!field) throw new Error("réglage introuvable");

  it("est décrit pour l'écran de réglages, avec ses bornes", () => {
    expect(field).toMatchObject({ label: "Caractères par page", min: 100, max: 100_000 });
  });

  it("accepte un nombre entier entre les bornes, écrit comme on l'écrit en français", () => {
    const change = (text: string) => settingChanged(DEFAULT_SETTINGS, field, text);
    expect(change("2000")).toEqual({ ...DEFAULT_SETTINGS, charactersPerPage: 2000 });
    expect(change(" 2 500 ")).toEqual({ ...DEFAULT_SETTINGS, charactersPerPage: 2500 });
    expect(change("100")?.charactersPerPage).toBe(100);
    expect(change("100000")?.charactersPerPage).toBe(100_000);
  });

  it("refuse ce qui n'est pas un nombre entier entre les bornes", () => {
    for (const text of ["", "abc", "99", "100001", "1500,5", "15e2", "-200", "12abc"])
      expect(settingChanged(DEFAULT_SETTINGS, field, text), text).toBeNull();
  });
});
