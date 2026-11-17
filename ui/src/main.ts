// Assemblage de l'interface : relie l'état de l'écran, l'éditeur et le pont vers Rust.
import * as bridge from "./bridge";
import type { Editor } from "./editor/editor";
import type { FocusUnit } from "./editor/focus/focus-range";
import { imageAddress } from "./editor/image-address";
import { folderOf, movedPath, nameOf } from "./state/folders";
import { createLayout } from "./screens/layout";
import { startFolderCreation } from "./screens/folders-list";
import { connectSearchField } from "./screens/search-field";
import { renderScreen, type ScreenActions } from "./screens/screen-view";
import { timerScheduler } from "./state/autosave";
import { createDebouncer, SEARCH_DELAY_MS } from "./state/debounce";
import { touchesNote } from "./state/external-change";
import {
  currentFolder,
  folderMoved,
  folderSelected,
  foldersRefreshed,
  libraryOpened,
  noteSelected,
  notesRefreshed,
  type Screen,
  searchable,
  searchAnswered,
  searchTyped,
  selectedNote,
  trashShown,
  welcome,
} from "./state/screen";
import { initialSelection, nextSelection } from "./state/selection";
import {
  type OutlineDisplay,
  showFocusUnit,
  showOutline,
  showTypewriter,
} from "./screens/editor-tools";
import { connectWindowDisplay } from "./screens/window-display";
import { type Shortcut, shortcutFor } from "./screens/shortcuts";
import { loadFocusUnit, nextFocusUnit, saveFocusUnit } from "./state/focus-preference";
import { loadTypewriter, nextTypewriter, saveTypewriter } from "./state/typewriter-preference";
import type { Typewriter } from "./editor/writing/typewriter";
import { loadSettings, saveSettings, type Settings } from "./state/settings";
import { openSettings } from "./screens/settings-view";
import { showDisplay } from "./screens/display";
import { openPicker } from "./screens/picker";
import { askTrash } from "./screens/confirmation";
import { matchingNotes } from "./state/quick-open";
import { type CommandId, matchingCommands } from "./state/commands";
import {
  activeNote,
  activeTabClosed,
  columnActivated,
  type Columns,
  columnSplit,
  columnsResized,
  columnsStarted,
  noteClosed,
  noteOpened,
  notePlaced,
  noteShown,
  notesMoved,
  notesRemoved,
  noteTitled,
  shownNote,
  tabActivated,
  tabClosed,
  tabDropped,
  tabPlaced,
  tabStepped,
} from "./state/columns";
import { type ColumnParts, createColumnsView } from "./screens/columns-view";
import { createPane, type Pane } from "./screens/note-pane";
import { createSharedNotes } from "./screens/shared-notes";
import "./theme.css";
import "./style.css";

const STATUS_DURATION_MS = 4000;

const layout = createLayout(document.querySelector<HTMLElement>("#app") as HTMLElement);
let screen: Screen = welcome;
let libraryPath = "";

const panes = new Map<number, Pane>();
let columns: Columns = columnsStarted;
const activePane = () => panes.get(columns.active) as Pane;
const eachEditor = (act: (editor: Editor) => void) => panes.forEach((pane) => act(pane.editor));

/** Enregistre tout de suite ce qui est tapé, dans toutes les colonnes. */
async function flushAll() {
  await Promise.all([...panes.values()].map((pane) => pane.flush()));
}

/** Enregistre ce qui est tapé ; rend le chemin de la note, que l'enregistrement a pu renommer. */
async function flushedPath(path: string): Promise<string> {
  const showing = [...panes.values()].find((pane) => pane.note() === path);
  await flushAll();
  return showing?.note() ?? path;
}

/** Ce qui est tapé dans une colonne est enregistré : la note a peut-être changé de nom. */
function noteSaved(from: string, saved: bridge.SaveResult) {
  const moved = notesMoved(columns, (path) => (path === from ? saved.path : path));
  run(changeColumns(noteTitled(moved, saved.path, saved.title)));
  if (saved.conflictCopy !== null) {
    showMessage(
      `Cette note a aussi changé hors de l'application : l'autre version est gardée dans « ${saved.conflictCopy} ».`,
    );
    run(refreshFolders());
  }
  run(refreshList());
}

