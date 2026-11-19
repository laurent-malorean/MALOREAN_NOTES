// Touches de l'éditeur pour les commandes de la palette : lues dans la liste des commandes, où
// chaque raccourci n'est écrit qu'une fois, et écrites comme les lit CodeMirror.
import type { Command, KeyBinding } from "@codemirror/view";
import { COMMANDS, type CommandId } from "../../state/commands";

const MODIFIERS: Readonly<Record<string, string>> = {
  Cmd: "Mod",
  Maj: "Shift",
  Ctrl: "Ctrl",
  Alt: "Alt",
};

/** Un raccourci écrit comme dans la palette (`Cmd+Maj+8`), écrit pour CodeMirror (`Mod-Shift-8`). */
export function editorKey(shortcut: string): string {
  const parts = shortcut.split("+");
  const key = (parts.pop() as string).toLowerCase();
  return [...parts.map((modifier) => MODIFIERS[modifier]), key].join("-");
}

/** Les touches des commandes données, dans l'ordre de la liste ; une commande sans raccourci n'en a pas. */
export function commandKeys(run: Partial<Record<CommandId, Command>>): KeyBinding[] {
  return COMMANDS.flatMap((command) => {
    const action = run[command.id];
    if (action === undefined || command.shortcut === undefined) return [];
    return [{ key: editorKey(command.shortcut), run: action }];
  });
}
