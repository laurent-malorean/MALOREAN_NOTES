// Réglages de l'application : leurs valeurs par défaut, leurs bornes, et leur garde d'un lancement à l'autre.
import type { PreferenceStorage } from "./focus-preference";

export type Font = "serif" | "sans" | "mono";
export type TextSize = "small" | "medium" | "large" | "larger";
export type TextWidth = "narrow" | "medium" | "wide";
export type Appearance = "auto" | "light" | "dark";
/** Ce que Claude fait de ses créations et modifications après avoir lu le web (fiche 0032). */
export type ClaudeChanges = "allow" | "ask";

export interface Settings {
  /** Nombre de caractères d'une page, pour le bandeau. */
  readonly charactersPerPage: number;
  readonly font: Font;
  readonly textSize: TextSize;
  readonly textWidth: TextWidth;
  readonly appearance: Appearance;
  readonly claudeChangesAfterWeb: ClaudeChanges;
}

export const DEFAULT_SETTINGS: Settings = {
  charactersPerPage: 1500,
  font: "serif",
  textSize: "medium",
  textWidth: "medium",
  appearance: "auto",
  claudeChangesAfterWeb: "allow",
};

/** Ce que tout réglage montre sur l'écran de réglages. */
interface FieldText {
  readonly label: string;
  readonly help: string;
  /** La partie de l'écran où il se trouve. */
  readonly group: "Écriture" | "Affichage" | "Claude";
}

/** Un réglage nombre : un entier entre deux bornes. */
export interface NumberField extends FieldText {
  readonly kind: "number";
  readonly key: "charactersPerPage";
  readonly min: number;
  readonly max: number;
}

export interface Choice {
  readonly value: string;
  readonly label: string;
}

/** Un réglage à choix : une valeur parmi une liste. */
export interface ChoiceField extends FieldText {
  readonly kind: "choice";
  readonly key: "font" | "textSize" | "textWidth" | "appearance" | "claudeChangesAfterWeb";
  readonly choices: readonly Choice[];
}

export type SettingField = NumberField | ChoiceField;

/** Les réglages, dans l'ordre de l'écran. Un nouveau réglage s'ajoute ici. */
export const SETTING_FIELDS: readonly SettingField[] = [
  {
    kind: "number",
    key: "charactersPerPage",
    group: "Écriture",
    label: "Caractères par page",
    help: "Pour le nombre de pages du bandeau, espaces comprises. Un feuillet : 1 500.",
    min: 100,
    max: 100_000,
  },
  {
    kind: "choice",
    key: "font",
    group: "Affichage",
    label: "Police",
    help: "Pour le texte des notes.",
    choices: [
      { value: "serif", label: "Avec empattements" },
      { value: "sans", label: "Sans empattements" },
      { value: "mono", label: "Chasse fixe" },
    ],
  },
  {
    kind: "choice",
    key: "textSize",
    group: "Affichage",
    label: "Taille du texte",
    help: "Pour le texte des notes.",
    choices: [
      { value: "small", label: "Petite" },
      { value: "medium", label: "Moyenne" },
      { value: "large", label: "Grande" },
      { value: "larger", label: "Très grande" },
    ],
  },
  {
    kind: "choice",
    key: "textWidth",
    group: "Affichage",
    label: "Largeur du texte",
    help: "Largeur de la colonne de texte dans la fenêtre.",
    choices: [
      { value: "narrow", label: "Étroite" },
      { value: "medium", label: "Moyenne" },
      { value: "wide", label: "Large" },
    ],
  },
  {
    kind: "choice",
    key: "appearance",
    group: "Affichage",
    label: "Apparence",
    help: "Automatique : claire ou sombre, comme le Mac.",
    choices: [
      { value: "auto", label: "Automatique" },
      { value: "light", label: "Claire" },
      { value: "dark", label: "Sombre" },
    ],
  },
  {
    kind: "choice",
    key: "claudeChangesAfterWeb",
    group: "Claude",
    label: "Modifications après une lecture du web",
    help: "Laisser : Claude crée et modifie les notes de l'espace de travail sans rien demander, même après avoir lu le web. Demander mon accord : ses modifications attendent votre accord dès qu'il a lu le web.",
    choices: [
      { value: "allow", label: "Laisser Claude modifier" },
      { value: "ask", label: "Demander mon accord" },
    ],
  },
];

const KEY = "malorean.settings";
const INTEGER = /^\d+$/;

/** La valeur si elle est permise pour ce réglage, sinon rien. */
function allowed(field: SettingField, value: unknown): string | number | null {
  if (field.kind === "choice")
    return field.choices.some((c) => c.value === value) ? (value as string) : null;
  if (!Number.isInteger(value)) return null;
  const number = value as number;
  return number >= field.min && number <= field.max ? number : null;
}

/**
 * Les réglages avec `field` changé d'après ce qui est tapé ou choisi, ou rien si ce n'est pas
 * valable. Dans un nombre, les espaces qui séparent les milliers (« 2 500 ») sont permises.
 */
export function settingChanged(
  settings: Settings,
  field: SettingField,
  text: string,
): Settings | null {
  let value: unknown = text;
  if (field.kind === "number") {
    const digits = text.replace(/\s/g, "");
    value = INTEGER.test(digits) ? Number(digits) : null;
  }
  const kept = allowed(field, value);
  return kept === null ? null : { ...settings, [field.key]: kept };
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
    const value = allowed(field, stored?.[field.key]);
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
