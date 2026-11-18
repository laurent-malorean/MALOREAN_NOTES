// La barre d'onglets d'une colonne : un onglet par note ouverte, l'onglet actif mis en avant.
import type { Column, Placement, Tab } from "../state/columns";
import { nameOf } from "../state/folders";
import { showContextMenu } from "./context-menu";
import { noteMenu } from "./note-menu";

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
    const menu = noteMenu({
      place: (placement) => actions.place(tab.id, placement),
      close: () => actions.close(tab.id),
    });
    const printing = { label: "Imprimer…", run: () => actions.print(tab.note) };
    showContextMenu(event.clientX, event.clientY, [...menu, printing]);
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
