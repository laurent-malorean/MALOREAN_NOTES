// Éditeur Markdown : CodeMirror 6, Markdown GitHub, mise en forme et aperçu en direct.
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { type AttachmentActions, attachments } from "./attachments";
import { focusMode } from "./focus/focus-mode";
import type { FocusUnit } from "./focus/focus-range";
import { liveFormatting } from "./live-formatting";
import { type ImageResolver, imageResolver, livePreview } from "./live-preview/plugin";
import { liveTables } from "./live-preview/tables";
import { findReplace } from "./writing/find-replace";
import { formattingShortcuts } from "./writing/formatting";
import { listContinuation } from "./writing/lists";
import { keptPosition } from "../state/external-change";

/** Marque une transaction qui montre la version du disque : ce n'est pas une modification. */
const fromDisk = Annotation.define<boolean>();

export interface Editor {
  /** Affiche une autre note, sans la signaler comme modifiée. */
  show(content: string): void;
  /** Montre la version relue sur le disque, curseur gardé, sans la signaler comme modifiée. */
  reload(content: string): void;
  focus(): void;
  /** Met en avant la phrase ou le paragraphe en cours ; `null` arrête le mode focus. */
  setFocusMode(unit: FocusUnit | null): void;
}

export function createEditor(
  parent: HTMLElement,
  onChange: (content: string) => void,
  resolveImage?: ImageResolver,
  attachmentActions?: AttachmentActions,
): Editor {
  const focus = new Compartment();
  let focusUnit: FocusUnit | null = null;
  const extensions = () => [
    focus.of(focusMode(focusUnit)),
    resolveImage ? imageResolver.of(resolveImage) : [],
    attachmentActions ? attachments(attachmentActions) : [],
    history(),
    listContinuation,
    findReplace,
    // Avant les raccourcis de CodeMirror : Cmd+I y sélectionne l'élément parent.
    formattingShortcuts,
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
      // Stryker disable next-line MethodExpression: l'éditeur applique ses transactions une à une ; « une » ou « toutes » revient au même.
      const typed = update.transactions.some((t) => t.docChanged && !t.annotation(fromDisk));
      if (typed) onChange(update.state.doc.toString());
    }),
  ];
  const view = new EditorView({ parent, state: EditorState.create({ extensions: extensions() }) });
  return {
    // Remplacer tout l'état ne passe par aucune transaction : rien n'est signalé comme modifié.
    show(content) {
      view.setState(EditorState.create({ doc: content, extensions: extensions() }));
    },
    reload(content) {
      const { doc, selection } = view.state;
      const line = doc.lineAt(selection.main.head);
      view.dispatch({
        changes: { from: 0, to: doc.length, insert: content },
        selection: { anchor: keptPosition(content, line.number, selection.main.head - line.from) },
        annotations: [fromDisk.of(true), Transaction.addToHistory.of(false)],
      });
    },
    focus: () => view.focus(),
    setFocusMode(unit) {
      focusUnit = unit;
      view.dispatch({ effects: focus.reconfigure(focusMode(unit)) });
    },
  };
}
