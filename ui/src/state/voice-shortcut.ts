// Raccourci de la saisie vocale, côté interface (fiche 0109) : lire la combinaison que l'utilisateur presse, l'écrire comme les
// menus du Mac (`Ctrl+Maj+D`) et en symboles (⌃⇧D), refuser celle qu'une autre commande ou macOS a déjà. Que le raccourci soit
// valide (Ctrl ou Cmd, une lettre, un chiffre ou F1 à F12) est la règle du moteur : la commande qui le garde la dit.
import { MENU_COMMANDS, shortcutOf } from "./commands";
import { isTapShortcut } from "./tap-shortcut";

/** La touche pressée, comme l'événement clavier la donne. */
export interface PressedKey {
  readonly key: string;
  /** La touche physique (`KeyD`, `Digit1`, `F5`) : lue quand Option change la lettre tapée. */
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** Ce que la pression d'une touche dit de la saisie du raccourci. */
export type Recording =
  /** Seulement des modificateurs : la combinaison n'est pas finie. */
  | { readonly kind: "waiting" }
  /** Échap : la saisie est abandonnée. */
  | { readonly kind: "cancelled" }
  /** La combinaison, écrite comme dans les menus du Mac. */
  | { readonly kind: "pressed"; readonly shortcut: string };

const MODIFIER_KEYS: ReadonlySet<string> = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph"]);
const LETTER = /^[a-z]$/i;
const DIGIT = /^Digit(\d)$/;
const LETTER_CODE = /^Key([A-Z])$/;
const FUNCTION_KEY = /^F\d{1,2}$/;

/** Le nom de la touche, comme les raccourcis l'écrivent ; Option change la lettre tapée : on lit alors la touche physique. */
function keyName(press: PressedKey): string {
  if (FUNCTION_KEY.test(press.code)) return press.code;
  const digit = DIGIT.exec(press.code)?.[1];
  if (digit !== undefined) return digit;
  if (press.key === " ") return "Space";
  if (LETTER.test(press.key)) return press.key.toUpperCase();
  return LETTER_CODE.exec(press.code)?.[1] ?? press.key;
}

/** Ce que dit la touche pressée : Échap abandonne, un modificateur seul attend, sinon la combinaison. */
export function recordKey(press: PressedKey): Recording {
  if (press.key === "Escape") return { kind: "cancelled" };
  if (MODIFIER_KEYS.has(press.key)) return { kind: "waiting" };
  const modifiers = [
    press.ctrlKey ? "Ctrl" : null,
    press.altKey ? "Alt" : null,
    press.metaKey ? "Cmd" : null,
    press.shiftKey ? "Maj" : null,
  ].filter((name) => name !== null);
  return { kind: "pressed", shortcut: [...modifiers, keyName(press)].join("+") };
}

const SYMBOLS: Readonly<Record<string, string>> = { Ctrl: "⌃", Alt: "⌥", Maj: "⇧", Cmd: "⌘" };
/** L'ordre des symboles sur le Mac : Contrôle, Option, Majuscule, Commande. */
const SYMBOL_ORDER = ["Ctrl", "Alt", "Maj", "Cmd"];

/** Le raccourci en symboles du Mac : `Ctrl+Maj+D` devient ⌃⇧D, une touche seule `Cmd droite` devient ⌘ droite. */
export function macSymbols(shortcut: string): string {
  if (isTapShortcut(shortcut)) {
    const [modifier = "", side = ""] = shortcut.split(" ");
    return `${SYMBOLS[modifier]} ${side}`;
  }
  const parts = shortcut.split("+");
  const key = parts.pop() ?? "";
  const modifiers = SYMBOL_ORDER.filter((name) => parts.includes(name));
  return `${modifiers.map((name) => SYMBOLS[name]).join("")}${key}`;
}

/** Les touches de macOS et de l'édition que la barre des menus prend déjà, avec le nom de leur commande. */
const RESERVED: readonly (readonly [string, string])[] = [
  ["Cmd+Z", "Annuler"],
  ["Cmd+Maj+Z", "Rétablir"],
  ["Cmd+X", "Couper"],
  ["Cmd+C", "Copier"],
  ["Cmd+V", "Coller"],
  ["Cmd+A", "Tout sélectionner"],
  ["Cmd+Q", "Quitter"],
  ["Cmd+H", "Masquer"],
  ["Alt+Cmd+H", "Masquer les autres"],
  ["Cmd+M", "Placer dans le Dock"],
];

/** Une combinaison sans l'ordre ni la casse : les mêmes modificateurs et la même touche, écrits comme on veut. */
function sameKeys(shortcut: string): string {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  return `${[...new Set(parts)].sort().join("+")}+${key}`;
}

/** Pourquoi `shortcut` est refusé : une autre commande l'a déjà (dite par son nom) ; rien s'il est libre. */
export function conflictOf(shortcut: string): string | null {
  const wanted = sameKeys(shortcut);
  const taken = [
    ...MENU_COMMANDS.filter((command) => command.id !== "voice-input").flatMap((command) => {
      const own = shortcutOf(command);
      return own === undefined ? [] : [[own, command.label] as const];
    }),
    ...RESERVED,
  ].find(([own]) => sameKeys(own) === wanted);
  return taken === undefined ? null : `Ce raccourci est déjà pris par « ${taken[1]} ».`;
}
