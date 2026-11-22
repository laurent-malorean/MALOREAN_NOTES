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
  it("comptent 1 500 caractères par page au premier lancement, avec l'affichage d'origine", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      charactersPerPage: 1500,
      font: "serif",
      textSize: "medium",
      textWidth: "medium",
      appearance: "auto",
      claudeChangesAfterWeb: "allow",
    });
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it("sont retrouvés d'un lancement à l'autre, sous leur propre clé", () => {
    const storage = memoryStorage();
    const chosen = {
      charactersPerPage: 2000,
      font: "mono",
      textSize: "larger",
      textWidth: "wide",
      appearance: "dark",
      claudeChangesAfterWeb: "ask",
    } as const;
    saveSettings(storage, chosen);
    expect([...storage.items.keys()]).toEqual(["malorean.settings"]);
    expect(loadSettings(storage)).toEqual(chosen);
  });

  it("reprennent la valeur par défaut d'un réglage gardé illisible, sans perdre les autres", () => {
    expect(loadSettings(stored({ charactersPerPage: "beaucoup" }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored({ charactersPerPage: 0 }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored({ charactersPerPage: "2000" }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored({ charactersPerPage: 1500.5 }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored(null))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored({ font: "comic", appearance: "dark" }))).toEqual({
      ...DEFAULT_SETTINGS,
      appearance: "dark",
    });
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

function fieldOf(key: string) {
  const field = SETTING_FIELDS.find((f) => f.key === key);
  if (!field) throw new Error(`réglage introuvable : ${key}`);
  return field;
}

describe("écran de réglages, tel que décrit", () => {
  it("range l'écriture, l'affichage puis Claude, avec les choix de chaque réglage", () => {
    expect(SETTING_FIELDS.map((f) => [f.group, f.label])).toEqual([
      ["Écriture", "Caractères par page"],
      ["Affichage", "Police"],
      ["Affichage", "Taille du texte"],
      ["Affichage", "Largeur du texte"],
      ["Affichage", "Apparence"],
      ["Claude", "Modifications après une lecture du web"],
    ]);
    const choices = (key: string) => {
      const field = fieldOf(key);
      return field.kind === "choice" ? field.choices.map((c) => `${c.value} ${c.label}`) : [];
    };
    expect(choices("font")).toEqual([
      "serif Avec empattements",
      "sans Sans empattements",
      "mono Chasse fixe",
    ]);
    expect(choices("textSize")).toEqual([
      "small Petite",
      "medium Moyenne",
      "large Grande",
      "larger Très grande",
    ]);
    expect(choices("textWidth")).toEqual(["narrow Étroite", "medium Moyenne", "wide Large"]);
    expect(choices("appearance")).toEqual(["auto Automatique", "light Claire", "dark Sombre"]);
    expect(choices("claudeChangesAfterWeb")).toEqual([
      "allow Laisser Claude modifier",
      "ask Demander mon accord",
    ]);
  });

  it("explique chaque réglage", () => {
    expect(SETTING_FIELDS.map((f) => f.help)).toEqual([
      "Pour le nombre de pages du bandeau, espaces comprises. Un feuillet : 1 500.",
      "Pour le texte des notes.",
      "Pour le texte des notes.",
      "Largeur de la colonne de texte dans la fenêtre.",
      "Automatique : claire ou sombre, comme le Mac.",
      "Laisser : Claude crée et modifie les notes de l'espace de travail sans rien demander, même après avoir lu le web. Demander mon accord : ses modifications attendent votre accord dès qu'il a lu le web.",
    ]);
  });

  it("accepte un choix de la liste, et rien d'autre", () => {
    const font = fieldOf("font");
    expect(settingChanged(DEFAULT_SETTINGS, font, "sans")).toEqual({
      ...DEFAULT_SETTINGS,
      font: "sans",
    });
    expect(settingChanged(DEFAULT_SETTINGS, font, "comic")).toBeNull();
  });
});

describe("modifier un réglage nombre", () => {
  const field = fieldOf("charactersPerPage");

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
