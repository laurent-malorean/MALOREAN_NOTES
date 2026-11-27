// Les colonnes d'édition à l'écran : une section par colonne, un séparateur entre deux voisines.
import {
  type Column,
  type Columns,
  MAX_COLUMNS,
  type Placement,
  type TabDrop,
} from "../state/columns";
import { trailOf, type TrailStep } from "../state/trail";
import type { NoteRenaming } from "./note-menu";
import { renderTabs } from "./tabs-view";

/** Ce qu'une colonne offre à l'éditeur qui s'y pose : son élément, la place des étiquettes, des liens entrants et des notes proches. */
export interface ColumnParts {
  readonly element: HTMLElement;
  /** La barre des étiquettes du contenu montré, sous les onglets ; sans elle, aucune barre n'est montrée. */
  readonly tags?: HTMLElement;
  /** Le bouton de l'étoile, à droite de l'en-tête, avant « Diviser » : caché tant que la colonne ne lui donne pas d'état. */
  readonly star?: HTMLButtonElement;
  readonly backlinks: HTMLElement;
  readonly related: HTMLElement;
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
  /** Ouvrir la note d'un onglet à cet emplacement (menu de l'onglet). */
  placeTab(tabId: number, placement: Placement): void;
  /** Imprimer la note d'un onglet (menu de l'onglet). */
  printNote(path: string): void;
  /** Copier la note d'un onglet en texte mis en forme (menu de l'onglet). */
  copyNote(path: string): void;
  /** Copier le texte Markdown de la note d'un onglet (menu de l'onglet). */
  copyMarkdown(path: string): void;
  /** Ouvrir l'historique de la note d'un onglet (menu de l'onglet). */
  showHistory(path: string): void;
  /** Renommer la note d'un onglet par son menu ; sans lui, le menu n'a pas « Renommer… ». */
  readonly renaming?: NoteRenaming;
  /** Un onglet glissé est lâché là. */
  dropTab(tabId: number, drop: TabDrop): void;
  /** Diviser la colonne active. */
  split(): void;
  /** Le séparateur `divider` glisse de `delta`, en part de la zone d'édition. */
  resize(divider: number, delta: number): void;
  /** Revenir à la note précédente (`-1`) ou aller à la suivante (`1`) dans l'onglet actif de la colonne. */
  walk(columnId: number, step: TrailStep): void;
}

export interface ColumnsView {
  /** Met l'écran en accord avec l'état des colonnes. */
  render(columns: Columns): void;
}

/** Une colonne à l'écran : ses parties, ses onglets, son bouton « Diviser », le séparateur à sa gauche. */
interface ShownColumn {
  readonly parts: ColumnParts;
  /** Les flèches « ← » et « → » du parcours de l'onglet actif. */
  readonly trail: TrailButtons;
  readonly tabs: HTMLElement;
  readonly split: HTMLButtonElement;
  readonly divider: HTMLElement;
}

/** Ce qu'une colonne sait de l'onglet qu'on glisse. */
interface TabDragging {
  /** L'onglet en cours de glissement, s'il y en a un. */
  moving(): number | null;
  /** Le glissement est fini : lâché, ou abandonné. */
  stop(): void;
  /** Lâcher au bord d'une colonne en ouvre une : faux à trois colonnes. */
  edges(): boolean;
}

/** Les flèches du parcours : leur groupe, « ← » et « → ». */
interface TrailButtons {
  readonly group: HTMLElement;
  readonly back: HTMLButtonElement;
  readonly forward: HTMLButtonElement;
}

function trailButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "icon trail-step";
  button.textContent = text;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  return button;
}

/** Les flèches « ← » et « → » en tête de la colonne, devant ses onglets. */
function trailButtons(id: number, handlers: ColumnsHandlers): TrailButtons {
  const group = document.createElement("nav");
  group.className = "note-trail";
  group.setAttribute("aria-label", "Parcours de l'onglet");
  const back = trailButton("←", "Revenir à la note précédente", () => handlers.walk(id, -1));
  const forward = trailButton("→", "Aller à la note suivante", () => handlers.walk(id, 1));
  group.append(back, forward);
  return { group, back, forward };
}

/**
 * Les flèches n'apparaissent que si l'onglet actif a un parcours ; celle qui ne mène nulle part
 * est alors grisée.
 */
function showTrail(buttons: TrailButtons, column: Column) {
  const tab = column.tabs.find((t) => t.id === column.activeTab);
  const { back, forward } = tab === undefined ? { back: [], forward: [] } : trailOf(tab);
  buttons.group.hidden = back.length + forward.length === 0;
  buttons.back.disabled = back.length === 0;
  buttons.forward.disabled = forward.length === 0;
}

/** Part de la largeur d'une colonne, de chaque côté, où lâcher un onglet ouvre une colonne. */
const EDGE_ZONE = 0.25;

