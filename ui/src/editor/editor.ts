// Éditeur Markdown : CodeMirror 6, Markdown GitHub, mise en forme et aperçu en direct.
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  Annotation,
  ChangeSet,
  Compartment,
  EditorState,
  type StateEffect,
  type Extension,
  Transaction,
} from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { type AttachmentActions, attachments, linkTargetAt } from "./attachments";
import { blockHandles } from "./blocks/block-handles";
import { focusMode } from "./focus/focus-mode";
import type { FocusUnit } from "./focus/focus-range";
import { liveFormatting } from "./live-formatting";
import { type ImageResolver, imageResolver, livePreview } from "./live-preview/plugin";
import { liveTables } from "./live-preview/tables";
import { openSearchPanel } from "@codemirror/search";
import { findReplace, openReplacePanel } from "./writing/find-replace";
import { formatCommand, formattingShortcuts } from "./writing/formatting";
import { charactersPerPage, statusBar } from "./writing/status-bar";
import { DEFAULT_SETTINGS } from "../state/settings";
import type { FormatCommandId } from "../state/commands";
import { outlinePanel } from "./outline/outline-panel";
import { linkMenu } from "./links/link-menu";
import { linkStatus } from "./links/link-status";
import { type EditorLinks, linkSiteOf } from "./links/link-site";
import { noteLinkAt, noteLinks, type OpenNoteLink } from "./links/note-links";
import { createDictation, type Dictation } from "./voice/dictation";
import { insertToday, type Today, todayShortcut } from "./writing/today";
import { type Typewriter, typewriterMode, typewriterStarted } from "./writing/typewriter";
import { listContinuation } from "./writing/lists";
import { firstTitle } from "./writing/first-title";
import { agendaEventProperties } from "./agenda-event-properties";
import {
  type AddEntry,
  type CopyReference,
  researchNotebook,
  revealEntryIn,
} from "./research-notebook";
import { keptPosition } from "../state/external-change";
import { firstMatch } from "../state/search-match";
import type { NotePosition } from "../state/trail";

/**
 * Marque une transaction venue d'ailleurs que de la frappe dans cet éditeur — version du disque,
 * frappe dans une autre colonne : ce n'est pas une modification à signaler.
 */
const fromElsewhere = Annotation.define<boolean>();

/** Une transaction venue d'ailleurs reste hors de l'historique d'annulation de cet éditeur. */
const elsewhere = [fromElsewhere.of(true), Transaction.addToHistory.of(false)];

export interface Editor {
  /** Affiche une autre note, sans la signaler comme modifiée. */
  show(content: string): void;
  /** Montre la version relue sur le disque, curseur gardé, sans la signaler comme modifiée. */
  reload(content: string): void;
  /** Le texte montré. */
  content(): string;
  /** Le texte sélectionné (sélection principale), vide sans sélection. */
  selectedText(): string;
  /** Le début et la fin de la sélection principale, dans le texte. */
  selectedRange(): { readonly from: number; readonly to: number };
  /** Remplace le texte de `from` à `to` par `insert`, comme une frappe : signalé et annulable. */
  replaceRange(from: number, to: number, insert: string): void;
  /** L'élément `target` fait-il partie de cet éditeur à l'écran ? */
  owns(target: EventTarget | null): boolean;
  /**
   * Suit ce qui a été tapé dans une autre colonne sur la même note, devenue `content` :
   * curseur, sélection et défilement gardés, sans le signaler ni l'ajouter à l'historique.
   */
  follow(changes: ChangeSet, content: string): void;
  focus(): void;
  /** Met en avant la phrase ou le paragraphe en cours ; `null` arrête le mode focus. */
  setFocusMode(unit: FocusUnit | null): void;
  /** Garde, ou non, la ligne en cours au milieu de l'écran. */
  setTypewriter(mode: Typewriter): void;
  /** Le nombre de caractères d'une page, pour le bandeau. */
  setCharactersPerPage(characters: number): void;
  /** Ouvre la recherche dans la note, comme Cmd+F. */
  openFind(): void;
  /** Ouvre la recherche, le curseur dans le champ de remplacement, comme Alt+Cmd+F. */
  openReplace(): void;
  /** Met en forme la sélection, comme le raccourci de la commande. */
  format(command: FormatCommandId): void;
  /** Le texte peut-il s'écrire ici ? Faux pour un cahier de recherche (lecture seule). */
  writable(): boolean;
  /** La saisie vocale de cet éditeur : texte provisoire en décor, texte fixé écrit au curseur. */
  readonly dictation: Dictation;
  /** Insère la date du jour à la place de la sélection, comme Cmd+Maj+D. */
  insertToday(): void;
  /** Ouvre le lien où se trouve le curseur, comme un clic dessus ; rien s'il n'y en a pas. */
  openLinkAtCursor(): void;
  /** Où l'on en est dans la note : la sélection et le défilement. */
  position(): NotePosition;
  /** Revient à une position prise plus tôt dans la même note ; bornée au texte s'il a raccourci. */
  restore(position: NotePosition): void;
  /** Va au premier passage où paraît un mot de la recherche : sélectionné et montré ; faux s'il n'y est pas. */
  reveal(query: string): boolean;
  /** Montre l'entrée d'un cahier de recherche de ce numéro d'entrée (à partir de 1) : en haut, mise en évidence un instant ; faux, sans rien changer, si elle n'existe pas. */
  revealEntry(number: number): boolean;
  /** Dessine le plan de la note dans `container` ; `null` arrête de le dessiner. */
  setOutline(container: HTMLElement | null): void;
  /** Retire l'éditeur de l'écran, quand sa colonne disparaît. */
  destroy(): void;
}

