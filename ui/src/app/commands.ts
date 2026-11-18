// Commandes : ce que fait chaque commande de la palette et chaque raccourci clavier, l'ouverture
// rapide d'une note par son titre et le choix du tri de la liste.
import type * as Bridge from "../bridge";
import { openPicker } from "../screens/picker";
import { type Shortcut, shortcutFor } from "../screens/shortcuts";
import type { WindowDisplay } from "../screens/window-display";
import { activeTabClosed, notePlaced, tabStepped } from "../state/columns";
import { type CommandId, matchingCommands } from "../state/commands";
import { NOTE_ORDERS, type NoteOrder } from "../state/note-order";
import { matching, matchingNotes } from "../state/quick-open";
import { noteOrder } from "../state/screen";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { Exporting } from "./export";
import type { WritingModes } from "./writing-modes";
import type { Workspaces } from "./workspaces";

export interface CommandsDeps {
  readonly backend: Pick<typeof Bridge, "listAllNotes">;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "update" | "split" | "openNote" | "activePane">;
  readonly writing: Pick<WritingModes, "toggleFocus" | "toggleTypewriter" | "toggleOutline">;
  readonly window: WindowDisplay;
  /** La fenêtre de choix au clavier, et le champ de recherche dans tout l'espace de travail. */
  readonly picker: HTMLDialogElement;
  readonly searchField: HTMLElement;
  readonly workspace: {
    createNote(): Promise<void>;
    sortBy(order: NoteOrder): Promise<void>;
  };
  /** Les espaces de travail : passer de l'un à l'autre, en ajouter, renommer, retirer. */
  readonly workspaces: Pick<Workspaces, "choose" | "add" | "rename" | "chooseRemoval">;
  readonly templates: { newNote(): Promise<void> };
  /** La note du jour du journal. */
  readonly journal: { open(): Promise<void> };
  readonly folders: { startCreation(): void };
  readonly trash: { show(): Promise<void> };
  readonly settings: { open(): void };
  /** Le filtre par étiquette, que retire Échap ; faux s'il n'y en avait pas. */
  readonly tags: { clear(): boolean };
  /** Les notes récentes, que l'ouverture rapide propose d'abord. */
  readonly recent: { paths(): readonly string[] };
  /** L'export et l'impression de la note de la colonne active. */
  readonly exporting: Exporting;
  run(action: Promise<unknown>): void;
}

/**
 * Ouverture rapide : une note de n'importe quel dossier, par quelques lettres de son titre (les
 * notes récentes d'abord tant que rien n'est tapé) ; dans un nouvel onglet pour Cmd+T.
 */
async function quickOpen(
  deps: CommandsDeps,
  label = "Ouvrir une note",
  open: (path: string) => Promise<void> = deps.columns.openNote,
) {
  if (deps.screen.get().kind !== "workspace") return;
  const notes = await deps.backend.listAllNotes();
  openPicker(deps.picker, {
    label,
    placeholder: "Titre de la note",
    empty: "Aucune note ne correspond",
    entries: (query) => matchingNotes(notes, query, deps.recent.paths()),
    describe: (note) => ({ label: note.title, detail: note.folder }),
    choose: (note) => deps.run(open(note.path)),
  });
}

/** Le tri de la liste, choisi au clavier ; le tri en cours est marqué. */
function chooseOrder(deps: CommandsDeps) {
  const current = noteOrder(deps.screen.get());
  openPicker(deps.picker, {
    label: "Trier la liste",
    placeholder: "Trier par",
    empty: "Aucun tri ne correspond",
    entries: (query) => matching(NOTE_ORDERS, query, (choice) => choice.label),
    describe: ({ order, label }) => ({ label, detail: order === current ? "actuel" : undefined }),
    choose: ({ order }) => deps.run(deps.workspace.sortBy(order)),
  });
}

