// Assemblage de l'interface : crée chaque partie et les relie entre elles, sans logique.
// Le fonctionnement vit dans les modules de chaque domaine, sous `app/` (doc/code.md).
import * as bridge from "./bridge";
import { createOpenColumns } from "./app/columns";
import { connectAppMenu } from "./app/app-menu";
import { connectCommands } from "./app/commands";
import { createCurrentScreen } from "./app/current-screen";
import { createExport } from "./app/export";
import { connectExternalChanges } from "./app/external-changes";
import { createFoldMemory } from "./app/fold-memory";
import { createFolders } from "./app/folders";
import { createHistory } from "./app/history";
import { createJournal } from "./app/journal";
import { createLayoutMemory } from "./app/layout-memory";
import { createWorkspace } from "./app/workspace";
import { createWorkspaces } from "./app/workspaces";
import { createMessages } from "./app/messages";
import { paneMaker } from "./app/panes";
import { createRecentNotes } from "./app/recent-notes";
import { savingEvents } from "./app/saving";
import { screenActions } from "./app/screen-actions";
import { createSearch } from "./app/search";
import { connectSettings } from "./app/settings";
import { createTags } from "./app/tags";
import { createTemplates } from "./app/templates";
import { createTrash } from "./app/trash";
import { connectWritingModes } from "./app/writing-modes";
import { askTrash, askWorkspaceRemoval } from "./screens/confirmation";
import { createLayout } from "./screens/layout";
import { askName } from "./screens/name-prompt";
import { renderScreen, type ScreenActions } from "./screens/screen-view";
import { connectSearchField } from "./screens/search-field";
import { createSharedNotes } from "./screens/shared-notes";
import { connectWindowDisplay } from "./screens/window-display";
import { connectWorkspaceSwitcher } from "./screens/workspace-switcher";
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
  changed: (now) => (
    writing.showTypewriter(),
    layoutMemory.save(now),
    recent.visited(now),
    menu.follow(now)
  ),
  ...{ printNote: (path) => exporting.printNote(path), copyNote: (p) => exporting.copyNote(p) },
  ...{ copyMarkdown: (p) => exporting.copyMarkdown(p), showHistory: (p) => history.show(p) },
  run,
});
const layoutMemory = createLayoutMemory({ backend: bridge, storage: localStorage });
const recent = createRecentNotes({ backend: bridge, screen, columns, storage: localStorage });
const search = createSearch({ backend: bridge, screen, run });
const workspace = createWorkspace({
  ...{ backend: bridge, screen, columns, layout: layoutMemory, folds: foldMemory, recent },
  ...{ storage: localStorage, show: messages.show, search: search.search },
});
const folders = createFolders({
  ...{ backend: bridge, screen, columns },
  ...{ refreshList: workspace.refreshList, recent, list: layout.foldersList, run },
});
const trash = createTrash({
  ...{ backend: bridge, screen, columns, ask: (name) => askTrash(layout.confirmation, name) },
  ...{ refreshList: workspace.refreshList, refreshTags: workspace.refreshTags },
});
const tags = createTags({ backend: bridge, screen, columns, run });
const shared = createSharedNotes({
  backend: bridge,
  events: savingEvents({ columns, messages, workspace, recent }),
});
const writing = connectWritingModes(layout, { columns, storage: localStorage });
const settings = connectSettings(
  { page: document.documentElement, ...layout },
  {
    columns,
    storage: localStorage,
    systemDark: window.matchMedia("(prefers-color-scheme: dark)"),
    groups: () => [...templates.settingsGroups(), ...journal.settingsGroups()],
  },
);
const templates = createTemplates({
  ...{ backend: bridge, storage: localStorage, screen, columns, workspace },
  ...{ picker: layout.picker, show: messages.show, run },
});
const journal = createJournal({
  ...{ backend: bridge, storage: localStorage, screen, columns, workspace },
});
const exporting = createExport({
  ...{ backend: bridge, columns, workspacePath: workspace.path, picker: layout.picker },
  ...{ sheet: layout.printSheet, storage: localStorage, show: messages.show, run },
});
const history = createHistory({ ...messages, backend: bridge, columns, layout });
const workspaces = createWorkspaces({
  ...{ backend: bridge, screen, columns, workspace, picker: layout.picker, run },
  askName: (options) => askName(layout.confirmation, options),
  askRemoval: (name) => askWorkspaceRemoval(layout.confirmation, name),
});
const newPane = paneMaker({
  ...{ backend: bridge, shared, workspacePath: workspace.path },
  events: {
    openNote: (path) => actions.open(path),
    openLink: (title) => run(workspace.followLink(title)),
    error: messages.error,
  },
  configure: (editor) => (writing.configure(editor), settings.configure(editor)),
});

const actions: ScreenActions = screenActions({
  ...{ backend: bridge, columns, folders, workspace, trash, tags, recent, exporting },
  ...{ history, run },
});

layout.addButton.addEventListener("click", () => run(workspaces.add()));
layout.switchButton.addEventListener("click", () => run(workspaces.choose()));
connectWorkspaceSwitcher(layout.workspaceSwitcher, workspaces.menu, messages.error);
layout.newNoteButton.addEventListener("click", () => run(workspace.createNote()));
connectSearchField(layout.searchField, search.type);
layout.trashButton.addEventListener("click", () => run(trash.show()));
layout.newFolderButton.addEventListener("click", folders.startCreation);

const windowDisplay = connectWindowDisplay(layout, {
  ...{ window: bridge, storage: localStorage, error: messages.error },
});
const commands = connectCommands({
  ...{ backend: bridge, screen, columns, writing, window: windowDisplay, run },
  ...{ picker: layout.picker, searchField: layout.searchField, exporting },
  ...{ workspace, workspaces, templates, journal, folders, trash, settings, tags, recent, history },
});
const menu = connectAppMenu({ backend: bridge, actions: commands, error: messages.error });
connectExternalChanges({ backend: bridge, screen, columns, workspace, messages });

screen.show(welcome);
void columns.change(columns.current());
bridge
  .reopenLastWorkspace()
  // La note du jour, une fois les colonnes retrouvées.
  .then((opened) => (opened ? workspace.open(opened).then(journal.atLaunch) : undefined))
  .catch(messages.error);
