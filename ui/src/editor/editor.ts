// Éditeur Markdown : CodeMirror 6, Markdown GitHub, mise en forme et aperçu en direct.
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { focusMode } from "./focus/focus-mode";
import type { FocusUnit } from "./focus/focus-range";
import { liveFormatting } from "./live-formatting";
import { type ImageResolver, imageResolver, livePreview } from "./live-preview/plugin";
import { liveTables } from "./live-preview/tables";

export interface Editor {
  /** Affiche une autre note, sans la signaler comme modifiée. */
  show(content: string): void;
  focus(): void;
  /** Met en avant la phrase ou le paragraphe en cours ; `null` arrête le mode focus. */
  setFocusMode(unit: FocusUnit | null): void;
}

export function createEditor(
  parent: HTMLElement,
  onChange: (content: string) => void,
  resolveImage?: ImageResolver,
): Editor {
  const focus = new Compartment();
  let focusUnit: FocusUnit | null = null;
  const extensions = () => [
    focus.of(focusMode(focusUnit)),
    resolveImage ? imageResolver.of(resolveImage) : [],
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    // Chaque langue des blocs de code n'est chargée qu'à sa première apparition.
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    liveFormatting,
    livePreview,
    liveTables,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: "true", lang: "fr" }),
    placeholder("# Titre de la note"),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
  ];
  const view = new EditorView({ parent, state: EditorState.create({ extensions: extensions() }) });
  return {
    // Remplacer tout l'état ne passe par aucune transaction : rien n'est signalé comme modifié.
    show(content) {
      view.setState(EditorState.create({ doc: content, extensions: extensions() }));
    },
    focus: () => view.focus(),
    setFocusMode(unit) {
      focusUnit = unit;
      view.dispatch({ effects: focus.reconfigure(focusMode(unit)) });
    },
  };
}
