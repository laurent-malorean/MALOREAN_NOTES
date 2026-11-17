// Assemblage de l'interface : relie l'état de l'écran, l'éditeur et le pont vers Rust.
import * as bridge from "./bridge";
import type { AttachmentActions } from "./editor/attachments";
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
import { reactionToChange, touchesNote } from "./state/external-change";
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
  trashShown,
  welcome,
} from "./state/screen";
import { initialSelection, nextSelection } from "./state/selection";
import {
  type OutlineDisplay,
  showFocusUnit,
  showFullScreen,
  showOutline,
  showTypewriter,
} from "./screens/editor-tools";
import { type Shortcut, shortcutFor } from "./screens/shortcuts";
import { loadFocusUnit, nextFocusUnit, saveFocusUnit } from "./state/focus-preference";
import { loadTypewriter, nextTypewriter, saveTypewriter } from "./state/typewriter-preference";
import type { Typewriter } from "./editor/writing/typewriter";
import { loadSettings, saveSettings, type Settings } from "./state/settings";
import { openSettings } from "./screens/settings-view";
import { showDisplay } from "./screens/display";
import { renderBacklinks } from "./screens/backlinks-view";
import { openPicker } from "./screens/picker";
import { matchingNotes } from "./state/quick-open";
import "./theme.css";
import "./style.css";

const STATUS_DURATION_MS = 4000;

const layout = createLayout(document.querySelector<HTMLElement>("#app") as HTMLElement);
let screen: Screen = welcome;
let autosave: Autosave | null = null;
let libraryPath = "";

/** Joindre à la note ouverte : ce qui est tapé est enregistré d'abord, pour viser son vrai nom. */
const attachmentActions: AttachmentActions = {
  attach: async (file, origin) => {
    try {
      await autosave?.flush();
      const path = selectedNote(screen);
      return path === null ? null : (await bridge.attachFile(path, file, origin)).markdown;
    } catch (error) {
      showError(error);
      return null;
    }
  },
  open: (target) => {
    const path = selectedNote(screen);
    if (path !== null) run(bridge.openAttachment(path, target));
  },
};

const editor = createEditor(layout.editor, (content) => autosave?.edit(content), {
  // Une image relative est cherchée à côté de la note, dans son dossier.
  resolveImage: (src) => {
    const folder = folderOf(selectedNote(screen) ?? "");
    return imageAddress(src, folder ? `${libraryPath}/${folder}` : libraryPath, bridge.fileAddress);
  },
  attachmentActions,
  outline: layout.outline,
  openLink: (title) => run(followLink(title)),
});

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
  trash: (path) => run(trashNote(path)),
  trashFolder: (path) => run(trashFolder(path)),
  restoreNote: (path) => run(changeTrash(bridge.restoreNote(path))),
  restoreFolder: (path) => run(changeTrash(bridge.restoreFolder(path))),
  empty: () => run(changeTrash(bridge.emptyTrash())),
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
  // Rechoisir le dossier affiché ne le recharge pas, sauf pour quitter la corbeille.
  const trashOpen = screen.kind === "library" && screen.trash !== null;
  if (folder === currentFolder(screen) && !trashOpen) return;
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

/**
 * Place une note dans la corbeille, une fois ce qui est tapé enregistré ; si c'était la note
 * ouverte, la suivante de la liste s'ouvre (ou aucune).
 */
async function trashNote(path: string) {
  const wasOpen = selectedNote(screen) === path;
  await autosave?.flush();
  // L'enregistrement a pu renommer la note ouverte (titre changé).
  const source = wasOpen ? (selectedNote(screen) ?? path) : path;
  const next = screen.kind === "library" ? nextSelection(screen.notes, source) : null;
  await bridge.trashNote(source);
  if (wasOpen) autosave = null;
  await refreshList();
  if (wasOpen) await openNote(next);
}

/**
 * Place un dossier dans la corbeille, avec tout ce qu'il contient. Si l'on y était, la liste
 * revient à la bibliothèque ; si la note ouverte y était, une autre s'ouvre.
 */
async function trashFolder(path: string) {
  await autosave?.flush();
  const inside = (p: string) => p === path || p.startsWith(`${path}/`);
  const noteGone = inside(folderOf(selectedNote(screen) ?? ""));
  await bridge.trashFolder(path);
  if (noteGone) autosave = null;
  show(foldersRefreshed(screen, await bridge.listFolders()));
  if (inside(currentFolder(screen))) {
    show(folderSelected(screen, "", await bridge.listNotes("")));
    return openNote(selectedNote(screen));
  }
  await refreshList();
  if (noteGone) await openNote(screen.kind === "library" ? initialSelection(screen.notes) : null);
}

async function showTrash() {
  show(trashShown(screen, await bridge.listTrash()));
}

/** Restaure ou vide : la corbeille, les dossiers et les notes affichées sont relus. */
async function changeTrash(change: Promise<unknown>) {
  await change;
  show(foldersRefreshed(screen, await bridge.listFolders()));
  show(notesRefreshed(screen, await bridge.listNotes(currentFolder(screen))));
  await showTrash();
}