/** Les notes montrées par les colonnes : une note ouverte deux fois n'a qu'un texte et un enregistrement. */
const shared = createSharedNotes({
  backend: bridge,
  events: {
    saved: noteSaved,
    titled: (path, title) => run(changeColumns(noteTitled(columns, path, title))),
    deleted: () =>
      showMessage(
        "Cette note a été supprimée hors de l'application : son texte reste ici, et elle sera recréée à la prochaine modification.",
      ),
    error: (error) => showError(error),
  },
});

/** L'éditeur d'une colonne qui vient d'apparaître, aux réglages en cours. */
function paneIn(parts: ColumnParts): Pane {
  const pane = createPane(parts, {
    backend: bridge,
    shared,
    events: {
      openNote: (path) => actions.open(path),
      openLink: (title) => run(followLink(title)),
      error: showError,
    },
    // Une image relative est cherchée à côté de la note, dans son dossier.
    resolveImage: (src, note) => {
      const folder = folderOf(note ?? "");
      return imageAddress(
        src,
        folder ? `${libraryPath}/${folder}` : libraryPath,
        bridge.fileAddress,
      );
    },
  });
  pane.editor.setFocusMode(focusUnit);
  pane.editor.setCharactersPerPage(settings.charactersPerPage);
  return pane;
}

function showMessage(message: string) {
  layout.status.textContent = message;
  layout.status.classList.add("visible");
  setTimeout(() => layout.status.classList.remove("visible"), STATUS_DURATION_MS);
}

const showError = (error: unknown) => showMessage(bridge.errorMessage(error));

const run = (action: Promise<unknown>) => void action.catch(showError);

const actions: ScreenActions = {
  open: (path) => run(openNote(path)),
  select: (folder) => run(selectFolder(folder)),
  create: (parent, name) => run(createFolder(parent, name)),
  rename: (path, name) => run(changeFolder(path, bridge.renameFolder(path, name))),
  move: (path, into) => run(changeFolder(path, bridge.moveFolder(path, into))),
  moveNote: (path, into) => run(moveNote(path, into)),
  pin: (path) => run(changePin(path, bridge.pinNote)),
  unpin: (path) => run(changePin(path, bridge.unpinNote)),
  trash: (path) => run(confirmTrash(noteTitle(path), () => trashNote(path))),
  place: (path, placement) => run(changeColumns(notePlaced(columns, path, placement))),
  closeNote: (path) => run(changeColumns(noteClosed(columns, path))),
  trashFolder: (path) => run(confirmTrash(nameOf(path), () => trashFolder(path))),
  restoreNote: (path) => run(changeTrash(bridge.restoreNote(path))),
  restoreFolder: (path) => run(changeTrash(bridge.restoreFolder(path))),
  empty: () => run(changeTrash(bridge.emptyTrash())),
};

function show(next: Screen) {
  screen = next;
  renderScreen(layout, screen, actions);
}

/** Applique une réponse de Rust à l'écran tel qu'il est à son arrivée, pas tel qu'il était à la demande. */
async function showAnswer<T>(answer: Promise<T>, next: (now: Screen, answer: T) => Screen) {
  const value = await answer;
  show(next(screen, value));
}

async function refreshList() {
  await showAnswer(bridge.listNotes(currentFolder(screen)), notesRefreshed);
  if (screen.kind === "library" && screen.search) await search(screen.search.query);
}

const searchLater = createDebouncer(timerScheduler(SEARCH_DELAY_MS));

async function search(query: string) {
  await showAnswer(bridge.searchNotes(query), (now, answer) => searchAnswered(now, query, answer));
}

