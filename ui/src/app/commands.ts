// Commandes : ce que fait chaque commande de la palette et chaque raccourci clavier, l'ouverture
// rapide d'une note par son titre et le choix du tri de la liste.
import type { NewContents } from "./new-contents";
import type * as Bridge from "../bridge";
import { openAbout } from "../screens/about-view";
import { openPicker } from "../screens/picker";
import { type Shortcut, shortcutFor } from "../screens/shortcuts";
import type { WindowDisplay } from "../screens/window-display";
import { activeTabClosed, notePlaced, tabStepped } from "../state/columns";
import {
  type CommandId,
  type FormatCommandId,
  matchingCommands,
  type MenuCommandId,
} from "../state/commands";
import { NOTE_ORDERS, type NoteOrder } from "../state/note-order";
import { matching, matchingNotes } from "../state/quick-open";
import { noteOrder } from "../state/screen";
import type { Editor } from "../editor/editor";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { Exporting } from "./export";
import type { NoteHistory } from "./history";
import type { Meaning } from "./meaning";
import type { WritingAssistance } from "./writing-assistant";
import type { WritingModes } from "./writing-modes";
import type { Workspaces } from "./workspaces";

export interface CommandsDeps {
  readonly backend: Pick<typeof Bridge, "listAllNotes" | "openWebAddress">;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "update" | "split" | "openNote" | "activePane">;
  readonly writing: Pick<WritingModes, "toggleFocus" | "toggleTypewriter" | "toggleOutline">;
  readonly window: WindowDisplay;
  /** La fenêtre de choix au clavier, et le champ de recherche dans tout l'espace de travail. */
  readonly picker: HTMLDialogElement;
  readonly searchField: HTMLElement;
  readonly workspace: {
    createNote(): Promise<void>;
    sortBy(order: NoteOrder): Promise<void>;
    rebuildIndex(): Promise<void>;
  };
  /** Les espaces de travail : passer de l'un à l'autre, en ajouter, renommer, retirer. */
  readonly workspaces: Pick<Workspaces, "choose" | "add" | "rename" | "chooseRemoval">;
  readonly templates: { newNote(): Promise<void> };
  /** La note du jour du journal. */
  readonly journal: { open(): Promise<void> };
  /** Les cahiers de recherche : en créer un, ajouter une entrée sans en ouvrir. */
  readonly notebooks: Pick<
    NewContents,
    "create" | "createMindMap" | "createCanvas" | "createCrm" | "createAgenda12"
  >;
  readonly folders: { startCreation(): void };
  readonly trash: { show(): Promise<void> };
  readonly settings: { open(): void };
  /** Le filtre par étiquette, que retire Échap ; faux s'il n'y en avait pas. */
  readonly tags: { clear(): boolean };
  /** Les notes récentes, que l'ouverture rapide propose d'abord. */
  readonly recent: { paths(): readonly string[] };
  /** L'export et l'impression de la note de la colonne active. */
  readonly exporting: Exporting;
  /** L'historique de la note de la colonne active. */
  readonly history: NoteHistory;
  /** L'aide à l'écriture, sur la sélection de la colonne active. */
  readonly assistant: Pick<WritingAssistance, "propose">;
  /** La colonne Claude Code, affichée ou masquée. */
  readonly claude: { toggle(): void };
  /** La recherche par le sens : son mode, et les notes proches sous le texte. */
  readonly meaning: Pick<Meaning, "toggleRelated">;
  run(action: Promise<unknown>): void;
}

/**
 * Ouverture rapide : une note de n'importe quel dossier, par quelques lettres de son titre (les
 * notes récentes d'abord tant que rien n'est tapé) ; dans un nouvel onglet pour Cmd+T.
 */
async function quickOpen(
  deps: CommandsDeps,
  label = "Ouvrir une note",
  open: (path: string) => Promise<void> = deps.columns.openNote,
) {
  if (deps.screen.get().kind !== "workspace") return;
  const notes = await deps.backend.listAllNotes();
  openPicker(deps.picker, {
    label,
    placeholder: "Titre de la note",
    empty: "Aucune note ne correspond",
    entries: (query) => matchingNotes(notes, query, deps.recent.paths()),
    describe: (note) => ({ label: note.title, detail: note.folder }),
    choose: (note) => deps.run(open(note.path)),
  });
}

