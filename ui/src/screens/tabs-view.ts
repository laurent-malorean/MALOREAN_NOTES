// La barre d'onglets d'une colonne : un onglet par note ouverte, l'onglet actif mis en avant.
import type { Column, Tab } from "../state/columns";
import { nameOf } from "../state/folders";

/** Ce qu'on peut demander depuis la barre d'onglets d'une colonne. */
export interface TabActions {
  /** Montrer la note de cet onglet. */
  activate(tabId: number): void;
  /** Fermer cet onglet. */
  close(tabId: number): void;
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
  element.append(label, close);
  return element;
}

/** Dessine les onglets de la colonne dans `list`. */
export function renderTabs(list: HTMLElement, column: Column, actions: TabActions): void {
  list.replaceChildren(
    ...column.tabs.map((tab) => tabElement(tab, tab.id === column.activeTab, actions)),
  );
}
