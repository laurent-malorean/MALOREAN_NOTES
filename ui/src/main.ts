// Assemblage : crée chaque partie de l'interface et les relie, sans logique (le fonctionnement vit sous app/, doc/code.md).
import * as bridge from "./bridge";
import { createClaudeColumn } from "./app/claude-column";
import { createOpenColumns } from "./app/columns";
import { connectAppMenu } from "./app/app-menu";
import { connectButtons } from "./app/buttons";
import { connectCommands } from "./app/commands";
import { connectFormatBar } from "./app/format-bar";
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
import { createNewContents } from "./app/new-contents";
import { paneMaker } from "./app/panes";
import { createRecentNotes } from "./app/recent-notes";
import { savingEvents } from "./app/saving";
import { screenActions } from "./app/screen-actions";
import { createSearch } from "./app/search";
import { connectSettings } from "./app/settings";
import { createTags } from "./app/tags";
import { createTemplates } from "./app/templates";
import { createTrash } from "./app/trash";
import { createWritingAssistant } from "./app/writing-assistant";
import { connectWritingModes } from "./app/writing-modes";
import { askTrash, askWorkspaceRemoval } from "./screens/confirmation";
import { createLayout } from "./screens/layout";
import { askName } from "./screens/name-prompt";
import { renderScreen, type ScreenActions } from "./screens/screen-view";
import { createSharedNotes } from "./screens/shared-notes";
import { connectWindowDisplay } from "./screens/window-display";
import { welcome } from "./state/screen";
import "./theme.css";
import "./style.css";

const layout = createLayout(document.querySelector<HTMLElement>("#app") as HTMLElement);
const messages = createMessages(layout.status, bridge.errorMessage);
const { run } = messages;
const foldMemory = createFoldMemory(localStorage);
const screen = createCurrentScreen((s) => (renderScreen(layout, s, actions), foldMemory.save(s)));
const columns = createOpenColumns({
  container: layout.columns,
  outline: layout.outline,
  screen,
  newPane: (parts) => newPane(parts),
  changed: (now) => (
    writing.showTypewriter(),
    layoutMemory.save(now),
    recent.visited(now),
    menu.follow(now),
    formatBar.follow(now),
    claude.follow()
  ),
  ...{ printNote: (path) => exporting.printNote(path), copyNote: (p) => exporting.copyNote(p) },
  ...{ copyMarkdown: (p) => exporting.copyMarkdown(p), showHistory: (p) => history.show(p) },
  run,
});
const layoutMemory = createLayoutMemory({ backend: bridge, storage: localStorage });
const recent = createRecentNotes({ backend: bridge, screen, columns, storage: localStorage });
const search = createSearch({ ...messages, backend: bridge, screen, layout, columns });
const workspace = createWorkspace({
  ...{ backend: bridge, screen, columns, layout: layoutMemory, folds: foldMemory, recent },
  ...{ storage: localStorage, show: messages.show, run, search: search.search },
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
  { documentElement: document.documentElement, ...layout },
  {
    ...{ columns, storage: localStorage, systemDark: matchMedia("(prefers-color-scheme: dark)") },
    groups: () => [templates, journal, workspace, search.meaning],
  },
);
const templates = createTemplates({
  ...{ backend: bridge, storage: localStorage, screen, columns, workspace },
  ...{ picker: layout.picker, show: messages.show, run },
});
const journal = createJournal({
  ...{ backend: bridge, storage: localStorage, screen, columns, workspace },
});
const notebooks = createNewContents({
  ...{ ...messages, backend: bridge, screen, columns, workspace, dialog: layout.confirmation },
});
const exporting = createExport({
  ...{ backend: bridge, columns, workspacePath: workspace.path, picker: layout.picker },
  ...{ sheet: layout.printSheet, storage: localStorage, show: messages.show, run },
});
const history = createHistory({ ...messages, backend: bridge, columns, layout });
const assistant = createWritingAssistant({ ...messages, backend: bridge, columns, layout });
const claude = createClaudeColumn({
  ...{ backend: bridge, layout, workspace, openNote: (path) => actions.open(path) },
  ...{ error: messages.error, columns, storage: localStorage },
});
const workspaces = createWorkspaces({
  ...{ backend: bridge, screen, columns, workspace, picker: layout.picker, run },
  askName: (options) => askName(layout.confirmation, options),
  askRemoval: (name) => askWorkspaceRemoval(layout.confirmation, name),
});
const newPane = paneMaker({
  ...{ backend: bridge, shared, workspacePath: workspace.path, related: search.meaning, layout },
  events: {
    ...{ openNote: (path) => actions.open(path), error: messages.error, show: messages.show },
    openLink: (title, inNewTab) => run(workspace.followLink(title, inNewTab)),
  },
  notebook: { add: notebooks.add, entries: bridge.listEntries },
  configure: (editor) => (writing.configure(editor), settings.configure(editor)),
});
const actions: ScreenActions = screenActions({
  ...{ backend: bridge, screen, columns, folders, workspace, trash, tags, recent },
  ...{ exporting, history, notebooks, settings, run },
});
connectButtons(layout, { ...messages, workspaces, workspace, search, trash, folders, actions });
const windowDisplay = connectWindowDisplay(layout, {
  ...{ ...messages, window: bridge, storage: localStorage },
});
const commands = connectCommands({
  ...{ backend: bridge, screen, columns, writing, window: windowDisplay, run },
  ...{ picker: layout.picker, searchField: layout.searchField, exporting, assistant },
  ...{ workspace, workspaces, templates, journal, folders, trash, settings, tags, recent, history },
  ...{ claude, notebooks, meaning: search.meaning },
});
const formatBar = connectFormatBar(layout.formatBar, commands);
const menu = connectAppMenu({ backend: bridge, actions: commands, assistant, ...messages });
connectExternalChanges({ backend: bridge, screen, columns, workspace, messages });
screen.show(welcome);
void columns.change(columns.current());
bridge
  .reopenLastWorkspace()
  // La note du jour, une fois les colonnes retrouvées.
  .then((opened) => (opened ? workspace.open(opened).then(journal.atLaunch) : undefined))
  .catch(messages.error);
if (__ESSAI__) void import("./essai").then((e) => e.start({ bridge, actions, workspace, columns }));
