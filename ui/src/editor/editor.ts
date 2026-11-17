// Éditeur Markdown : CodeMirror 6, Markdown GitHub, mise en forme et aperçu en direct.
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  Annotation,
  Compartment,
  EditorState,
  type Extension,
  Transaction,
} from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { type AttachmentActions, attachments } from "./attachments";
import { focusMode } from "./focus/focus-mode";
import type { FocusUnit } from "./focus/focus-range";
import { liveFormatting } from "./live-formatting";
import { type ImageResolver, imageResolver, livePreview } from "./live-preview/plugin";
import { liveTables } from "./live-preview/tables";
import { findReplace } from "./writing/find-replace";
import { formattingShortcuts } from "./writing/formatting";
import { charactersPerPage, statusBar } from "./writing/status-bar";
import { DEFAULT_SETTINGS } from "../state/settings";
import { outlinePanel } from "./outline/outline-panel";
import { type Today, todayShortcut } from "./writing/today";
import { type Typewriter, typewriterMode } from "./writing/typewriter";
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
  /** Garde, ou non, la ligne en cours au milieu de l'écran. */
  setTypewriter(mode: Typewriter): void;
  /** Le nombre de caractères d'une page, pour le bandeau. */
  setCharactersPerPage(characters: number): void;
}

/** Ce que l'éditeur peut recevoir de l'application ; chaque élément est facultatif. */
export interface EditorOptions {
  /** Traduit l'adresse d'une image écrite dans la note en adresse chargeable. */
  readonly resolveImage?: ImageResolver;
  /** Joint un fichier collé ou glissé, ouvre une pièce jointe. */
  readonly attachmentActions?: AttachmentActions;
  /** Donne la date du jour ; la vraie date par défaut. */
  readonly today?: Today;
  /** Où dessiner le plan de la note. */
  readonly outline?: HTMLElement;
}

/**
 * Une partie de l'éditeur qui dépend d'un réglage : elle suit chaque changement, et une autre
 * note ouverte la reçoit avec le réglage en cours.
 */
function adjustable<T>(make: (value: T) => Extension, initial: T) {
  const compartment = new Compartment();
  let value = initial;
  return {
    extension: () => compartment.of(make(value)),
    change(next: T) {
      value = next;
      return compartment.reconfigure(make(next));
    },
  };
}

export function createEditor(
  parent: HTMLElement,
  onChange: (content: string) => void,
  options: EditorOptions = {},
): Editor {
  const { resolveImage, attachmentActions, today = () => new Date(), outline } = options;
  const focus = adjustable<FocusUnit | null>(focusMode, null);
  const typewriter = adjustable<Typewriter>(typewriterMode, "off");
  const page = adjustable(
    (characters: number) => charactersPerPage.of(characters),
    DEFAULT_SETTINGS.charactersPerPage,
  );
  const extensions = () => [
    focus.extension(),
    typewriter.extension(),
    resolveImage ? imageResolver.of(resolveImage) : [],
    attachmentActions ? attachments(attachmentActions) : [],
    history(),
    listContinuation,
    findReplace,
    // Avant les raccourcis de CodeMirror : Cmd+I y sélectionne l'élément parent.
    formattingShortcuts,
    todayShortcut(today),
    page.extension(),
    statusBar,
    outline ? outlinePanel(outline) : [],
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
    setFocusMode: (unit) => view.dispatch({ effects: focus.change(unit) }),
    setTypewriter: (mode) => view.dispatch({ effects: typewriter.change(mode) }),
    setCharactersPerPage: (characters) => view.dispatch({ effects: page.change(characters) }),
  };
}
