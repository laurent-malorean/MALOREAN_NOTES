// Assemblage de l'interface : relie l'état de l'écran, l'éditeur et le pont vers Rust.
import * as bridge from "./bridge";
import { createEditor } from "./editor/editor";
import { createLayout } from "./screens/layout";
import { renderScreen } from "./screens/screen-view";
import { type Autosave, createAutosave, timerScheduler } from "./state/autosave";
import {
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

const editor = createEditor(layout.editor, (content) => autosave?.edit(content));

function showError(error: unknown) {
  layout.status.textContent = bridge.errorMessage(error);
  layout.status.classList.add("visible");
  setTimeout(() => layout.status.classList.remove("visible"), STATUS_DURATION_MS);
}

function show(next: Screen) {
  screen = next;
  renderScreen(layout, screen, (fileName) => void openNote(fileName).catch(showError));
}

async function refreshList() {
  show(notesRefreshed(screen, await bridge.listNotes()));
}

function editNote(fileName: string): Autosave {
  let current = fileName;
  return createAutosave({
    fileName: current,
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

async function openNote(fileName: string | null) {
  await autosave?.flush();
  autosave = null;
  show(noteSelected(screen, fileName));
  if (fileName === null) return editor.show("");
  const note = await bridge.readNote(fileName);
  autosave = editNote(note.fileName);
  editor.show(note.content);
}

async function showLibrary(library: bridge.LibraryInfo) {
  show(libraryOpened(library, await bridge.listNotes()));
  await openNote(selectedNote(screen));
}

async function chooseLibrary() {
  const library = await bridge.chooseLibrary();
  if (library) await showLibrary(library);
}

async function createNote() {
  const created = await bridge.createNote();
  await refreshList();
  await openNote(created.fileName);
  editor.focus();
}

for (const button of layout.chooseButtons) {
  button.addEventListener("click", () => void chooseLibrary().catch(showError));
}
layout.newNoteButton.addEventListener("click", () => void createNote().catch(showError));

show(welcome);
bridge
  .reopenLastLibrary()
  .then((library) => (library ? showLibrary(library) : undefined))
  .catch(showError);