/** Chaque frappe montre la recherche ; elle part vers Rust après une courte pause, dès le seuil atteint. */
function typeSearch(query: string) {
  show(searchTyped(screen, query));
  if (!searchable(query)) return searchLater.cancel();
  searchLater(() => run(search(query)));
}

async function selectFolder(folder: string) {
  // Rechoisir le dossier affiché ne le recharge pas, sauf pour quitter la corbeille.
  const trashOpen = screen.kind === "library" && screen.trash !== null;
  if (folder === currentFolder(screen) && !trashOpen) return;
  await activePane().flush();
  await showAnswer(bridge.listNotes(folder), (now, answer) => folderSelected(now, folder, answer));
  await showNote(selectedNote(screen));
}

async function createFolder(parent: string, name: string) {
  const created = await bridge.createFolder(parent, name);
  await showAnswer(bridge.listFolders(), foldersRefreshed);
  await selectFolder(created);
}

/** Renomme ou déplace un dossier : ce qui est enregistré d'abord, puis tout suit le nouveau chemin. */
async function changeFolder(path: string, change: Promise<string>) {
  await flushAll();
  const to = await change;
  show(folderMoved(screen, path, to));
  await showAnswer(bridge.listFolders(), foldersRefreshed);
  await refreshList();
  await changeColumns(notesMoved(columns, (note) => movedPath(note, path, to)));
}

/**
 * Déplace une note dans un autre dossier ; la liste reste sur le dossier affiché.
 * Les colonnes qui la montrent la gardent, sous son nouveau chemin, une fois ce qui est tapé enregistré.
 */
async function moveNote(path: string, into: string) {
  const source = await flushedPath(path);
  const moved = await bridge.moveNote(source, into);
  await refreshList();
  await changeColumns(notesMoved(columns, (note) => (note === source ? moved.path : note)));
}

/**
 * Épingle ou désépingle une note. Ce qui est tapé est enregistré d'abord ; les colonnes qui la
 * montrent affichent son nouvel en-tête.
 */
async function changePin(path: string, change: (path: string) => Promise<bridge.NoteContent>) {
  const source = await flushedPath(path);
  const note = await change(source);
  panes.forEach((pane) => pane.note() === source && pane.editor.show(note.content));
  await refreshList();
}

/** Les colonnes qui montraient des notes parties à la corbeille n'enregistrent plus rien. */
function forgetNotes(gone: (path: string) => boolean) {
  panes.forEach((pane) => {
    const note = pane.note();
    if (note !== null && gone(note)) pane.forget();
  });
}

const noteTitle = (path: string) =>
  (screen.kind === "library" && screen.notes.find((note) => note.path === path)?.title) || path;

/** Placer une note ou un dossier dans la corbeille attend d'abord sa confirmation. */
async function confirmTrash(name: string, trash: () => Promise<void>) {
  if (await askTrash(layout.confirmation, name)) await trash();
}

/**
 * Place une note dans la corbeille, une fois ce qui est tapé enregistré ; si la colonne active la
 * montrait, la suivante de la liste s'y ouvre (ou aucune).
 */
async function trashNote(path: string) {
  const source = await flushedPath(path);
  const gone = (note: string) => note === source;
  const next = screen.kind === "library" ? nextSelection(screen.notes, source) : null;
  await bridge.trashNote(source);
  forgetNotes(gone);
  await refreshList();
  const replaced = activeNote(columns) === source ? noteShown(columns, next) : columns;
  await changeColumns(notesRemoved(replaced, gone));
}

/**
 * Place un dossier dans la corbeille, avec tout ce qu'il contient. Si l'on y était, la liste
 * revient à la bibliothèque ; si la note de la colonne active y était, une autre s'y ouvre.
 */
