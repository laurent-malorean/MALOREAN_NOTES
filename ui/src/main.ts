// Assemblage de l'interface : relie l'état de l'écran, l'éditeur et le pont vers Rust.
import * as bridge from "./bridge";
import { createEditor } from "./editor/editor";
import { imageAddress } from "./editor/image-address";
import { folderOf } from "./state/folders";
import { createLayout } from "./screens/layout";
import { startFolderCreation } from "./screens/folders-list";
import { renderScreen, type ScreenActions } from "./screens/screen-view";
import { type Autosave, createAutosave, timerScheduler } from "./state/autosave";
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
  selectedNote,
  welcome,
} from "./state/screen";
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
};

function show(next: Screen) {
  screen = next;
  renderScreen(layout, screen, actions);
}

async function refreshList() {
  show(notesRefreshed(screen, await bridge.listNotes(currentFolder(screen))));
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
layout.newFolderButton.addEventListener("click", () =>
  startFolderCreation(layout.foldersList, currentFolder(screen), actions.create),
);

show(welcome);
bridge
  .reopenLastLibrary()
  .then((library) => (library ? showLibrary(library) : undefined))
  .catch(showError);
