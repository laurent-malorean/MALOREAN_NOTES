// La grille d'un agenda 12 à l'écran (fiche 0104, spécification §§ 5, 6 et 8) : 12 cases, une par mois,
// leurs lignes dans l'ordre de Rust, ou la liste groupée par mois (§ 5.5), et le bandeau (titre, vue,
// colonnes, filtre par étiquette, archives). Rust
// lit et écrit les fichiers ; l'écran redessine ce qu'il rend. Couleurs et polices viennent du thème.
import type {
  Agenda12CellItem,
  Agenda12EventItem,
  Agenda12Item,
  Agenda12LayoutItem,
  SavedNote,
} from "../bridge";
import { closedDay, COLUMN_CHOICES, LAYOUT_CHOICES, monthName } from "../state/agenda-12";
import { lineParts } from "./agenda-12-line";
import { monthList } from "./agenda-12-list";
import { actionButton, h } from "./crm-dom";
import "./agenda-12.css";

/** Ce que la grille demande à Rust. */
export interface Agenda12Backend {
  readonly readAgenda12: (path: string, tag: string | null) => Promise<Agenda12Item>;
  readonly changeAgenda12Columns: (path: string, columns: number) => Promise<unknown>;
  readonly changeAgenda12Layout: (path: string, layout: Agenda12LayoutItem) => Promise<unknown>;
  readonly createAgenda12Event: (agenda: string, month: number) => Promise<SavedNote>;
  readonly reopenAgenda12Event: (path: string) => Promise<SavedNote>;
}

export interface Agenda12ViewDeps {
  readonly backend: Agenda12Backend;
  /** Le chemin de l'agenda 12. */
  readonly path: string;
  readonly error: (error: unknown) => void;
  /** Ouvre la note d'un événement, dans la colonne ; `created` : il vient d'être créé, le curseur va sur son titre. */
  readonly open: (path: string, created: boolean) => void;
}

export interface Agenda12View {
  readonly element: HTMLElement;
  /** Relit l'agenda 12 sur le disque et redessine. */
  reload(): Promise<void>;
  destroy(): void;
}

export const ALL_TAGS = "Toutes";
export const ARCHIVES_TEXT = "Archives";
export const GRID_TEXT = "Grille";
export const LIST_TEXT = "Liste";
export const NO_ARCHIVES_TEXT = "Aucun événement clos.";
export const REOPEN_TEXT = "Rouvrir";

/** Une ligne d'événement : un bouton qui ouvre sa note. */
function lineButton(event: Agenda12EventItem, open: (path: string) => void): HTMLButtonElement {
  const button = actionButton("agenda-line", "");
  button.title = event.line.text;
  button.dataset.path = event.path;
  button.append(...lineParts(event.line));
  button.addEventListener("click", () => open(event.path));
  return button;
}

class AgendaScreen implements Agenda12View {
  readonly element = h("div", "agenda");
  private readonly title = h("h2", "agenda-title-bar");
  private readonly body = h("div", "agenda-body");
  private readonly notice = h("div", "agenda-unreadable");
  private readonly filter = h("select", "agenda-filter");
  private readonly layout = h("div", "agenda-layout");
  private readonly columns = h("div", "agenda-columns");
  private readonly archivesButton = actionButton("agenda-archives-link", ARCHIVES_TEXT);
  private data: Agenda12Item | null = null;
  private tag: string | null = null;
  private archives = false;
  private generation = 0;

  constructor(private readonly deps: Agenda12ViewDeps) {
    this.element.dataset.path = deps.path;
    this.layout.setAttribute("role", "group");
    this.layout.setAttribute("aria-label", "Vue");
    this.layout.append(...LAYOUT_CHOICES.map((layout) => this.layoutButton(layout)));
    this.columns.setAttribute("role", "group");
    this.columns.setAttribute("aria-label", "Colonnes");
    this.columns.append(...COLUMN_CHOICES.map((count) => this.columnButton(count)));
    this.filter.setAttribute("aria-label", "Étiquette");
    this.filter.addEventListener("change", () => this.choose(this.filter.value));
    this.archivesButton.addEventListener("click", () => this.toggleArchives());
    const bar = h("header", "agenda-bar");
    const tools = h("div", "agenda-tools");
    tools.append(this.layout, this.columns, this.filter, this.archivesButton);
    bar.append(this.title, tools);
    this.element.append(bar, this.notice, this.body);
  }

  destroy(): void {
    this.generation += 1;
    this.element.remove();
  }

  async reload(): Promise<void> {
    const generation = (this.generation += 1);
    try {
      const data = await this.deps.backend.readAgenda12(this.deps.path, this.tag);
      if (generation !== this.generation) return;
      // L'étiquette qui n'est plus portée par aucun événement n'est plus un filtre.
      if (this.tag !== null && !data.tags.includes(this.tag)) {
        this.tag = null;
        return await this.reload();
      }
      this.data = data;
      this.render(data);
    } catch (error) {
      if (generation === this.generation) this.deps.error(error);
    }
  }