async function trashFolder(path: string) {
  await flushAll();
  const inside = (p: string) => p === path || p.startsWith(`${path}/`);
  const gone = (note: string) => inside(folderOf(note));
  const listInside = inside(currentFolder(screen));
  const activeGone = gone(activeNote(columns) ?? "");
  await bridge.trashFolder(path);
  forgetNotes(gone);
  await showAnswer(bridge.listFolders(), foldersRefreshed);
  let next = columns;
  if (listInside) {
    await showAnswer(bridge.listNotes(""), (now, answer) => folderSelected(now, "", answer));
    next = noteShown(next, selectedNote(screen));
  } else {
    await refreshList();
    if (activeGone)
      next = noteShown(next, screen.kind === "library" ? initialSelection(screen.notes) : null);
  }
  await changeColumns(notesRemoved(next, gone));
}

async function showTrash() {
  await showAnswer(bridge.listTrash(), trashShown);
}

/** Restaure ou vide : la corbeille, les dossiers et les notes affichées sont relus. */
async function changeTrash(change: Promise<unknown>) {
  await change;
  await showAnswer(bridge.listFolders(), foldersRefreshed);
  await showAnswer(bridge.listNotes(currentFolder(screen)), notesRefreshed);
  await showTrash();
}

/** Seul l'éditeur de la colonne active dessine le plan. */
let outlineOwner: Pane | null = null;

/** Les colonnes passent à leur état suivant : l'écran suit, et chaque colonne montre sa note. */
async function changeColumns(next: Columns) {
  columns = next;
  columnsView.render(columns);
  showTypewriterIn(columns.active);
  const active = activePane();
  if (outlineOwner !== active) {
    outlineOwner?.editor.setOutline(null);
    active.editor.setOutline(layout.outline);
    outlineOwner = active;
  }
  if (selectedNote(screen) !== activeNote(columns)) show(noteSelected(screen, activeNote(columns)));
  await Promise.all(columns.list.map((column) => panes.get(column.id)?.load(shownNote(column))));
}

const columnsView = createColumnsView(layout.columns, {
  created: (id, parts) => panes.set(id, paneIn(parts)),
  removed: (id) => {
    const pane = panes.get(id);
    if (outlineOwner === pane) outlineOwner = null;
    pane?.destroy();
    panes.delete(id);
  },
  activate: (id) => {
    if (id !== columns.active) run(changeColumns(columnActivated(columns, id)));
  },
  activateTab: (tabId) => run(changeColumns(tabActivated(columns, tabId))),
  closeTab: (tabId) => run(changeColumns(tabClosed(columns, tabId))),
  placeTab: (tabId, placement) => run(changeColumns(tabPlaced(columns, tabId, placement))),
  dropTab: (tabId, drop) => run(changeColumnsFlushed(() => tabDropped(columns, tabId, drop))),
  split: () => COMMAND_ACTIONS["split-column"](),
  resize: (divider, delta) => run(changeColumns(columnsResized(columns, divider, delta))),
});

/** Les colonnes changent une fois ce qui est tapé enregistré : une note qui change de colonne s'y lit à jour. */
async function changeColumnsFlushed(next: () => Columns) {
  await flushAll();
  await changeColumns(next());
}

/** L'onglet actif de la colonne active montre cette note à la place de la sienne. */
const showNote = (path: string | null) => changeColumns(noteShown(columns, path));

/** Ouvre une note dans un nouvel onglet de la colonne active, ou retrouve le sien. */
const openNote = (path: string) => changeColumns(noteOpened(columns, path));

/** Ouvre la note qu'un lien `[[titre]]` désigne, ce qui est tapé étant enregistré d'abord. */
async function followLink(title: string) {
  await activePane().flush();
  const path = await bridge.resolveLink(title);
  if (path === null) return showMessage(`Aucune note ne porte le titre « ${title} ».`);
  await openNote(path);
}

async function refreshFolders() {
  await showAnswer(bridge.listFolders(), foldersRefreshed);
}

/** La bibliothèque a changé hors de l'application : dossiers, liste et notes des colonnes suivent. */
async function followLibraryChange(change: bridge.LibraryChanged) {
  if (screen.kind !== "library") return;
  await refreshFolders();
  await refreshList();
  for (const pane of panes.values()) {
    await pane.showBacklinks();
    if (touchesNote(change.notes, pane.note())) await pane.followDisk();
  }
}

