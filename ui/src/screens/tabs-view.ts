// La barre d'onglets d'une colonne : un onglet par note ouverte, l'onglet actif mis en avant.
import type { Column, Placement, Tab } from "../state/columns";
import { nameOf } from "../state/folders";
import { showContextMenu } from "./context-menu";
import {
  COPY_LABEL,
  HISTORY_LABEL,
  MARKDOWN_COPY_LABEL,
  type NoteRenaming,
  noteMenu,
  withRename,
} from "./note-menu";

/** Ce qu'on peut demander depuis la barre d'onglets d'une colonne. */
export interface TabActions {
  /** Montrer la note de cet onglet. */
  activate(tabId: number): void;
  /** Fermer cet onglet. */
  close(tabId: number): void;
  /** Ouvrir la note de cet onglet à cet emplacement. */
  place(tabId: number, placement: Placement): void;
  /** On commence à glisser cet onglet, ou on a fini (`null`). */
  drag(tabId: number | null): void;
  /** Ouvrir la fenêtre d'impression du Mac sur cette note. */
  print(note: string): void;
  /** Copier cette note en texte mis en forme. */
  copy(note: string): void;
  /** Copier le texte Markdown de cette note, tel quel. */
  copyMarkdown(note: string): void;
  /** Ouvrir l'historique des versions de cette note. */
  history(note: string): void;
  /** Renommer la note de cet onglet par son menu ; sans lui, le menu n'a pas « Renommer… ». */
  readonly renaming?: NoteRenaming;
}

const NOTE_EXTENSION = ".md";

/** Ce que dit l'onglet : le titre de la note, ou son nom de fichier tant qu'elle n'est pas lue. */
export function tabLabel(tab: Tab): string {
  return tab.title ?? nameOf(tab.note).slice(0, -NOTE_EXTENSION.length);
}

function tabElement(tab: Tab, active: boolean, actions: TabActions): HTMLElement {
  const element = document.createElement("div");
  element.className = "tab";
  element.setAttribute("role", "tab");
  element.setAttribute("aria-selected", String(active));
  element.title = tab.note;
  element.dataset.tab = String(tab.id);
  element.draggable = true;
  element.addEventListener("dragstart", () => actions.drag(tab.id));
  element.addEventListener("dragend", () => actions.drag(null));
  const label = document.createElement("span");
  label.className = "tab-title";
  label.textContent = tabLabel(tab);
  const close = document.createElement("button");
  close.className = "tab-close";
  close.title = "Fermer l'onglet";
  close.setAttribute("aria-label", "Fermer l'onglet");
  close.textContent = "×";
  close.addEventListener("click", (event) => {
    // L'onglet fermé ne devient pas actif au passage.
    event.stopPropagation();
    actions.close(tab.id);
  });
  element.addEventListener("click", () => actions.activate(tab.id));
  element.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const printing = {
      label: "Imprimer…",
      icon: "print" as const,
      run: () => actions.print(tab.note),
    };
    const copying = { label: COPY_LABEL, icon: "copy" as const, run: () => actions.copy(tab.note) };
    const markdown = {
      label: MARKDOWN_COPY_LABEL,
      icon: "markdown" as const,
      run: () => actions.copyMarkdown(tab.note),
    };
    const history = {
      label: HISTORY_LABEL,
      icon: "history" as const,
      run: () => actions.history(tab.note),
    };
    const { clientX, clientY } = event;
    withRename(tab.note, actions.renaming, (rename) => {
      const menu = noteMenu({
        place: (placement) => actions.place(tab.id, placement),
        close: () => actions.close(tab.id),
        rename,
      });
      showContextMenu(clientX, clientY, [...menu, printing, copying, markdown, history]);
    });
  });
  element.append(label, close);
  return element;
}

/** Ce que montre chaque barre d'onglets, pour ne la redessiner que si cela change. */
const drawn = new WeakMap<HTMLElement, string>();

/**
 * Dessine les onglets de la colonne dans `list`. Les mêmes onglets gardent leurs éléments : un clic
 * qui rend la colonne active (et la redessine) aboutit encore sur l'onglet visé.
 */
export function renderTabs(list: HTMLElement, column: Column, actions: TabActions): void {
  const shown = JSON.stringify([column.tabs, column.activeTab]);
  if (drawn.get(list) === shown) return;
  drawn.set(list, shown);
  list.replaceChildren(
    ...column.tabs.map((tab) => tabElement(tab, tab.id === column.activeTab, actions)),
  );
}
