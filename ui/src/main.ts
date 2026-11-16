// Assemblage de l'interface : relie les écrans, l'éditeur et le pont vers Rust.
import * as bridge from "./bridge";
import { createEditor } from "./editor/editor";
import { createLayout } from "./screens/layout";
import { renderNotesList } from "./screens/notes-list";
import { type Autosave, createAutosave, timerScheduler } from "./state/autosave";
import { followRename, initialSelection } from "./state/selection";
import "./style.css";

const STATUS_DURATION_MS = 4000;

const layout = createLayout(document.querySelector<HTMLElement>("#app") as HTMLElement);
let notes: bridge.NoteListItem[] = [];
let selected: string | null = null;
let autosave: Autosave | null = null;

const editor = createEditor(layout.editor, (content) => autosave?.edit(content));

function showError(error: unknown) {
  layout.status.textContent = bridge.errorMessage(error);
  layout.status.classList.add("visible");
  setTimeout(() => layout.status.classList.remove("visible"), STATUS_DURATION_MS);
}

function renderList() {
  renderNotesList(layout.notesList, notes, selected, (fileName) => void openNote(fileName));
}

async function refreshList() {
  notes = await bridge.listNotes();
  renderList();
}

function onSaved(previous: string, saved: string) {
  selected = followRename(selected, previous, saved);
  void refreshList().catch(showError);
}

async function openNote(fileName: string | null) {
  await autosave?.flush();
  autosave = null;
  selected = fileName;
  renderList();
  if (fileName === null) return editor.show("");
  const note = await bridge.readNote(fileName);
  let current = note.fileName;
  autosave = createAutosave({
    fileName: current,
    scheduler: timerScheduler(),
    save: bridge.saveNote,
    onSaved: (saved) => {
      onSaved(current, saved);
      current = saved;
    },
    onError: showError,
  });
  editor.show(note.content);
}

async function showLibrary(library: bridge.LibraryInfo) {
  layout.welcome.hidden = true;
  layout.workspace.hidden = false;
  layout.libraryName.textContent = library.name;
  await refreshList();
  await openNote(initialSelection(notes));
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

bridge
  .reopenLastLibrary()
  .then((library) => (library ? showLibrary(library) : undefined))
  .catch(showError);
