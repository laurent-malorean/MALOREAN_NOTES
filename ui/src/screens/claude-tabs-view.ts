// La barre des onglets de conversation, en haut de la colonne Claude Code, comme dans le module de
// VS Code : un onglet par conversation, avec son titre et sa croix ; celui qui répond porte un
// témoin (fiche 0032). Tout à la souris.

/** Ce que la barre montre d'un onglet de conversation. */
export interface ShownConversationTab {
  readonly id: number;
  readonly title: string;
  /** Son tour court. */
  readonly running: boolean;
  /** C'est l'onglet montré. */
  readonly active: boolean;
}

export interface ConversationTabsHandlers {
  /** Montrer la conversation de cet onglet. */
  showTab(id: number): void;
  /** Fermer cet onglet. */
  closeTab(id: number): void;
}

/** Ce que dit le témoin de l'onglet qui répond. */
export const REPLYING = "Claude répond";

function tabElement(tab: ShownConversationTab, handlers: ConversationTabsHandlers) {
  const element = document.createElement("div");
  element.className = "claude-tab";
  element.setAttribute("role", "tab");
  element.setAttribute("aria-selected", String(tab.active));
  element.dataset.tab = String(tab.id);
  element.title = tab.running ? `${tab.title} · ${REPLYING}` : tab.title;
  if (tab.running) {
    const running = document.createElement("span");
    running.className = "claude-tab-running";
    running.setAttribute("aria-label", REPLYING);
    element.append(running);
  }
  const label = document.createElement("span");
  label.className = "claude-tab-title";
  label.textContent = tab.title;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "claude-tab-close";
  close.title = tab.running
    ? "Arrêter la réponse et fermer l'onglet de conversation"
    : "Fermer l'onglet de conversation";
  close.setAttribute("aria-label", `Fermer l'onglet de conversation « ${tab.title} »`);
  close.textContent = "×";
  close.addEventListener("click", (event) => {
    // L'onglet fermé n'est pas montré au passage.
    event.stopPropagation();
    handlers.closeTab(tab.id);
  });
  element.addEventListener("click", () => handlers.showTab(tab.id));
  element.append(label, close);
  return element;
}

/**
 * Remplit la barre `list` ; `show` la redessine seulement si ses onglets ont changé : la colonne est
 * redessinée à chaque événement de Claude, et un clic en cours doit aboutir sur l'onglet visé.
 */
export function createConversationTabsView(
  list: HTMLElement,
  handlers: ConversationTabsHandlers,
): (tabs: readonly ShownConversationTab[]) => void {
  let drawn: string | null = null;
  return (tabs) => {
    const key = JSON.stringify(tabs);
    if (key === drawn) return;
    drawn = key;
    list.replaceChildren(...tabs.map((tab) => tabElement(tab, handlers)));
  };
}
