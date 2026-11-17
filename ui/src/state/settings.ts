// Réglages de l'application : leurs valeurs par défaut, leurs bornes, et leur garde d'un lancement à l'autre.
import type { PreferenceStorage } from "./focus-preference";

export interface Settings {
  /** Nombre de caractères d'une page, pour le bandeau. */
  readonly charactersPerPage: number;
}

export const DEFAULT_SETTINGS: Settings = { charactersPerPage: 1500 };

/** Un réglage tel que l'écran de réglages le présente : un nombre entier entre deux bornes. */
export interface NumberField {
  readonly key: keyof Settings;
  readonly label: string;
  readonly help: string;
  readonly min: number;
  readonly max: number;
}

/** Les réglages, dans l'ordre de l'écran. Un nouveau réglage s'ajoute ici. */
export const SETTING_FIELDS: readonly NumberField[] = [
  {
    key: "charactersPerPage",
    label: "Caractères par page",
    help: "Pour le nombre de pages du bandeau, espaces comprises. Un feuillet : 1 500.",
    min: 100,
    max: 100_000,
  },
];

const KEY = "malorean.settings";
const INTEGER = /^\d+$/;

/** Le nombre écrit, ou rien s'il n'est pas un entier entre les bornes du réglage. */
function parsed(field: NumberField, value: unknown): number | null {
  if (!Number.isInteger(value)) return null;
  const number = value as number;
  return number >= field.min && number <= field.max ? number : null;
}

/**
 * Les réglages avec `field` changé d'après le texte tapé, ou rien si le texte n'est pas valable.
 * Les espaces qui séparent les milliers (« 2 500 ») sont permises.
 */
export function settingChanged(
  settings: Settings,
  field: NumberField,
  text: string,
): Settings | null {
  const digits = text.replace(/\s/g, "");
  const value = INTEGER.test(digits) ? parsed(field, Number(digits)) : null;
  return value === null ? null : { ...settings, [field.key]: value };
}

/** Ce qui est gardé, tel quel : n'importe quelle valeur JSON, ou rien. */
function storedValues(storage: PreferenceStorage): Readonly<Record<string, unknown>> | null {
  let stored: unknown = null;
  try {
    // Rien de gardé : `JSON.parse(null)` donne `null`.
    stored = JSON.parse(storage.getItem(KEY) as string);
  } catch {
    // Stockage refusé ou valeur abîmée : comme si rien n'était gardé.
  }
  return stored as Record<string, unknown> | null;
}

/** Les réglages gardés ; chaque réglage absent ou illisible prend sa valeur par défaut. */
export function loadSettings(storage: PreferenceStorage): Settings {
  const stored = storedValues(storage);
  let settings = DEFAULT_SETTINGS;
  for (const field of SETTING_FIELDS) {
    const value = parsed(field, stored?.[field.key]);
    if (value !== null) settings = { ...settings, [field.key]: value };
  }
  return settings;
}

/** Garde les réglages ; sans effet si le stockage est refusé (ils valent jusqu'à la fermeture). */
export function saveSettings(storage: PreferenceStorage, settings: Settings): void {
  try {
    storage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Préférences de confort : les perdre n'empêche rien.
  }
}
