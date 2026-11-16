// Assemblage de l'interface : relie l'état de l'écran, l'éditeur et le pont vers Rust.
import * as bridge from "./bridge";
import { createEditor } from "./editor/editor";
import type { FocusUnit } from "./editor/focus/focus-range";
import { imageAddress } from "./editor/image-address";
import { folderOf } from "./state/folders";
import { createLayout } from "./screens/layout";
import { startFolderCreation } from "./screens/folders-list";
import { connectSearchField } from "./screens/search-field";
import { renderScreen, type ScreenActions } from "./screens/screen-view";
import { type Autosave, createAutosave, timerScheduler } from "./state/autosave";
import { createDebouncer, SEARCH_DELAY_MS } from "./state/debounce";
import {
  currentFolder,
  folderMoved,
  folderSelected,
  foldersRefreshed,
  libraryOpened,
  noteRenamed,
  noteSelected,
  notesRefreshed,
  type Screen,
  searchAnswered,
  searchTyped,
  selectedNote,
  welcome,
} from "./state/screen";
import { showFocusUnit, showFullScreen } from "./screens/editor-tools";
import { type Shortcut, shortcutFor } from "./screens/shortcuts";
import { loadFocusUnit, nextFocusUnit, saveFocusUnit } from "./state/focus-preference";
import "./theme.css";
import "./style.css";

const STATUS_DURATION_MS = 4000;

const layout = createLayout(document.querySelector<HTMLElement>("#app") as HTMLElement);
let screen: Screen = welcome;
let autosave: Autosave | null = null;
let libraryPath = "";

const editor = createEditor(
  layout.editor,
  (content) => autosave?.edit(content),
  // Une image relative est cherchée à côté de la note, dans son dossier.
  (src) => {
    const folder = folderOf(selectedNote(screen) ?? "");
    return imageAddress(src, folder ? `${libraryPath}/${folder}` : libraryPath, bridge.fileAddress);
  },
);

function showError(error: unknown) {
  layout.status.textContent = bridge.errorMessage(error);
  layout.status.classList.add("visible");
  setTimeout(() => layout.status.classList.remove("visible"), STATUS_DURATION_MS);
}

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
};

function show(next: Screen) {
  screen = next;
  renderScreen(layout, screen, actions);
}

async function refreshList() {
  show(notesRefreshed(screen, await bridge.listNotes(currentFolder(screen))));
  if (screen.kind === "library" && screen.search) await search(screen.search.query);
}

const searchLater = createDebouncer(timerScheduler(SEARCH_DELAY_MS));

async function search(query: string) {
  show(searchAnswered(screen, query, await bridge.searchNotes(query)));
}

/** Chaque frappe montre la recherche ; elle part vers Rust après une courte pause. */
function typeSearch(query: string) {
  show(searchTyped(screen, query));
  if (query.trim() === "") return searchLater.cancel();
  searchLater(() => run(search(query)));
}

async function selectFolder(folder: string) {
  if (folder === currentFolder(screen)) return;
  await autosave?.flush();
  show(folderSelected(screen, folder, await bridge.listNotes(folder)));
  await openNote(selectedNote(screen));
}

async function createFolder(parent: string, name: string) {
  const created = await bridge.createFolder(parent, name);
  show(foldersRefreshed(screen, await bridge.listFolders()));
  await selectFolder(created);
}

/** Renomme ou déplace un dossier : ce qui est enregistré d'abord, puis tout suit le nouveau chemin. */
async function changeFolder(path: string, change: Promise<string>) {
  await autosave?.flush();
  const to = await change;
  show(folderMoved(screen, path, to));
  show(foldersRefreshed(screen, await bridge.listFolders()));
  const selected = selectedNote(screen);
  await refreshList();
  await openNote(selected);
}

/**
 * Déplace une note dans un autre dossier ; la liste reste sur le dossier affiché.
 * La note ouverte le reste, sous son nouveau chemin, une fois ce qui est tapé enregistré.
 */