/** Où tomberait l'onglet lâché sous le pointeur, dans la colonne `id`. */
function dropAt(event: DragEvent, column: HTMLElement, id: number, edges: boolean): TabDrop {
  const target = event.target as Element;
  if (target.closest(".column-header")) {
    const before = target.closest<HTMLElement>(".tab")?.dataset.tab;
    return { column: id, before: before === undefined ? null : Number(before) };
  }
  const box = column.getBoundingClientRect();
  const at = (event.clientX - box.left) / box.width;
  if (edges && at < EDGE_ZONE) return { column: id, side: "left" };
  if (edges && at > 1 - EDGE_ZONE) return { column: id, side: "right" };
  return { column: id, before: null };
}

/** Montre où l'onglet tomberait : la colonne, son bord, ou la place avant un onglet ; rien sans dépôt. */
function showDrop(column: HTMLElement, drop: TabDrop | null): void {
  if (drop === null) delete column.dataset.drop;
  else column.dataset.drop = "side" in drop ? drop.side : "inside";
  const before = drop !== null && "before" in drop ? String(drop.before) : null;
  for (const tab of column.querySelectorAll<HTMLElement>(".tab")) {
    tab.classList.toggle("drop-before", tab.dataset.tab === before);
  }
}

/**
 * La colonne reçoit l'onglet qu'on glisse ; elle le prend avant l'éditeur, qui y verrait du texte
 * à insérer. Le reste (une note de la liste, un fichier) passe sans être accepté.
 */
function acceptTabs(
  column: HTMLElement,
  id: number,
  dragging: TabDragging,
  handlers: ColumnsHandlers,
) {
  const over = (event: DragEvent): TabDrop | null => {
    const tabId = dragging.moving();
    if (tabId === null) return null;
    event.preventDefault();
    event.stopPropagation();
    return dropAt(event, column, id, dragging.edges());
  };
  column.addEventListener("dragover", (event) => showDrop(column, over(event)), { capture: true });
  column.addEventListener("dragleave", () => showDrop(column, null));
  column.addEventListener(
    "drop",
    (event) => {
      const drop = over(event);
      if (drop === null) return;
      // Un dépôt n'existe que pendant le glissement d'un onglet.
      handlers.dropTab(dragging.moving() as number, drop);
      dragging.stop();
    },
    { capture: true },
  );
}

function columnElement(
  id: number,
  container: HTMLElement,
  handlers: ColumnsHandlers,
  dragging: TabDragging,
): ShownColumn {
  const element = document.createElement("section");
  element.className = "column";
  element.setAttribute("aria-label", "Colonne");
  acceptTabs(element, id, dragging, handlers);
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
  const trail = trailButtons(id, handlers);
  const star = document.createElement("button");
  star.className = "icon favorite-star";
  header.append(trail.group, tabs, star, split);
  const tags = document.createElement("div");
  tags.className = "tag-bar";
  tags.hidden = true;
  const backlinks = document.createElement("nav");
  backlinks.className = "backlinks";
  backlinks.setAttribute("aria-label", "Liens entrants");
  backlinks.hidden = true;
  const related = document.createElement("nav");
  related.className = "backlinks related-notes";
  related.setAttribute("aria-label", "Notes proches");
  related.hidden = true;
  element.append(header, tags, backlinks, related);
  return {
    parts: { element, tags, star, backlinks, related },
    trail,
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
  let moving: number | null = null;
  let count = 0;
  const dragging: TabDragging = {
    moving: () => moving,
    stop: () => {
      moving = null;
      for (const entry of shown.values()) showDrop(entry.parts.element, null);
    },
    edges: () => count < MAX_COLUMNS,
  };
  return {
    render(columns) {
      count = columns.list.length;
      for (const id of shown.keys()) {
        if (columns.list.some((column) => column.id === id)) continue;
        shown.delete(id);
        handlers.removed(id);
      }
      const added: { readonly id: number; readonly parts: ColumnParts }[] = [];
      const wanted = columns.list.flatMap((column, index) => {
        let entry = shown.get(column.id);
        if (entry === undefined) {
          entry = columnElement(column.id, container, handlers, dragging);
          shown.set(column.id, entry);
          added.push({ id: column.id, parts: entry.parts });
        }
        entry.parts.element.style.flexGrow = String(column.width);
        entry.parts.element.classList.toggle("active", column.id === columns.active);
        entry.split.hidden = columns.list.length >= MAX_COLUMNS;
        showTrail(entry.trail, column);
        renderTabs(entry.tabs, column, {
          activate: handlers.activateTab,
          close: handlers.closeTab,
          place: handlers.placeTab,
          print: handlers.printNote,
          copy: handlers.copyNote,
          copyMarkdown: handlers.copyMarkdown,
          history: handlers.showHistory,
          renaming: handlers.renaming,
          drag: (tabId) => (tabId === null ? dragging.stop() : (moving = tabId)),
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
