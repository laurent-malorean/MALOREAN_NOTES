// Éditeur Markdown : CodeMirror 6, Markdown GitHub, mise en forme en direct.
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { liveFormatting } from "./live-formatting";

export interface Editor {
  /** Affiche une autre note, sans la signaler comme modifiée. */
  show(content: string): void;
  focus(): void;
}

export function createEditor(parent: HTMLElement, onChange: (content: string) => void): Editor {
  let loading = false;
  const extensions = [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    markdown({ base: markdownLanguage }),
    liveFormatting,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: "true", lang: "fr" }),
    placeholder("# Titre de la note"),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !loading) onChange(update.state.doc.toString());
    }),
  ];
  const view = new EditorView({ parent, state: EditorState.create({ extensions }) });
  return {
    show(content) {
      loading = true;
      view.setState(EditorState.create({ doc: content, extensions }));
      loading = false;
    },
    focus: () => view.focus(),
  };
}
