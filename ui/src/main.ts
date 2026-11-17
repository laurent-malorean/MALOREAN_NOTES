// Assemblage de l'interface : crée chaque partie et les relie entre elles, sans logique.
// Le fonctionnement vit dans les modules de chaque domaine, sous `app/` (doc/code.md).
import * as bridge from "./bridge";
import { createOpenColumns } from "./app/columns";
import { connectCommands } from "./app/commands";
import { createCurrentScreen } from "./app/current-screen";
import { connectExternalChanges } from "./app/external-changes";
import { createFolders } from "./app/folders";
import { createLibrary } from "./app/library";
import { createMessages } from "./app/messages";
import { paneMaker } from "./app/panes";
import { savingEvents } from "./app/saving";
import { createSearch } from "./app/search";
import { connectSettings } from "./app/settings";
import { createTrash } from "./app/trash";
import { connectWritingModes } from "./app/writing-modes";
import { askTrash } from "./screens/confirmation";
import { createLayout } from "./screens/layout";
import { renderScreen, type ScreenActions } from "./screens/screen-view";
import { connectSearchField } from "./screens/search-field";
import { createSharedNotes } from "./screens/shared-notes";
import { connectWindowDisplay } from "./screens/window-display";
import { noteClosed, notePlaced } from "./state/columns";
import { welcome } from "./state/screen";
import "./theme.css";
import "./style.css";

const layout = createLayout(document.querySelector<HTMLElement>("#app") as HTMLElement);
const messages = createMessages(layout.status, bridge.errorMessage);
const { run } = messages;
const screen = createCurrentScreen((next) => renderScreen(layout, next, actions));
const columns = createOpenColumns({
  container: layout.columns,
  outline: layout.outline,
  screen,
  newPane: (parts) => newPane(parts),
  changed: () => writing.showTypewriter(),
  run,
});
const search = createSearch({ backend: bridge, screen, run });
const library = createLibrary({
  backend: bridge,
  screen,
  columns,
  show: messages.show,
  search: search.search,
});
const folders = createFolders({
  backend: bridge,
  screen,
  columns,
  refreshList: library.refreshList,
  list: layout.foldersList,
  run,
});
const trash = createTrash({
  backend: bridge,
  screen,
  columns,
  ask: (name) => askTrash(layout.confirmation, name),
  refreshList: library.refreshList,
});
const shared = createSharedNotes({
  backend: bridge,
  events: savingEvents({ columns, messages, library }),
});
const writing = connectWritingModes(layout, { columns, storage: localStorage });
const settings = connectSettings(
  { page: document.documentElement, ...layout },
  { columns, storage: localStorage, systemDark: window.matchMedia("(prefers-color-scheme: dark)") },
);
const newPane = paneMaker({
  backend: bridge,
  shared,
  events: {
    openNote: (path) => actions.open(path),
    openLink: (title) => run(library.followLink(title)),
    error: messages.error,
  },
  libraryPath: library.path,
  configure: (editor) => (writing.configure(editor), settings.configure(editor)),
});

const actions: ScreenActions = {
  open: (path) => run(columns.openNote(path)),
  select: (folder) => run(folders.select(folder)),
  create: (parent, name) => run(folders.create(parent, name)),
  rename: (path, name) => run(folders.rename(path, name)),
  move: (path, into) => run(folders.move(path, into)),
  moveNote: (path, into) => run(library.moveNote(path, into)),
  pin: (path) => run(library.changePin(path, bridge.pinNote)),
  unpin: (path) => run(library.changePin(path, bridge.unpinNote)),
  trash: (path) => run(trash.trashNote(path)),
  place: (path, placement) => run(columns.update((now) => notePlaced(now, path, placement))),
  closeNote: (path) => run(columns.update((now) => noteClosed(now, path))),
  trashFolder: (path) => run(trash.trashFolder(path)),
  restoreNote: (path) => run(trash.restoreNote(path)),
  restoreFolder: (path) => run(trash.restoreFolder(path)),
  empty: () => run(trash.empty()),
};

layout.chooseButtons.forEach((button) =>
  button.addEventListener("click", () => run(library.choose())),
);
layout.newNoteButton.addEventListener("click", () => run(library.createNote()));
connectSearchField(layout.searchField, search.type);
layout.trashButton.addEventListener("click", () => run(trash.show()));
layout.newFolderButton.addEventListener("click", folders.startCreation);

const windowDisplay = connectWindowDisplay(layout, {
  window: bridge,
  storage: localStorage,
  error: messages.error,
});
connectCommands({
  backend: bridge,
  screen,
  columns,
  writing,
  window: windowDisplay,
  picker: layout.picker,
  searchField: layout.searchField,
  library,
  folders,
  trash,
  settings,
  run,
});
connectExternalChanges({ backend: bridge, screen, columns, library, messages });

screen.show(welcome);
void columns.change(columns.current());
bridge
  .reopenLastLibrary()
  .then((opened) => (opened ? library.open(opened) : undefined))
  .catch(messages.error);