/** Ce que l'éditeur peut recevoir de l'application ; chaque élément est facultatif. */
export interface EditorOptions {
  /** Traduit l'adresse d'une image écrite dans la note en adresse chargeable. */
  readonly resolveImage?: ImageResolver;
  /** Joint un fichier collé ou glissé, ouvre une pièce jointe. */
  readonly attachmentActions?: AttachmentActions;
  /** Donne la date du jour ; la vraie date par défaut. */
  readonly today?: Today;
  /** Où dessiner le plan de la note, dès le départ. */
  readonly outline?: HTMLElement;
  /** Ouvre la note désignée par un lien `[[titre]]`. */
  readonly openLink?: OpenNoteLink;
  /** Ce qu'on peut lier : sans lui, `[[` et `/` n'ouvrent pas le menu des liens. */
  readonly links?: EditorLinks;
  /** Ajoute au cahier de recherche montré l'entrée saisie dans sa zone de saisie ; sans elle, pas de zone. */
  readonly addEntry?: AddEntry;
  /** Copie la référence d'une entrée du cahier montré (clic sur son numéro) ; sans elle, pas de numéro d'entrée. */
  readonly copyReference?: CopyReference;
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
    value: () => value,
    change(next: T) {
      value = next;
      return compartment.reconfigure(make(next));
    },
  };
}

/** Les parties de l'éditeur qui suivent un réglage, ou une demande de l'application. */
function adjustableParts(outline: HTMLElement | null) {
  return {
    focus: adjustable<FocusUnit | null>(focusMode, null),
    typewriter: adjustable<Typewriter>(typewriterMode, "off"),
    outlineArea: adjustable<HTMLElement | null>(
      (container) => (container ? outlinePanel(container) : []),
      outline,
    ),
    page: adjustable(
      (characters: number) => charactersPerPage.of(characters),
      DEFAULT_SETTINGS.charactersPerPage,
    ),
  };
}

/** Redemander le même mode ne déplace rien ; le mettre en marche centre la ligne du curseur. */
function typewriterSwitch(view: EditorView, typewriter: ReturnType<typeof adjustable<Typewriter>>) {
  return (mode: Typewriter) => {
    if (mode === typewriter.value()) return;
    view.dispatch({ effects: typewriter.change(mode) });
    if (mode === "on") view.dispatch(typewriterStarted(view.state));
  };
}

/** Montre la version relue sur le disque, le curseur gardé à la même ligne et à la même colonne. */
function reload(view: EditorView, content: string) {
  const { doc, selection } = view.state;
  const line = doc.lineAt(selection.main.head);
  view.dispatch({
    changes: { from: 0, to: doc.length, insert: content },
    selection: { anchor: keptPosition(content, line.number, selection.main.head - line.from) },
    annotations: elsewhere,
  });
}

