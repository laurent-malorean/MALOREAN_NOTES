// Assemblage de l'interface : crée chaque partie et les relie entre elles, sans logique.
// Le fonctionnement vit dans les modules de chaque domaine, sous `app/` (doc/code.md).
import * as bridge from "./bridge";
import { createOpenColumns } from "./app/columns";
import { connectCommands } from "./app/commands";
import { createCurrentScreen } from "./app/current-screen";
import { connectExternalChanges } from "./app/external-changes";
import { createFoldMemory } from "./app/fold-memory";
import { createFolders } from "./app/folders";
import { createLayoutMemory } from "./app/layout-memory";
import { createLibrary } from "./app/library";
import { createMessages } from "./app/messages";
import { paneMaker } from "./app/panes";
import { savingEvents } from "./app/saving";
import { screenActions } from "./app/screen-actions";
import { createSearch } from "./app/search";
import { connectSettings } from "./app/settings";
import { createTags } from "./app/tags";
import { createTemplates } from "./app/templates";
import { createTrash } from "./app/trash";
import { connectWritingModes } from "./app/writing-modes";
import { askTrash } from "./screens/confirmation";
import { createLayout } from "./screens/layout";
import { renderScreen, type ScreenActions } from "./screens/screen-view";
import { connectSearchField } from "./screens/search-field";
import { createSharedNotes } from "./screens/shared-notes";
import { connectWindowDisplay } from "./screens/window-display";
import { welcome } from "./state/screen";
import "./theme.css";
import "./style.css";

const layout = createLayout(document.querySelector<HTMLElement>("#app") as HTMLElement);
const messages = createMessages(layout.status, bridge.errorMessage);
const { run } = messages;
const foldMemory = createFoldMemory(localStorage);
const screen = createCurrentScreen(
  (next) => (renderScreen(layout, next, actions), foldMemory.save(next)),
);
const columns = createOpenColumns({
  container: layout.columns,
  outline: layout.outline,
  screen,
  newPane: (parts) => newPane(parts),
  changed: (now) => (writing.showTypewriter(), layoutMemory.save(now)),
  run,
});
const layoutMemory = createLayoutMemory({ backend: bridge, storage: localStorage });
const search = createSearch({ backend: bridge, screen, run });
const library = createLibrary({
  backend: bridge,
  screen,
  columns,
  layout: layoutMemory,
  folds: foldMemory,
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
  ...{ refreshList: library.refreshList, refreshTags: library.refreshTags },
});
const tags = createTags({ backend: bridge, screen, columns, run });
const shared = createSharedNotes({
  backend: bridge,
  events: savingEvents({ columns, messages, library }),
});
const writing = connectWritingModes(layout, { columns, storage: localStorage });
const settings = connectSettings(
  { page: document.documentElement, ...layout },
  {
    columns,
    storage: localStorage,
    systemDark: window.matchMedia("(prefers-color-scheme: dark)"),
    groups: () => templates.settingsGroups(),
  },
);
const templates = createTemplates({
  ...{ backend: bridge, storage: localStorage, screen, columns, library },
  ...{ picker: layout.picker, show: messages.show, run },
});
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

const actions: ScreenActions = screenActions({
  ...{ backend: bridge, columns, folders, library, trash, tags, run },
});

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
  templates,
  folders,
  trash,
  settings,
  tags,
  run,
});
connectExternalChanges({ backend: bridge, screen, columns, library, messages });

screen.show(welcome);
void columns.change(columns.current());
bridge
  .reopenLastLibrary()
  .then((opened) => (opened ? library.open(opened) : undefined))
  .catch(messages.error);