function editNote(note: bridge.NoteContent): Autosave {
  let current = note.path;
  return createAutosave({
    path: current,
    fingerprint: note.fingerprint,
    scheduler: timerScheduler(),
    save: bridge.saveNote,
    onSaved: (saved) => {
      show(noteRenamed(screen, current, saved.path));
      current = saved.path;
      if (saved.conflictCopy !== null) {
        showMessage(
          `Cette note a aussi changé hors de l'application : l'autre version est gardée dans « ${saved.conflictCopy} ».`,
        );
        void refreshFolders().catch(showError);
      }
      void refreshList().catch(showError);
      // Le titre a pu changer : les liens entrants aussi.
      void showBacklinks().catch(showError);
    },
    onError: showError,
  });
}

async function openNote(path: string | null) {
  await autosave?.flush();
  autosave = null;
  show(noteSelected(screen, path));
  void showBacklinks().catch(showError);
  if (path === null) return editor.show("");
  const note = await bridge.readNote(path);
  autosave = editNote(note);
  editor.show(note.content);
}

/** Les liens entrants de la note ouverte ; une réponse arrivée pour une autre note est ignorée. */
async function showBacklinks() {
  const path = selectedNote(screen);
  const notes = path === null ? [] : await bridge.listBacklinks(path);
  if (selectedNote(screen) === path) renderBacklinks(layout.backlinks, notes, actions.open);
}

/** Ouvre la note qu'un lien `[[titre]]` désigne, ce qui est tapé étant enregistré d'abord. */
async function followLink(title: string) {
  await autosave?.flush();
  const path = await bridge.resolveLink(title);
  if (path === null) return showMessage(`Aucune note ne porte le titre « ${title} ».`);
  await openNote(path);
}

async function refreshFolders() {
  show(foldersRefreshed(screen, await bridge.listFolders()));
}

/** La bibliothèque a changé hors de l'application : dossiers, liste et note ouverte suivent. */
async function followLibraryChange(change: bridge.LibraryChanged) {
  if (screen.kind !== "library") return;
  await refreshFolders();
  await refreshList();
  await showBacklinks();
  const open = selectedNote(screen);
  if (touchesNote(change.notes, open) && open !== null) await followOpenNote(open);
}

/** La note ouverte a changé sur le disque : voir la fiche de décision 0014. */
async function followOpenNote(path: string) {
  const editing = autosave;
  if (editing === null) return;
  const disk = await bridge.readNote(path).catch(() => null);
  const reaction = reactionToChange(disk, editing.fingerprint(), editing.isIdle());
  switch (reaction.kind) {
    case "ignore":
      return;
    case "reload":
      editing.adopt(reaction.fingerprint);
      return editor.reload(reaction.content);
    case "conflict":
      return editing.flush();
    case "deleted":
      return showMessage(
        "Cette note a été supprimée hors de l'application : son texte reste ici, et elle sera recréée à la prochaine modification.",
      );
  }
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
layout.trashButton.addEventListener("click", () => run(showTrash()));
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

let typewriter = loadTypewriter(localStorage);
function applyTypewriter(mode: Typewriter) {
  typewriter = mode;
  editor.setTypewriter(mode);
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
  editor.setCharactersPerPage(next.charactersPerPage);
  showSettingsDisplay();
  saveSettings(localStorage, next);
}
// En apparence automatique, l'application suit le Mac quand il passe de clair à sombre.
systemDark.addEventListener("change", showSettingsDisplay);
const showSettings = () => openSettings(layout.settings, settings, applySettings);
layout.settingsButton.addEventListener("click", showSettings);
applySettings(settings);

/** Ouverture rapide : une note de n'importe quel dossier, par quelques lettres de son titre. */
async function quickOpen() {
  if (screen.kind !== "library") return;
  const notes = await bridge.listAllNotes();
  openPicker(layout.picker, {
    label: "Ouvrir une note",
    placeholder: "Titre de la note",
    empty: "Aucune note ne correspond",
    entries: (query) => matchingNotes(notes, query),
    describe: (note) => ({ label: note.title, detail: note.folder }),
    choose: (note) => run(openNote(note.path)),
  });
}

let outlineDisplay: OutlineDisplay = "hidden";
function toggleOutline() {
  outlineDisplay = outlineDisplay === "shown" ? "hidden" : "shown";
  showOutline(layout.editor, layout.outline, layout.outlineButton, outlineDisplay);
}
layout.outlineButton.addEventListener("click", toggleOutline);

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
  "toggle-typewriter": () => (toggleTypewriter(), true),
  "toggle-outline": () => (toggleOutline(), true),
  "toggle-full-screen": () => (void setFullScreen(!fullScreen).catch(showError), true),
  "leave-full-screen": () => fullScreen && (void setFullScreen(false).catch(showError), true),
  "open-settings": () => (showSettings(), true),
  "quick-open": () => (run(quickOpen()), true),
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
bridge
  .reopenLastLibrary()
  .then((library) => (library ? showLibrary(library) : undefined))
  .catch(showError);