  /** Un geste : l'écran relit ensuite, réussi ou refusé, pour montrer ce qu'il en est. */
  private async gesture(run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.deps.error(error);
    }
    await this.reload();
  }

  private columnButton(count: number): HTMLButtonElement {
    const button = actionButton("agenda-columns-choice", String(count), `${count} colonnes`);
    button.dataset.columns = String(count);
    button.addEventListener("click", () =>
      this.gesture(() => this.deps.backend.changeAgenda12Columns(this.deps.path, count)),
    );
    return button;
  }

  private layoutButton(layout: Agenda12LayoutItem): HTMLButtonElement {
    const text = layout === "list" ? LIST_TEXT : GRID_TEXT;
    const button = actionButton("agenda-layout-choice", text, `Vue ${text.toLowerCase()}`);
    button.dataset.layout = layout;
    button.title = `Vue ${text.toLowerCase()}`;
    button.addEventListener("click", () =>
      this.gesture(() => this.deps.backend.changeAgenda12Layout(this.deps.path, layout)),
    );
    return button;
  }

  private choose(value: string): void {
    this.tag = value === "" ? null : value;
    void this.reload();
  }

  private toggleArchives(): void {
    this.archives = !this.archives;
    if (this.data !== null) this.render(this.data);
  }

  private render(data: Agenda12Item): void {
    this.title.textContent = data.title;
    this.element.dataset.mode = this.archives ? "archives" : data.layout;
    const back = data.layout === "list" ? LIST_TEXT : GRID_TEXT;
    this.archivesButton.textContent = this.archives ? back : ARCHIVES_TEXT;
    for (const button of this.layout.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.layout === data.layout));
    }
    for (const button of this.columns.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.columns === String(data.columns)));
    }
    this.renderFilter(data);
    this.renderUnreadable(data);
    this.body.replaceChildren(this.archives ? this.archiveList(data) : this.cells(data));
  }

  private renderFilter(data: Agenda12Item): void {
    const all = new Option(ALL_TAGS, "");
    this.filter.replaceChildren(all, ...data.tags.map((tag) => new Option(tag, tag)));
    this.filter.value = this.tag ?? "";
    this.filter.hidden = this.archives;
    this.layout.hidden = this.archives;
    this.columns.hidden = this.archives || data.layout === "list";
  }

  /** Les événements illisibles sont signalés, jamais modifiés : un clic ouvre leur note. */
  private renderUnreadable(data: Agenda12Item): void {
    this.notice.hidden = data.unreadable.length === 0;
    this.notice.replaceChildren(
      ...data.unreadable.map((path) => {
        const button = actionButton("agenda-unreadable-item", `Événement illisible : ${path}`);
        button.addEventListener("click", () => this.deps.open(path, false));
        return button;
      }),
    );
  }

  /** Les douze mois : en grille, ou en liste groupée par mois (§ 5.5). */
  private cells(data: Agenda12Item): HTMLElement {
    if (data.layout !== "list") return this.grid(data);
    const open = (event: Agenda12EventItem) =>
      this.item(lineButton(event, (path) => this.deps.open(path, false)));
    return monthList(data.cells, { item: open, add: (cell) => this.addButton(cell) });
  }

  private grid(data: Agenda12Item): HTMLElement {
    const grid = h("div", "agenda-grid");
    grid.style.setProperty("--agenda-columns", String(data.columns));
    grid.append(...data.cells.map((cell) => this.cell(cell)));
    return grid;
  }

  private cell(cell: Agenda12CellItem): HTMLElement {
    const section = h("section", "agenda-cell");
    section.dataset.month = String(cell.month);
    const name = monthName(cell.month);
    section.setAttribute("aria-label", name);
    const add = this.addButton(cell);
    const head = h("header", "agenda-cell-head");
    head.append(h("h3", "agenda-month", name));
    const list = h("ul", "agenda-events");
    list.append(
      ...cell.events.map((event) => this.item(lineButton(event, (p) => this.deps.open(p, false)))),
    );
    // Une case pleine a son « + » dans son en-tête ; une case vide, tout son corps en est un, discret.
    if (cell.events.length === 0) add.classList.add("agenda-add-empty");
    else head.append(add);
    section.append(head, list);
    if (cell.events.length === 0) section.append(add);
    return section;
  }

  /** Le « + » d'un mois : crée son événement. */
  private addButton(cell: Agenda12CellItem): HTMLButtonElement {
    const add = actionButton("agenda-add", "+", `Ajouter un événement en ${cell.name}`);
    add.title = `Ajouter un événement en ${cell.name}`;
    add.addEventListener("click", () => void this.create(cell.month));
    return add;
  }

  private item(...content: HTMLElement[]): HTMLElement {
    const item = h("li", "agenda-event");
    item.append(...content);
    return item;
  }

  private async create(month: number): Promise<void> {
    try {
      const created = await this.deps.backend.createAgenda12Event(this.deps.path, month);
      this.deps.open(created.path, true);
    } catch (error) {
      this.deps.error(error);
      await this.reload();
    }
  }

  private archiveList(data: Agenda12Item): HTMLElement {
    if (data.archives.length === 0) return h("p", "agenda-empty", NO_ARCHIVES_TEXT);
    const list = h("ul", "agenda-archives");
    list.append(...data.archives.map((event) => this.archived(event)));
    return list;
  }

  private archived(event: Agenda12EventItem): HTMLElement {
    const reopen = actionButton(
      "agenda-action agenda-reopen",
      REOPEN_TEXT,
      `Rouvrir « ${event.title} »`,
    );
    reopen.addEventListener("click", () =>
      this.gesture(() => this.deps.backend.reopenAgenda12Event(event.path)),
    );
    const closed = h("span", "agenda-closed");
    if (event.closedOn !== null) closed.textContent = `clos le ${closedDay(event.closedOn)}`;
    return this.item(
      lineButton(event, (path) => this.deps.open(path, false)),
      closed,
      reopen,
    );
  }
}

export function createAgenda12View(deps: Agenda12ViewDeps): Agenda12View {
  return new AgendaScreen(deps);
}