async function showLibrary(library: bridge.LibraryInfo) {
  libraryPath = library.path;
  show(libraryOpened(library, await bridge.listFolders(), await bridge.listNotes("")));
  // Les colonnes montraient peut-être des notes d'une autre bibliothèque.
  await changeColumns(
    noteShown(
      notesRemoved(columns, () => true),
      selectedNote(screen),
    ),
  );
}

async function chooseLibrary() {
  // Ce qui est tapé va dans la bibliothèque d'où on vient.
  await flushAll();
  const library = await bridge.chooseLibrary();
  if (library) await showLibrary(library);
}

async function createNote() {
  const created = await bridge.createNote(currentFolder(screen));
  await refreshList();
  await openNote(created.path);
  activePane().editor.focus();
}

for (const button of layout.chooseButtons) {
  button.addEventListener("click", () => void chooseLibrary().catch(showError));
}
layout.newNoteButton.addEventListener("click", () => void createNote().catch(showError));
connectSearchField(layout.searchField, typeSearch);
layout.trashButton.addEventListener("click", () => run(showTrash()));
layout.newFolderButton.addEventListener("click", () =>
  startFolderCreation(layout.foldersList, currentFolder(screen), actions.create),
);

let focusUnit = loadFocusUnit(localStorage);
function applyFocusUnit(unit: FocusUnit | null) {
  focusUnit = unit;
  eachEditor((editor) => editor.setFocusMode(unit));
  showFocusUnit(layout.focusButton, unit);
  saveFocusUnit(localStorage, unit);
}
const toggleFocus = () => applyFocusUnit(nextFocusUnit(focusUnit));
layout.focusButton.addEventListener("click", toggleFocus);
applyFocusUnit(focusUnit);

let typewriter = loadTypewriter(localStorage);
/** Le mode machine à écrire ne vaut que pour la colonne active : les autres gardent leur texte en place. */
function showTypewriterIn(active: number) {
  panes.forEach((pane, id) => pane.editor.setTypewriter(id === active ? typewriter : "off"));
}
function applyTypewriter(mode: Typewriter) {
  typewriter = mode;
  showTypewriterIn(columns.active);
  showTypewriter(layout.typewriterButton, mode);
  saveTypewriter(localStorage, mode);
}
const toggleTypewriter = () => applyTypewriter(nextTypewriter(typewriter));
layout.typewriterButton.addEventListener("click", toggleTypewriter);
applyTypewriter(typewriter);

let settings = loadSettings(localStorage);
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const showSettingsDisplay = () =>
  showDisplay(document.documentElement, settings, systemDark.matches);
function applySettings(next: Settings) {
  settings = next;
  eachEditor((editor) => editor.setCharactersPerPage(next.charactersPerPage));
  showSettingsDisplay();
  saveSettings(localStorage, next);
}
// En apparence automatique, l'application suit le Mac quand il passe de clair à sombre.
systemDark.addEventListener("change", showSettingsDisplay);
const showSettings = () => openSettings(layout.settings, settings, applySettings);
layout.settingsButton.addEventListener("click", showSettings);
applySettings(settings);

/**
 * Ouverture rapide : une note de n'importe quel dossier, par quelques lettres de son titre ; dans
 * un nouvel onglet pour Cmd+T.
 */
async function quickOpen(label = "Ouvrir une note", open = openNote) {
  if (screen.kind !== "library") return;
  const notes = await bridge.listAllNotes();
  openPicker(layout.picker, {
    label,
    placeholder: "Titre de la note",
    empty: "Aucune note ne correspond",
    entries: (query) => matchingNotes(notes, query),
    describe: (note) => ({ label: note.title, detail: note.folder }),
    choose: (note) => run(open(note.path)),
  });
}

