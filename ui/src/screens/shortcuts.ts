// Raccourcis clavier de la fenêtre, valables où que soit le curseur. Ceux des commandes viennent
// de la liste des commandes (state/commands.ts), où chacun n'est écrit qu'une fois.
import { MENU_COMMANDS, type MenuCommandId } from "../state/commands";

/** Ce que demande une touche : une commande, la palette, ou Échap. */
export type Shortcut = MenuCommandId | "leave-full-screen";

/**
 * Le nom d'une touche écrit comme dans les menus du Mac (`Cmd+Maj+N`), tel que `shortcutFor` le lit.
 * Une touche avec Alt n'est jamais lue ici (Alt change la lettre tapée) : l'éditeur ou la barre
 * des menus la prennent.
 */
export function keyOf(shortcut: string): string {
  const written = shortcut.toLowerCase();
  const parts = written.split("+");
  const key = written.slice(written.lastIndexOf("+") + 1);
  const has = (modifier: string) => (parts.includes(modifier) ? `${modifier}+` : "");
  return `${has("cmd")}${has("ctrl")}${has("alt")}${parts.includes("maj") ? "shift+" : ""}${key}`;
}

const SHORTCUTS: ReadonlyMap<string, Shortcut> = new Map<string, Shortcut>([
  ...MENU_COMMANDS.flatMap((command) =>
    command.shortcut === undefined ? [] : [[keyOf(command.shortcut), command.id] as const],
  ),
  ["escape", "leave-full-screen"],
]);

/** Ce qu'il faut savoir d'une touche pressée. */
export interface KeyPress {
  readonly key: string;
  /** La touche physique (`Digit0`) : sur un clavier AZERTY, les chiffres se tapent avec Maj. */
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
}

const DIGIT_KEY = /^Digit(\d)$/;

/**
 * L'action demandée par la touche, ou rien. Un chiffre se lit aussi à sa touche : sur un clavier
 * AZERTY, Cmd+0 tape « à », comme CodeMirror le fait pour ses propres touches.
 */
export function shortcutFor(press: KeyPress): Shortcut | null {
  const modifiers = `${press.metaKey ? "cmd+" : ""}${press.ctrlKey ? "ctrl+" : ""}${press.shiftKey ? "shift+" : ""}`;
  const digit = DIGIT_KEY.exec(press.code)?.[1];
  const typed = SHORTCUTS.get(`${modifiers}${press.key.toLowerCase()}`);
  // Stryker disable next-line ConditionalExpression: sans chiffre, la clé « cmd+undefined » ne désigne aucune commande : même résultat.
  return typed ?? (digit === undefined ? null : (SHORTCUTS.get(`${modifiers}${digit}`) ?? null));
}