/** Ce que fait chaque commande de la palette. */
export function commandActions(deps: CommandsDeps): Readonly<Record<CommandId, () => void>> {
  const { run, columns, writing } = deps;
  return {
    "quick-open": () => run(quickOpen(deps)),
    "new-note": () => run(deps.workspace.createNote()),
    "new-note-from-template": () => run(deps.templates.newNote()),
    "daily-note": () => run(deps.journal.open()),
    "new-folder": () => deps.folders.startCreation(),
    "search-workspace": () => deps.searchField.focus(),
    "find-in-note": () => columns.activePane().editor.openFind(),
    "toggle-focus": () => writing.toggleFocus(),
    "toggle-typewriter": () => writing.toggleTypewriter(),
    "toggle-outline": () => writing.toggleOutline(),
    "toggle-full-screen": () => run(deps.window.toggleFullScreen()),
    "toggle-side-panels": () => deps.window.toggleSidePanels(),
    "new-tab": () =>
      run(
        quickOpen(deps, "Nouvel onglet", (path) =>
          columns.update((now) => notePlaced(now, path, "newTab")),
        ),
      ),
    "close-tab": () => run(columns.update(activeTabClosed)),
    "next-tab": () => run(columns.update((now) => tabStepped(now, 1))),
    "previous-tab": () => run(columns.update((now) => tabStepped(now, -1))),
    "split-column": () => run(columns.split()),
    "export-note": () => deps.exporting.exportNote(),
    "print-note": () => deps.exporting.printNote(),
    "sort-notes": () => chooseOrder(deps),
    "show-trash": () => run(deps.trash.show()),
    "open-settings": () => deps.settings.open(),
    "switch-workspace": () => run(deps.workspaces.choose()),
    "add-workspace": () => run(deps.workspaces.add()),
    "rename-workspace": () => run(deps.workspaces.rename()),
    "remove-workspace": () => run(deps.workspaces.chooseRemoval()),
  };
}

/** La palette de commandes : une action de l'application, par quelques lettres de son nom. */
function openPalette(deps: CommandsDeps, actions: Readonly<Record<CommandId, () => void>>) {
  if (deps.screen.get().kind !== "workspace") return;
  openPicker(deps.picker, {
    label: "Palette de commandes",
    placeholder: "Nom de la commande",
    empty: "Aucune commande ne correspond",
    entries: matchingCommands,
    describe: (command) => ({ label: command.label, detail: command.shortcut }),
    choose: (command) => actions[command.id](),
  });
}

/** Ce que fait chaque raccourci ; faux si la touche n'a servi à rien et reste à la fenêtre. */
function shortcutActions(
  deps: CommandsDeps,
  actions: Readonly<Record<CommandId, () => void>>,
): Readonly<Record<Shortcut, () => boolean>> {
  const done = (action: () => void) => () => (action(), true);
  return {
    "toggle-focus": done(actions["toggle-focus"]),
    "toggle-typewriter": done(actions["toggle-typewriter"]),
    "toggle-outline": done(actions["toggle-outline"]),
    "toggle-full-screen": done(actions["toggle-full-screen"]),
    // Échap fait une chose à la fois : quitter le plein écran, sinon retirer le filtre par étiquette.
    "leave-full-screen": () => deps.window.leaveFullScreen() || deps.tags.clear(),
    "toggle-side-panels": done(actions["toggle-side-panels"]),
    "open-settings": done(actions["open-settings"]),
    "quick-open": done(actions["quick-open"]),
    "command-palette": done(() => openPalette(deps, actions)),
    "new-tab": done(actions["new-tab"]),
    "close-tab": done(actions["close-tab"]),
    "next-tab": done(actions["next-tab"]),
    "previous-tab": done(actions["previous-tab"]),
    "split-column": done(actions["split-column"]),
    "new-note-from-template": done(actions["new-note-from-template"]),
    "daily-note": done(actions["daily-note"]),
    "switch-workspace": done(actions["switch-workspace"]),
    "export-note": done(actions["export-note"]),
    "print-note": done(actions["print-note"]),
  };
}

/** Branche les raccourcis clavier ; rend ce que fait chaque commande. */
export function connectCommands(deps: CommandsDeps): Readonly<Record<CommandId, () => void>> {
  const actions = commandActions(deps);
  const shortcuts = shortcutActions(deps, actions);
  document.addEventListener("keydown", (event) => {
    // Une touche déjà prise par l'éditeur (Échap ferme sa recherche) ne sert pas une seconde fois.
    // Une fenêtre ouverte (réglages, choix) garde le clavier : Échap la ferme, sans quitter le plein écran.
    if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
    const shortcut = shortcutFor(event);
    if (shortcut && shortcuts[shortcut]()) event.preventDefault();
  });
  return actions;
}
