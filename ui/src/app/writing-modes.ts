// Outils d'écriture : mode focus, mode machine à écrire et plan de la note.
import type { Editor } from "../editor/editor";
import type { FocusUnit } from "../editor/focus/focus-range";
import type { Typewriter } from "../editor/writing/typewriter";
import { showFocusUnit, showOutline, showTypewriter } from "../screens/editor-tools";
import type { Layout } from "../screens/layout";
import {
  loadFocusUnit,
  nextFocusUnit,
  type PreferenceStorage,
  saveFocusUnit,
} from "../state/focus-preference";
import { loadTypewriter, nextTypewriter, saveTypewriter } from "../state/typewriter-preference";
import type { OpenColumns } from "./columns";

export type WritingParts = Pick<
  Layout,
  "focusButton" | "typewriterButton" | "outlineButton" | "editor" | "outline"
>;

export interface WritingDeps {
  readonly columns: Pick<OpenColumns, "current" | "panes">;
  /** Où les modes choisis sont gardés d'une session à l'autre. */
  readonly storage: PreferenceStorage;
}

export interface WritingModes {
  toggleFocus(): void;
  toggleTypewriter(): void;
  toggleOutline(): void;
  /** Le mode machine à écrire ne vaut que pour la colonne active : les autres gardent leur texte en place. */
  showTypewriter(): void;
  /** Règle l'éditeur d'une nouvelle colonne sur le mode focus en cours. */
  configure(editor: Editor): void;
}

/** Relie les boutons des outils d'écriture, et remet les modes gardés. */
export function connectWritingModes(parts: WritingParts, deps: WritingDeps): WritingModes {
  let focusUnit = loadFocusUnit(deps.storage);
  let typewriter = loadTypewriter(deps.storage);
  let outlineShown = false;
  const applyFocusUnit = (unit: FocusUnit | null) => {
    focusUnit = unit;
    deps.columns.panes().forEach((pane) => pane.editor.setFocusMode(unit));
    showFocusUnit(parts.focusButton, unit);
    saveFocusUnit(deps.storage, unit);
  };
  const showTypewriterIn = () => {
    const { active } = deps.columns.current();
    deps.columns
      .panes()
      .forEach((pane, id) => pane.editor.setTypewriter(id === active ? typewriter : "off"));
  };
  const applyTypewriter = (mode: Typewriter) => {
    typewriter = mode;
    showTypewriterIn();
    showTypewriter(parts.typewriterButton, mode);
    saveTypewriter(deps.storage, mode);
  };
  const toggleFocus = () => applyFocusUnit(nextFocusUnit(focusUnit));
  const toggleTypewriter = () => applyTypewriter(nextTypewriter(typewriter));
  const toggleOutline = () => {
    outlineShown = !outlineShown;
    showOutline(
      parts.editor,
      parts.outline,
      parts.outlineButton,
      outlineShown ? "shown" : "hidden",
    );
  };
  parts.focusButton.addEventListener("click", toggleFocus);
  parts.typewriterButton.addEventListener("click", toggleTypewriter);
  parts.outlineButton.addEventListener("click", toggleOutline);
  applyFocusUnit(focusUnit);
  applyTypewriter(typewriter);
  return {
    toggleFocus,
    toggleTypewriter,
    toggleOutline,
    showTypewriter: showTypewriterIn,
    configure: (editor) => editor.setFocusMode(focusUnit),
  };
}