/**
 * Suit ce qui a été tapé dans une autre colonne : le texte à l'écran reste en place, même si
 * l'autre colonne écrit au-dessus. Par prudence, un changement qui ne correspond plus au texte
 * montré est remplacé par le texte entier plutôt que refusé.
 */
function follower(view: EditorView) {
  /** La position à retrouver, tant que l'écran n'a pas été redessiné. */
  let pending: StateEffect<unknown> | undefined;
  // Dès que l'écran est redessiné, la position est retrouvée : la suivante se prendra à neuf.
  const settled = {
    read: () => {
      pending = undefined;
    },
  };
  return (changes: ChangeSet, content: string) => {
    const { length } = view.state.doc;
    const change =
      changes.length === length
        ? changes
        : ChangeSet.of({ from: 0, to: length, insert: content }, length);
    // Une position prise avant que l'écran ait rattrapé la frappe précédente serait fausse.
    pending = (pending ?? view.scrollSnapshot()).map(change);
    view.dispatch({ changes: change, effects: pending, annotations: elsewhere });
    view.requestMeasure(settled);
  };
}

/** Les commandes de l'éditeur lancées par le menu, la palette ou un bouton : recherche, mise en forme, date, lien. */
function commandParts(
  view: EditorView,
  options: EditorOptions,
  today: Today,
): Pick<Editor, "openFind" | "openReplace" | "format" | "insertToday" | "openLinkAtCursor"> {
  return {
    openFind: () => void openSearchPanel(view),
    openReplace: () => void openReplacePanel(view),
    format: (command) => void formatCommand(command, linkChooser(options))(view),
    insertToday: () => void insertToday(today)(view),
    openLinkAtCursor: linkOpener(view, options),
  };
}

/** La sélection principale : son texte, ses bornes, et le remplacement d'un passage. */
function selectionParts(
  view: EditorView,
): Pick<Editor, "selectedText" | "selectedRange" | "replaceRange"> {
  return {
    selectedText: () =>
      view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to),
    selectedRange: () => ({
      from: view.state.selection.main.from,
      to: view.state.selection.main.to,
    }),
    // Comme une frappe : signalé à l'enregistrement, aux autres colonnes et à l'annulation.
    replaceRange: (from, to, insert) =>
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
      }),
  };
}

/** Ouvre le lien entre notes, sinon la cible du lien Markdown, à la position du curseur. */
function linkOpener(view: EditorView, options: EditorOptions) {
  return () => {
    const { openLink, attachmentActions } = options;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const title = noteLinkAt(line.text, pos - line.from);
    if (openLink && title !== null) return openLink(title, false);
    const target = linkTargetAt(view.state, pos);
    if (attachmentActions && target !== null) attachmentActions.open(target);
  };
}

/** La sélection principale, et la première ligne visible avec le décalage du haut de l'écran sur elle. */
function positionIn(view: EditorView): NotePosition {
  const { anchor, head } = view.state.selection.main;
  const visibleTop = view.scrollDOM.getBoundingClientRect().top;
  const top = view.lineBlockAtHeight(visibleTop - view.documentTop).from;
  // Stryker disable next-line OptionalChaining: la première ligne visible est toujours dessinée ; TypeScript exige le cas contraire.
  const offset = visibleTop - (view.coordsAtPos(top, 1)?.top ?? visibleTop);
  return { anchor, head, top, offset };
}

/** La sélection remise, et la même ligne en haut de l'écran, au même décalage. */
function restoreIn(view: EditorView, position: NotePosition) {
  const within = (pos: number) => Math.min(pos, view.state.doc.length);
  view.dispatch({
    selection: { anchor: within(position.anchor), head: within(position.head) },
    effects: EditorView.scrollIntoView(within(position.top), {
      y: "start",
      yMargin: -position.offset,
    }),
  });
}

