// Éditeur Markdown : CodeMirror 6, Markdown GitHub, mise en forme et aperçu en direct.
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { liveFormatting } from "./live-formatting";
import { type ImageResolver, imageResolver, livePreview } from "./live-preview/plugin";
import { liveTables } from "./live-preview/tables";

export interface Editor {
  /** Affiche une autre note, sans la signaler comme modifiée. */
  show(content: string): void;
  focus(): void;
}

export function createEditor(
  parent: HTMLElement,
  onChange: (content: string) => void,
  resolveImage?: ImageResolver,
): Editor {
  const extensions = [
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
  const view = new EditorView({ parent, state: EditorState.create({ extensions }) });
  return {
    // Remplacer tout l'état ne passe par aucune transaction : rien n'est signalé comme modifié.
    show(content) {
      view.setState(EditorState.create({ doc: content, extensions }));
    },
    focus: () => view.focus(),
  };
}
