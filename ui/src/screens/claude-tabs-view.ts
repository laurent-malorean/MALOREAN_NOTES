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

const SVG_NS = "http://www.w3.org/2000/svg";
const ARROW_LABELS = {
  left: "Faire défiler les onglets vers la gauche",
  right: "Faire défiler les onglets vers la droite",
} as const;
type Side = keyof typeof ARROW_LABELS;
const DIRECTION: Record<Side, number> = { left: -1, right: 1 };

/** Un petit chevron « < » ou « > », dessiné en `currentColor`. */
function chevron(side: Side) {
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  icon.classList.add("claude-tabs-arrow-icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", side === "left" ? "M10 3 L5 8 L10 13" : "M6 3 L11 8 L6 13");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  icon.append(path);
  return icon;
}

function arrowButton(side: Side, scrollBy: (direction: number) => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon claude-tabs-arrow";
  button.dataset.tabsScroll = side;
  button.title = ARROW_LABELS[side];
  button.setAttribute("aria-label", ARROW_LABELS[side]);
  button.hidden = true;
  button.append(chevron(side));
  button.addEventListener("click", () => scrollBy(DIRECTION[side]));
  return button;
}

/** Amène `tab` dans la zone visible de `list`, en défilant le moins possible. */
function reveal(list: HTMLElement, tab: HTMLElement) {
  const box = list.getBoundingClientRect();
  const at = tab.getBoundingClientRect();
  if (at.left < box.left) list.scrollLeft -= box.left - at.left;
  else if (at.right > box.right) list.scrollLeft += at.right - box.right;
}

/**
 * Remplit `bar` : les onglets entre deux flèches de défilement, qui n'apparaissent que si les onglets
 * débordent. `show` redessine seulement si les onglets ont changé : la colonne est redessinée à
 * chaque événement de Claude, et un clic en cours doit aboutir sur l'onglet visé. Un redessin garde
 * le défilement ; l'onglet montré n'est amené en vue que s'il vient de changer.
 */
export function createConversationTabsView(
  bar: HTMLElement,
  handlers: ConversationTabsHandlers,
): (tabs: readonly ShownConversationTab[]) => void {
  const list = document.createElement("div");
  list.className = "claude-tabs";
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", "Onglets de conversation");
  const scrollBy = (direction: number) => {
    const first = list.querySelector<HTMLElement>(".claude-tab");
    const step = first === null ? 0 : first.getBoundingClientRect().width;
    list.scrollBy({ left: direction * step, behavior: "smooth" });
  };
  const left = arrowButton("left", scrollBy);
  const right = arrowButton("right", scrollBy);
  bar.replaceChildren(left, list, right);
  const showArrows = () => {
    const overflowing = list.scrollWidth > list.clientWidth;
    left.hidden = right.hidden = !overflowing;
    left.disabled = list.scrollLeft <= 0;
    right.disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1;
  };
  list.addEventListener("scroll", showArrows);
  new ResizeObserver(showArrows).observe(list);
  let drawn: string | null = null;
  let revealed = "";
  return (tabs) => {
    const key = JSON.stringify(tabs);
    if (key === drawn) return;
    drawn = key;
    const scrolled = list.scrollLeft;
    list.replaceChildren(...tabs.map((tab) => tabElement(tab, handlers)));
    list.scrollLeft = scrolled;
    const active = tabs.find((tab) => tab.active);
    const shownNow = `${active?.id}/${tabs.length}`;
    if (shownNow !== revealed) {
      revealed = shownNow;
      const element = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (element !== null) reveal(list, element);
    }
    showArrows();
  };
}
