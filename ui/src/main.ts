// Assemblage : crée chaque partie de l'interface et les relie, sans logique (le fonctionnement vit sous app/, doc/developpement/code.md).
import * as bridge from "./bridge";
import { createClaudeColumn } from "./app/claude-column";
import { createConnectAi } from "./app/connect-ai";
import { createOpenColumns } from "./app/columns";
import { connectAppMenu } from "./app/app-menu";
import { connectButtons } from "./app/buttons";
import { connectCommands } from "./app/commands";
import { connectFormatBar } from "./app/format-bar";
import { createCurrentScreen } from "./app/current-screen";
import { createExport } from "./app/export";
import { createFoldMemory } from "./app/fold-memory";
import { createFavorites } from "./app/favorites";
import { createFolders } from "./app/folders";
import { followColumns } from "./app/follow-columns";
import { createHistory } from "./app/history";
import { createNoteRenaming } from "./app/renaming";
import { createJournal } from "./app/journal";
import { createLayoutMemory } from "./app/layout-memory";
import { createWorkspace } from "./app/workspace";
import { createWorkspaces } from "./app/workspaces";
import { createMessages } from "./app/messages";
import { createNewContents } from "./app/new-contents";
import { paneMaker } from "./app/panes";
import { createRecentNotes } from "./app/recent-notes";
import { savingEvents } from "./app/saving";
import { start } from "./app/start";
import { screenActions } from "./app/screen-actions";
import { createSearch } from "./app/search";
import { connectSettings } from "./app/settings";
import { createTags } from "./app/tags";
import { createTemplates } from "./app/templates";
import { createTrash } from "./app/trash";
import { createVoiceInput } from "./app/voice-input";
import { createWritingAssistant } from "./app/writing-assistant";
import { connectWritingModes } from "./app/writing-modes";
import { askTrash, askWorkspaceRemoval } from "./screens/confirmation";
import { createLayout } from "./screens/layout";
import { askName } from "./screens/name-prompt";
import { renderScreen, type ScreenActions } from "./screens/screen-view";
import { createSharedNotes } from "./screens/shared-notes";
import { connectWindowDisplay } from "./screens/window-display";

const layout = createLayout(document.querySelector<HTMLElement>("#app") as HTMLElement);
const messages = createMessages(layout.status, bridge.errorMessage);
const { run } = messages;
const foldMemory = createFoldMemory(localStorage);
const screen = createCurrentScreen((s) => (renderScreen(layout, s, actions), foldMemory.save(s)));
const columns = createOpenColumns({
  ...{ container: layout.columns, outline: layout.outline, screen, newPane: (p) => newPane(p) },
  changed: (now) =>
    followColumns(now, { writing, layoutMemory, recent, menu, formatBar, claude, voice }),
  ...{ printNote: (path) => exporting.printNote(path), copyNote: (p) => exporting.copyNote(p) },
  ...{ copyMarkdown: (p) => exporting.copyMarkdown(p), showHistory: (p) => history.show(p) },
  renaming: { available: (p) => renaming.available(p), start: (p) => renaming.start(p) },
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
  ...{ backend: bridge, screen, columns, ask: askTrash.bind(null, layout.confirmation) },
  ...{ refreshList: workspace.refreshList, refreshTags: workspace.refreshTags },
});
const tags = createTags({ backend: bridge, screen, columns, run });
const shared = createSharedNotes({
  backend: bridge,
  events: savingEvents({ columns, messages, workspace, recent }),
});
const voice = createVoiceInput({ ...messages, backend: bridge, columns, bar: layout.formatBar });
const writing = connectWritingModes(layout, { columns, storage: localStorage });
const settings = connectSettings(
  { documentElement: document.documentElement, ...layout },
  {
    ...{ columns, storage: localStorage, systemDark: matchMedia("(prefers-color-scheme: dark)") },
    groups: () => [templates, journal, workspace, search.meaning, voice, favorites, ai],
  },
);
const ai = createConnectAi({ ...messages, backend: bridge, dialog: layout.confirmation });
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
const renaming = createNoteRenaming({
  ...{ ...messages, backend: bridge, columns, recent, workspace, dialog: layout.confirmation },
});
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
const favorites = createFavorites({
  ...{ backend: bridge, screen, columns, workspace, settings, picker: layout.picker, run },
  ...{ open: (path) => actions.open(path), show: messages.show },
});
const newPane = paneMaker({
  ...{ backend: bridge, shared, workspace, related: search.meaning, layout, columns, trash },
  favorites: favorites.star,
  events: {
    ...{ openNote: (path) => actions.open(path), error: messages.error, show: messages.show },
    displayed: () => voice.refresh(),
    openLink: (title, inNewTab) => run(workspace.followLink(title, inNewTab)),
  },
  notebook: { ...notebooks, entries: bridge.listEntries },
  configure: (editor) => (writing.configure(editor), settings.configure(editor)),
});
const actions: ScreenActions = screenActions({
  ...{ backend: bridge, screen, columns, folders, workspace, trash, tags, recent },
  ...{ exporting, history, renaming, notebooks, settings, run },
});
connectButtons(layout, {
  ...{ ...messages, workspaces, workspace, search, trash, folders, actions, templates, screen },
  favorites,
});
const win = connectWindowDisplay(layout, { ...messages, window: bridge, storage: localStorage });
const commands = connectCommands({
  ...{ backend: bridge, screen, columns, writing, window: win, run },
  ...{ picker: layout.picker, searchField: layout.searchField, exporting, assistant },
  ...{ workspace, workspaces, templates, journal, folders, trash, settings, tags, recent, history },
  ...{ claude, notebooks, meaning: search.meaning, voice },
});
const formatBar = connectFormatBar(layout.formatBar, commands);
const menu = connectAppMenu({ backend: bridge, actions: commands, assistant, ...messages });
void start({ messages, bridge, screen, columns, templates, workspace, journal });
if (__ESSAI__) void import("./essai").then((e) => e.start({ bridge, actions, workspace, columns }));