/** Le tri de la liste, choisi au clavier ; le tri en cours est marqué. */
function chooseOrder(deps: CommandsDeps) {
  const current = noteOrder(deps.screen.get());
  openPicker(deps.picker, {
    label: "Trier la liste",
    placeholder: "Trier par",
    empty: "Aucun tri ne correspond",
    entries: (query) => matching(NOTE_ORDERS, query, (choice) => choice.label),
    describe: ({ order, label }) => ({ label, detail: order === current ? "actuel" : undefined }),
    choose: ({ order }) => deps.run(deps.workspace.sortBy(order)),
  });
}

/** Les commandes qui écrivent dans la note de la colonne active : rien sans note montrée. */
function editingActions(columns: CommandsDeps["columns"]) {
  const inNote = (act: (editor: Editor) => void) => () => {
    const pane = columns.activePane();
    if (pane.note() !== null) act(pane.editor);
  };
  const format = (id: FormatCommandId) => inNote((editor) => editor.format(id));
  return {
    "open-link": inNote((editor) => editor.openLinkAtCursor()),
    bold: format("bold"),
    italic: format("italic"),
    "insert-link": format("insert-link"),
    "heading-1": format("heading-1"),
    "heading-2": format("heading-2"),
    "heading-3": format("heading-3"),
    "bullet-list": format("bullet-list"),
    "numbered-list": format("numbered-list"),
    "insert-date": inNote((editor) => editor.insertToday()),
  };
}

/**
 * La touche est tapée dans un champ de saisie autre que l'éditeur (message à Claude, recherche,
 * nom) : la mise en forme ne doit pas viser la note derrière lui.
 */
function typingElsewhere(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement) || target.closest(".cm-editor") !== null) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

/** Ce que fait chaque commande de la palette. */
export function commandActions(deps: CommandsDeps): Readonly<Record<CommandId, () => void>> {
  const { run, columns, writing } = deps;
  return {
    ...editingActions(columns),
    "quick-open": () => run(quickOpen(deps)),
    "new-note": () => run(deps.workspace.createNote()),
    "new-note-from-template": () => run(deps.templates.newNote()),
    "daily-note": () => run(deps.journal.open()),
    "new-research-notebook": () => run(deps.notebooks.create()),
    "new-mind-map": () => run(deps.notebooks.createMindMap()),
    "new-canvas": () => run(deps.notebooks.createCanvas()),
    "new-crm": () => run(deps.notebooks.createCrm()),
    "new-agenda-12": () => run(deps.notebooks.createAgenda12()),
    "canvas-fit": () => columns.activePane().canvasPane()?.fitAll(),
    "canvas-go-to-group": () =>
      run(columns.activePane().canvasPane()?.goToGroup() ?? Promise.resolve()),
    "canvas-export-image": () =>
      run(columns.activePane().canvasPane()?.exportImage() ?? Promise.resolve()),
    "new-folder": () => deps.folders.startCreation(),
    "search-workspace": () => deps.searchField.focus(),
    "find-in-note": () => columns.activePane().editor.openFind(),
    "find-and-replace": () => columns.activePane().editor.openReplace(),
    "correct-selection": () => deps.assistant.propose("correct"),
    "rephrase-selection": () => deps.assistant.propose("rephrase"),
    "summarize-selection": () => deps.assistant.propose("summarize"),
    "toggle-focus": () => writing.toggleFocus(),
    "toggle-typewriter": () => writing.toggleTypewriter(),
    "toggle-outline": () => writing.toggleOutline(),
    "toggle-related-notes": () => deps.meaning.toggleRelated(),
    "toggle-claude-column": () => deps.claude.toggle(),
    "toggle-full-screen": () => run(deps.window.toggleFullScreen()),
    "toggle-side-panels": () => deps.window.toggleSidePanels(),
    "new-tab": () =>
      run(
        quickOpen(deps, "Nouvel onglet", (path) =>
          columns.update((now) => notePlaced(now, path, "newTab")),
        ),
      ),
    "close-tab": () => run(columns.update(activeTabClosed)),
    "next-tab": () => run(columns.update((now) => tabStepped(now, 1))),
    "previous-tab": () => run(columns.update((now) => tabStepped(now, -1))),
    "split-column": () => run(columns.split()),
    "export-note": () => deps.exporting.exportNote(),
    "print-note": () => deps.exporting.printNote(),
    "copy-note": () => deps.exporting.copyNote(),
    "copy-markdown": () => deps.exporting.copyMarkdown(),
    "note-history": () => deps.history.show(),
    "sort-notes": () => chooseOrder(deps),
    "show-trash": () => run(deps.trash.show()),
    "open-settings": () => deps.settings.open(),
    about: () => openAbout(deps.picker, (address) => run(deps.backend.openWebAddress(address))),
    "switch-workspace": () => run(deps.workspaces.choose()),
    "add-workspace": () => run(deps.workspaces.add()),
    "rename-workspace": () => run(deps.workspaces.rename()),
    "remove-workspace": () => run(deps.workspaces.chooseRemoval()),
    "rebuild-index": () => run(deps.workspace.rebuildIndex()),
  };
}