async function moveNote(path: string, into: string) {
  const wasOpen = selectedNote(screen) === path;
  await autosave?.flush();
  // L'enregistrement a pu renommer la note ouverte (titre changé).
  const source = wasOpen ? (selectedNote(screen) ?? path) : path;
  const moved = await bridge.moveNote(source, into);
  await refreshList();
  if (wasOpen) await openNote(moved.path);
}

/**
 * Épingle ou désépingle une note. Ce qui est tapé est enregistré d'abord ; si c'est la note
 * ouverte, l'éditeur montre son nouvel en-tête.
 */
async function changePin(path: string, change: (path: string) => Promise<bridge.NoteContent>) {
  const wasOpen = selectedNote(screen) === path;
  await autosave?.flush();
  // L'enregistrement a pu renommer la note ouverte (titre changé).
  const note = await change(wasOpen ? (selectedNote(screen) ?? path) : path);
  if (wasOpen) editor.show(note.content);
  await refreshList();
}

function editNote(path: string): Autosave {
  let current = path;
  return createAutosave({
    path: current,
    scheduler: timerScheduler(),
    save: bridge.saveNote,
    onSaved: (saved) => {
      show(noteRenamed(screen, current, saved));
      current = saved;
      void refreshList().catch(showError);
    },
    onError: showError,
  });
}

async function openNote(path: string | null) {
  await autosave?.flush();
  autosave = null;
  show(noteSelected(screen, path));
  if (path === null) return editor.show("");
  const note = await bridge.readNote(path);
  autosave = editNote(note.path);
  editor.show(note.content);
}

async function showLibrary(library: bridge.LibraryInfo) {
  libraryPath = library.path;
  show(libraryOpened(library, await bridge.listFolders(), await bridge.listNotes("")));
  await openNote(selectedNote(screen));
}

async function chooseLibrary() {
  const library = await bridge.chooseLibrary();
  if (library) await showLibrary(library);
}

async function createNote() {
  const created = await bridge.createNote(currentFolder(screen));
  await refreshList();
  await openNote(created.path);
  editor.focus();
}

for (const button of layout.chooseButtons) {
  button.addEventListener("click", () => void chooseLibrary().catch(showError));
}
layout.newNoteButton.addEventListener("click", () => void createNote().catch(showError));
connectSearchField(layout.searchField, typeSearch);
layout.newFolderButton.addEventListener("click", () =>
  startFolderCreation(layout.foldersList, currentFolder(screen), actions.create),
);

let focusUnit = loadFocusUnit(localStorage);
function applyFocusUnit(unit: FocusUnit | null) {
  focusUnit = unit;
  editor.setFocusMode(unit);
  showFocusUnit(layout.focusButton, unit);
  saveFocusUnit(localStorage, unit);
}
const toggleFocus = () => applyFocusUnit(nextFocusUnit(focusUnit));
layout.focusButton.addEventListener("click", toggleFocus);
applyFocusUnit(focusUnit);

let fullScreen = false;
function showWindowState(on: boolean) {
  fullScreen = on;
  showFullScreen(layout.workspace, layout.fullScreenButton, on);
}
async function setFullScreen(on: boolean) {
  await bridge.setFullScreen(on);
  showWindowState(on);
}
layout.fullScreenButton.addEventListener(
  "click",
  () => void setFullScreen(!fullScreen).catch(showError),
);
// Le plein écran peut aussi venir du bouton vert ou du menu du Mac : la fenêtre fait foi.
void bridge
  .onWindowResized(() => void bridge.isFullScreen().then(showWindowState).catch(showError))
  .catch(showError);

const SHORTCUT_ACTIONS: Readonly<Record<Shortcut, () => boolean>> = {
  "toggle-focus": () => (toggleFocus(), true),
  "toggle-full-screen": () => (void setFullScreen(!fullScreen).catch(showError), true),
  "leave-full-screen": () => fullScreen && (void setFullScreen(false).catch(showError), true),
};
document.addEventListener("keydown", (event) => {
  const shortcut = shortcutFor(event);
  if (shortcut && SHORTCUT_ACTIONS[shortcut]()) event.preventDefault();
});

show(welcome);
bridge
  .reopenLastLibrary()
  .then((library) => (library ? showLibrary(library) : undefined))
  .catch(showError);
