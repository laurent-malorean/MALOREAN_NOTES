// Les colonnes d'édition à l'écran : une section par colonne, un séparateur entre deux voisines.
import { type Columns, MAX_COLUMNS } from "../state/columns";
import { renderTabs } from "./tabs-view";

/** Ce qu'une colonne offre à l'éditeur qui s'y pose : son élément et la place des liens entrants. */
export interface ColumnParts {
  readonly element: HTMLElement;
  readonly backlinks: HTMLElement;
}

/** Ce que les colonnes annoncent ou demandent. */
export interface ColumnsHandlers {
  /** Une colonne vient d'apparaître : on y pose son éditeur. */
  created(id: number, parts: ColumnParts): void;
  /** Une colonne a disparu de l'écran. */
  removed(id: number): void;
  /** On a cliqué, ou tapé, dans cette colonne. */
  activate(id: number): void;
  /** Montrer la note d'un onglet. */
  activateTab(tabId: number): void;
  /** Fermer un onglet. */
  closeTab(tabId: number): void;
  /** Diviser la colonne active. */
  split(): void;
  /** Le séparateur `divider` glisse de `delta`, en part de la zone d'édition. */
  resize(divider: number, delta: number): void;
}

export interface ColumnsView {
  /** Met l'écran en accord avec l'état des colonnes. */
  render(columns: Columns): void;
}

/** Une colonne à l'écran : ses parties, ses onglets, son bouton « Diviser », le séparateur à sa gauche. */
interface ShownColumn {
  readonly parts: ColumnParts;
  readonly tabs: HTMLElement;
  readonly split: HTMLButtonElement;
  readonly divider: HTMLElement;
}

function columnElement(id: number, container: HTMLElement, handlers: ColumnsHandlers): ShownColumn {
  const element = document.createElement("section");
  element.className = "column";
  element.setAttribute("aria-label", "Colonne");
  // Avant tout autre effet du clic (Cmd+clic sur un lien, case à cocher) : la colonne est déjà active.
  element.addEventListener("mousedown", () => handlers.activate(id), { capture: true });
  element.addEventListener("focusin", () => handlers.activate(id));
  const header = document.createElement("header");
  header.className = "column-header";
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Onglets");
  const split = document.createElement("button");
  split.className = "icon column-split";
  split.title = "Diviser la colonne";
  split.textContent = "◫";
  split.addEventListener("click", () => handlers.split());
  header.append(tabs, split);
  const backlinks = document.createElement("nav");
  backlinks.className = "backlinks";
  backlinks.setAttribute("aria-label", "Liens entrants");
  backlinks.hidden = true;
  element.append(header, backlinks);
  return {
    parts: { element, backlinks },
    tabs,
    split,
    divider: dividerElement(container, handlers),
  };
}

/** Le séparateur suit le pointeur, aussi loin que les largeurs minimales le permettent. */
function dividerElement(container: HTMLElement, handlers: ColumnsHandlers): HTMLElement {
  const divider = document.createElement("div");
  divider.className = "column-divider";
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-orientation", "vertical");
  divider.addEventListener("pointerdown", (start) => {
    start.preventDefault();
    const index = Number(divider.dataset.index);
    const follow = (event: PointerEvent) => {
      const dividers = [...container.querySelectorAll<HTMLElement>(".column-divider")];
      const free = container.clientWidth - dividers.reduce((sum, d) => sum + d.offsetWidth, 0);
      const box = divider.getBoundingClientRect();
      handlers.resize(index, (event.clientX - (box.left + box.width / 2)) / free);
    };
    const stop = () => document.removeEventListener("pointermove", follow);
    document.addEventListener("pointermove", follow);
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: écouter encore la fin d'un glissement fini ne change rien.
    document.addEventListener("pointerup", stop, { once: true });
  });
  return divider;
}

/** Les colonnes, dessinées dans `container` ; chaque colonne garde son élément tant qu'elle existe. */
export function createColumnsView(container: HTMLElement, handlers: ColumnsHandlers): ColumnsView {
  const shown = new Map<number, ShownColumn>();
  return {
    render(columns) {
      for (const id of shown.keys()) {
        if (columns.list.some((column) => column.id === id)) continue;
        shown.delete(id);
        handlers.removed(id);
      }
      const added: { readonly id: number; readonly parts: ColumnParts }[] = [];
      const wanted = columns.list.flatMap((column, index) => {
        let entry = shown.get(column.id);
        if (entry === undefined) {
          entry = columnElement(column.id, container, handlers);
          shown.set(column.id, entry);
          added.push({ id: column.id, parts: entry.parts });
        }
        entry.parts.element.style.flexGrow = String(column.width);
        entry.parts.element.classList.toggle("active", column.id === columns.active);
        entry.split.hidden = columns.list.length >= MAX_COLUMNS;
        renderTabs(entry.tabs, column, {
          activate: handlers.activateTab,
          close: handlers.closeTab,
        });
        if (index === 0) return [entry.parts.element];
        entry.divider.dataset.index = String(index - 1);
        return [entry.divider, entry.parts.element];
      });
      // Remettre les mêmes éléments à leur place ferait perdre à l'éditeur son curseur et son défilement.
      const same =
        wanted.length === container.children.length &&
        wanted.every((element, index) => container.children[index] === element);
      if (!same) container.replaceChildren(...wanted);
      // Une fois à l'écran : l'éditeur qui s'y pose peut mesurer sa place.
      for (const { id, parts } of added) handlers.created(id, parts);
    },
  };
}