/** La palette de commandes : une action de l'application, par quelques lettres de son nom. */
function openPalette(deps: CommandsDeps, actions: Readonly<Record<CommandId, () => void>>) {
  if (deps.screen.get().kind !== "workspace") return;
  openPicker(deps.picker, {
    label: "Palette de commandes",
    placeholder: "Nom de la commande",
    empty: "Aucune commande ne correspond",
    entries: matchingCommands,
    describe: (command) => ({ label: command.label, detail: command.shortcut }),
    choose: (command) => actions[command.id](),
  });
}

/** Une fenêtre de l'interface (réglages, fenêtre de choix, confirmation, demande d'un nom) est ouverte : elle garde le clavier et les menus. */
export function dialogOpen(): boolean {
  return document.querySelector("dialog[open]") !== null;
}

/** Lance ce que demande la touche ; faux si elle n'a servi à rien et reste à la fenêtre. */
function runShortcut(
  deps: CommandsDeps,
  actions: Readonly<Record<MenuCommandId, () => void>>,
  shortcut: Shortcut,
): boolean {
  // Échap fait une chose à la fois : quitter le plein écran, sinon retirer le filtre par étiquette.
  if (shortcut === "leave-full-screen") return deps.window.leaveFullScreen() || deps.tags.clear();
  actions[shortcut]();
  return true;
}

/**
 * Branche les raccourcis clavier ; rend ce que fait chaque commande, et la palette.
 * La touche est prise ici, avant la barre des menus : `preventDefault` empêche WebKit de la
 * passer au menu, qui ne la reçoit que si ni l'éditeur ni l'interface ne l'ont prise.
 */
export function connectCommands(deps: CommandsDeps): Readonly<Record<MenuCommandId, () => void>> {
  const actions: Readonly<Record<MenuCommandId, () => void>> = {
    ...commandActions(deps),
    "command-palette": () => openPalette(deps, actions),
  };
  const editing: ReadonlySet<string> = new Set(Object.keys(editingActions(deps.columns)));
  document.addEventListener("keydown", (event) => {
    // Une touche déjà prise par l'éditeur (Échap ferme sa recherche) ne sert pas une seconde fois.
    // Une fenêtre ouverte (réglages, choix) garde le clavier : Échap la ferme, sans quitter le plein écran.
    if (event.defaultPrevented || dialogOpen()) return;
    const shortcut = shortcutFor(event);
    // Prise sans rien faire : passée à la barre des menus, elle mettrait la note en forme.
    if (shortcut && editing.has(shortcut) && typingElsewhere(event.target))
      return event.preventDefault();
    if (shortcut && runShortcut(deps, actions, shortcut)) event.preventDefault();
  });
  return actions;
}