let outlineDisplay: OutlineDisplay = "hidden";
function toggleOutline() {
  outlineDisplay = outlineDisplay === "shown" ? "hidden" : "shown";
  showOutline(layout.editor, layout.outline, layout.outlineButton, outlineDisplay);
}
layout.outlineButton.addEventListener("click", toggleOutline);

const windowDisplay = connectWindowDisplay(layout, {
  window: bridge,
  storage: localStorage,
  error: showError,
});

/** Ce que fait chaque commande de la palette. */
const COMMAND_ACTIONS: Readonly<Record<CommandId, () => void>> = {
  "quick-open": () => run(quickOpen()),
  "new-note": () => run(createNote()),
  "new-folder": () =>
    startFolderCreation(layout.foldersList, currentFolder(screen), actions.create),
  "search-library": () => layout.searchField.focus(),
  "find-in-note": () => activePane().editor.openFind(),
  "toggle-focus": toggleFocus,
  "toggle-typewriter": toggleTypewriter,
  "toggle-outline": toggleOutline,
  "toggle-full-screen": () => run(windowDisplay.toggleFullScreen()),
  "toggle-side-panels": windowDisplay.toggleSidePanels,
  "new-tab": () =>
    run(quickOpen("Nouvel onglet", (path) => changeColumns(notePlaced(columns, path, "newTab")))),
  "close-tab": () => run(changeColumns(activeTabClosed(columns))),
  "next-tab": () => run(changeColumns(tabStepped(columns, 1))),
  "previous-tab": () => run(changeColumns(tabStepped(columns, -1))),
  "split-column": () => run(changeColumnsFlushed(() => columnSplit(columns))),
  "show-trash": () => run(showTrash()),
  "open-settings": () => showSettings(),
  "choose-library": () => run(chooseLibrary()),
};

/** La palette de commandes : une action de l'application, par quelques lettres de son nom. */
function openPalette() {
  if (screen.kind !== "library") return;
  openPicker(layout.picker, {
    label: "Palette de commandes",
    placeholder: "Nom de la commande",
    empty: "Aucune commande ne correspond",
    entries: matchingCommands,
    describe: (command) => ({ label: command.label, detail: command.shortcut }),
    choose: (command) => COMMAND_ACTIONS[command.id](),
  });
}

const SHORTCUT_ACTIONS: Readonly<Record<Shortcut, () => boolean>> = {
  "toggle-focus": () => (toggleFocus(), true),
  "toggle-typewriter": () => (toggleTypewriter(), true),
  "toggle-outline": () => (toggleOutline(), true),
  "toggle-full-screen": () => (COMMAND_ACTIONS["toggle-full-screen"](), true),
  "leave-full-screen": windowDisplay.leaveFullScreen,
  "toggle-side-panels": () => (windowDisplay.toggleSidePanels(), true),
  "open-settings": () => (showSettings(), true),
  "quick-open": () => (run(quickOpen()), true),
  "command-palette": () => (openPalette(), true),
  "new-tab": () => (COMMAND_ACTIONS["new-tab"](), true),
  "close-tab": () => (COMMAND_ACTIONS["close-tab"](), true),
  "next-tab": () => (COMMAND_ACTIONS["next-tab"](), true),
  "previous-tab": () => (COMMAND_ACTIONS["previous-tab"](), true),
  "split-column": () => (COMMAND_ACTIONS["split-column"](), true),
};
document.addEventListener("keydown", (event) => {
  // Une touche déjà prise par l'éditeur (Échap ferme sa recherche) ne sert pas une seconde fois.
  // Une fenêtre ouverte (réglages, choix) garde le clavier : Échap la ferme, sans quitter le plein écran.
  if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
  const shortcut = shortcutFor(event);
  if (shortcut && SHORTCUT_ACTIONS[shortcut]()) event.preventDefault();
});

void bridge.onLibraryChanged((change) => run(followLibraryChange(change))).catch(showError);

show(welcome);
void changeColumns(columns);
bridge
  .reopenLastLibrary()
  .then((library) => (library ? showLibrary(library) : undefined))
  .catch(showError);
