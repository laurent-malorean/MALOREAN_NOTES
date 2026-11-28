// Raccourcis clavier de la fenêtre, valables où que soit le curseur. Ceux des commandes viennent
// de la liste des commandes (state/commands.ts), où chacun n'est écrit qu'une fois.
import { MENU_COMMANDS, type MenuCommandId, shortcutOf, shortcutsChanged } from "../state/commands";
import { isTapShortcut } from "../state/tap-shortcut";

/** Ce que demande une touche : une commande, la palette, ou Échap. */
export type Shortcut = MenuCommandId | "leave-full-screen";

/**
 * Le nom d'une touche écrit comme dans les menus du Mac (`Cmd+Maj+N`), tel que `shortcutFor` le lit.
 * Une touche avec Alt est lue ici à sa touche physique (Alt change la lettre tapée) ; la barre des
 * menus ne la reçoit que si la fenêtre ne l'a pas prise.
 */
export function keyOf(shortcut: string): string {
  const written = shortcut.toLowerCase();
  const parts = written.split("+");
  const key = written.slice(written.lastIndexOf("+") + 1);
  const has = (modifier: string) => (parts.includes(modifier) ? `${modifier}+` : "");
  return `${has("cmd")}${has("ctrl")}${has("alt")}${parts.includes("maj") ? "shift+" : ""}${key}`;
}

/** Les touches et ce qu'elles lancent ; refaite quand un raccourci est choisi (saisie vocale). */
let table: { readonly built: number; readonly map: ReadonlyMap<string, Shortcut> } | null = null;

function shortcuts(): ReadonlyMap<string, Shortcut> {
  if (table === null || table.built !== shortcutsChanged())
    table = {
      built: shortcutsChanged(),
      map: new Map<string, Shortcut>([
        ...MENU_COMMANDS.flatMap((command) => {
          const shortcut = shortcutOf(command);
          // Une touche de modificateur seule se déclenche au tapotement (`app/tap-shortcut.ts`), pas à l'appui d'une touche.
          return shortcut === undefined || isTapShortcut(shortcut)
            ? []
            : [[keyOf(shortcut), command.id] as const];
        }),
        ["escape", "leave-full-screen"],
      ]),
    };
  return table.map;
}

/** Ce qu'il faut savoir d'une touche pressée. */
export interface KeyPress {
  readonly key: string;
  /** La touche physique (`Digit0`) : sur un clavier AZERTY, les chiffres se tapent avec Maj. */
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  /** Option change la lettre tapée : la touche est alors lue à sa touche physique (`code`). */
  readonly altKey?: boolean;
}

const DIGIT_KEY = /^Digit(\d)$/;
const LETTER_KEY = /^Key([A-Z])$/;
const FUNCTION_KEY = /^F\d{1,2}$/;

/**
 * Avec Option, la lettre tapée n'est plus celle de la touche (Option+E tape « ´ », et WebKit y voit une touche morte) : la touche
 * physique dit laquelle. Une touche sans lettre (Tab, flèches) se lit telle quelle.
 */
function physicalKey(press: KeyPress): string {
  const letter = LETTER_KEY.exec(press.code)?.[1];
  if (letter !== undefined) return letter.toLowerCase();
  const digit = DIGIT_KEY.exec(press.code)?.[1];
  if (digit !== undefined) return digit;
  return FUNCTION_KEY.test(press.code) ? press.code.toLowerCase() : press.key.toLowerCase();
}

/** Les modificateurs pressés, dans l'ordre où `keyOf` les écrit (`cmd+ctrl+alt+shift+`). */
function modifiersOf(press: KeyPress): string {
  return `${press.metaKey ? "cmd+" : ""}${press.ctrlKey ? "ctrl+" : ""}${press.altKey ? "alt+" : ""}${press.shiftKey ? "shift+" : ""}`;
}

/**
 * L'action demandée par la touche, ou rien. Un chiffre se lit aussi à sa touche : sur un clavier
 * AZERTY, Cmd+0 tape « à », comme CodeMirror le fait pour ses propres touches. Une touche avec Option
 * se lit à sa touche physique (`physicalKey`) : la fenêtre la prend elle-même, sans attendre la barre des menus.
 */
export function shortcutFor(press: KeyPress): Shortcut | null {
  const modifiers = modifiersOf(press);
  if (press.altKey) return shortcuts().get(`${modifiers}${physicalKey(press)}`) ?? null;
  const digit = DIGIT_KEY.exec(press.code)?.[1];
  const typed = shortcuts().get(`${modifiers}${press.key.toLowerCase()}`);
  // Stryker disable next-line ConditionalExpression: sans chiffre, la clé « cmd+undefined » ne désigne aucune commande : même résultat.
  return typed ?? (digit === undefined ? null : (shortcuts().get(`${modifiers}${digit}`) ?? null));
}