/** La position dans la note : la prendre, et y revenir. */
function positionParts(
  view: EditorView,
): Pick<Editor, "position" | "restore" | "reveal" | "revealEntry"> {
  return {
    position: () => positionIn(view),
    restore: (position) => restoreIn(view, position),
    reveal: (query) => revealIn(view, query),
    revealEntry: (number) => revealEntryIn(view, number),
  };
}

/** La sélection sur le premier passage de la recherche, montré au milieu de l'écran. */
function revealIn(view: EditorView, query: string): boolean {
  const span = firstMatch(view.state.doc.toString(), query);
  if (span === null) return false;
  view.dispatch({
    selection: { anchor: span.from, head: span.to },
    effects: EditorView.scrollIntoView(span.from, { y: "center" }),
  });
  return true;
}

/** Le bouton « Lien », quand l'application sait demander ce qu'on lie ; sans elle, « Lien » vise une page web. */
function linkChooser({ links }: EditorOptions): ((view: EditorView) => void) | undefined {
  const choose = links?.choose;
  return choose && ((view) => choose(linkSiteOf(view)));
}

/** Signale à `onChange` ce qui est tapé ici ; une transaction venue d'ailleurs (autre colonne, disque) ne l'est pas. */
function typingListener(onChange: (content: string, changes: ChangeSet) => void): Extension {
  return EditorView.updateListener.of((update) => {
    // Stryker disable next-line MethodExpression: l'éditeur applique ses transactions une à une ; « une » ou « toutes » revient au même.
    const typed = update.transactions.some((t) => t.docChanged && !t.annotation(fromElsewhere));
    if (typed) onChange(update.state.doc.toString(), update.changes);
  });
}

export function createEditor(
  parent: HTMLElement,
  onChange: (content: string, changes: ChangeSet) => void,
  options: EditorOptions = {},
): Editor {
  const { resolveImage, attachmentActions, today = () => new Date(), outline, openLink } = options;
  const { focus, typewriter, outlineArea, page } = adjustableParts(outline ?? null);
  const voice = createDictation(fromElsewhere);
  const extensions = () => [
    focus.extension(),
    typewriter.extension(),
    resolveImage ? imageResolver.of(resolveImage) : [],
    attachmentActions ? attachments(attachmentActions) : [],
    openLink ? noteLinks(openLink) : [],
    options.links ? [linkMenu(options.links), linkStatus(options.links)] : [],
    researchNotebook(fromElsewhere, options.addEntry, today, options.copyReference),
    agendaEventProperties(fromElsewhere),
    history(),
    [listContinuation, firstTitle, findReplace],
    // Avant les raccourcis de CodeMirror : Cmd+I y sélectionne l'élément parent.
    formattingShortcuts(linkChooser(options)),
    todayShortcut(today),
    voice.extension,
    blockHandles({ blocked: voice.listening }),
    page.extension(),
    statusBar,
    outlineArea.extension(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    // Chaque langue des blocs de code n'est chargée qu'à sa première apparition.
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    liveFormatting,
    livePreview,
    liveTables,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: "true", lang: "fr" }),
    placeholder("# Titre de la note"),
    typingListener(onChange),
  ];
  const view = new EditorView({ parent, state: EditorState.create({ extensions: extensions() }) });
  return {
    // Remplacer tout l'état ne passe par aucune transaction : rien n'est signalé comme modifié.
    show(content) {
      view.setState(EditorState.create({ doc: content, extensions: extensions() }));
      // Une note qu'on ouvre se montre depuis son début, pas là où l'on était dans la précédente.
      view.scrollDOM.scrollTop = 0;
    },
    reload: (content) => reload(view, content),
    content: () => view.state.doc.toString(),
    ...selectionParts(view),
    owns: (target) => target instanceof Node && view.dom.contains(target),
    follow: follower(view),
    focus: () => view.focus(),
    setFocusMode: (unit) => view.dispatch({ effects: focus.change(unit) }),
    setTypewriter: typewriterSwitch(view, typewriter),
    setCharactersPerPage: (characters) => view.dispatch({ effects: page.change(characters) }),
    ...commandParts(view, options, today),
    ...voice.parts(view),
    ...positionParts(view),
    setOutline: (container) => view.dispatch({ effects: outlineArea.change(container) }),
    destroy: () => view.destroy(),
  };
}
