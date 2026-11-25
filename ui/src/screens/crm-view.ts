// Un CRM à l'écran (fiche 0060, spécification § 7) : la barre d'onglets, la rangée de filtres,
// puis le Kanban ou Ma semaine. Rust lit et écrit les fichiers ; l'écran affiche la vue complète
// que `read_crm` rend et, à chaque geste, la relit. Les onglets Personnes, Entreprises et Projets
// sont les listes de `crm-lists.ts` (fiche 0063).
import type { CrmActionDraftItem, CrmItem, StageChangeItem } from "../bridge";
import type * as Bridge from "../bridge";
import { lookupsOf } from "../state/crm-card";
import { weekAround } from "../state/crm-days";
import type { Move } from "../state/crm-drop";
import { type CrmTab, isFiltered, NO_FILTERS, storedTab, TABS, toggled } from "../state/crm";
import {
  type ActionWindow,
  createActionWindow,
  type Start,
  type WindowEnvironment,
} from "./crm-action-window";
import { type BoardActions, type BoardContext, kanbanBoard } from "./crm-board";
import { datum, h } from "./crm-dom";
import { createFiltersBar, type FiltersBar } from "./crm-filters";
import { createLists, isListTab, type Lists, type UnfoldedMemory } from "./crm-lists";
import type { FicheBackend } from "./crm-fiche-ui";
import type { ListsBackend } from "./crm-lists-ui";
import type { QuickAdd } from "./crm-quick-add";
import type { StageEdit } from "./crm-stages";
import { weekView } from "./crm-week";
import "./crm.css";

/** Ce que le CRM d'une colonne demande à Rust, par le pont. */
export type CrmBackend = Pick<
  typeof Bridge,
  | "readCrm"
  | "createCrmAction"
  | "moveCrmAction"
  | "changeCrmAction"
  | "deleteCrmAction"
  | "changeCrmStages"
  | "copyPlainText"
  | "openWebAddress"
> &
  ListsBackend &
  FicheBackend;

export interface CrmViewDeps {
  readonly backend: CrmBackend;
  /** Le chemin de la note CRM. */
  readonly path: string;
  /** Pose une question avant un geste qui en change d'autres ; rend vrai si l'utilisateur accepte. */
  readonly confirm: (question: string, confirm: string) => Promise<boolean>;
  readonly error: (error: unknown) => void;
  /** L'onglet choisi, gardé sur ce Mac pour ce CRM. */
  readonly tab: { load(): string | null; store(tab: CrmTab): void };
  /** La fenêtre d'une action : fait choisir une note par la recherche de notes (son titre, `null` si on annule). */
  readonly chooseNote: () => Promise<string | null>;
  /** La fenêtre d'une action : ouvre la note de ce titre dans la colonne active. */
  readonly openNote: (title: string) => void;
  /** La fenêtre d'une action : dit quelque chose à l'utilisateur (« E-mails copiés. »). */
  readonly notice: (message: string) => void;
  /** La fenêtre d'une action : ouvre la fiche d'une personne ; sans elle, pas de lien vers la fiche. */
  readonly openPerson?: (reference: string) => void;
  /** Ouvre la note d'une entreprise ou d'une personne dans la colonne (fiche 0063) ; sans lui, un clic sur un nom ne fait rien. */
  readonly openFiche?: (path: string) => void;
  /** Ce qui est déplié dans les listes, gardé sur ce Mac ; sans lui, gardé le temps de l'écran. */
  readonly unfolded?: UnfoldedMemory;
}

export interface CrmView {
  readonly element: HTMLElement;
  /** Relit le CRM sur le disque et le redessine (après un geste, ou un changement venu d'ailleurs). */
  reload(): Promise<void>;
  /** L'onglet montré. */
  tab(): CrmTab;
  destroy(): void;
}

/** Ce qui est écrit au centre d'un CRM sans aucune fiche. */
export const EMPTY_TEXT = "Ajoutez une première action.";
const isEmpty = (crm: CrmItem) =>
  crm.actions.length + crm.people.length + crm.companies.length + crm.projects.length === 0;

class CrmScreen implements CrmView {
  readonly element = h("div", "crm");
  private readonly tabsBar = h("nav", "crm-tabs");
  private readonly filtersBar: FiltersBar;
  private readonly body = h("div", "crm-body");
  private data: CrmItem | null = null;
  private current: CrmTab;
  private filters = NO_FILTERS;
  private weekMonday: string | null = null;
  private readonly closedMore = new Map<string, number>();
  private quick: QuickAdd | null = null;
  private win: ActionWindow | null = null;
  private readonly lists: Lists;
  private lastPerson = "";
  private stageEdit: StageEdit | null = null;
  private focusKey: string | null = null;
  private generation = 0;
  private redrawing = false;

  constructor(private readonly deps: CrmViewDeps) {
    this.current = storedTab(deps.tab.load());
    this.filtersBar = createFiltersBar({
      search: (search) => this.filtered({ ...this.filters, search }),
      person: (person) => this.filtered({ ...this.filters, person }),
      company: (company) => this.filtered({ ...this.filters, company }),
      project: (project) =>
        this.filtered({ ...this.filters, projects: this.projectsAfter(project) }),
      tag: (tag) => this.filtered({ ...this.filters, tags: toggled(this.filters.tags, tag) }),
    });
    this.lists = this.createLists();
    this.tabsBar.setAttribute("role", "tablist");
    this.tabsBar.setAttribute("aria-label", "Onglets du CRM");
    for (const { id, label } of TABS) this.tabsBar.append(this.tabButton(id, label));
    this.element.append(this.tabsBar, this.filtersBar.element, this.body);
  }

  tab(): CrmTab {
    return this.current;
  }

  destroy(): void {
    this.generation += 1;
    this.win?.close();
    this.element.remove();
  }

  async reload(): Promise<void> {
    const generation = (this.generation += 1);
    try {
      const data = await this.deps.backend.readCrm(this.deps.path, this.filters, this.weekMonday);
      // Un autre dessin, ou la fermeture, est passé pendant la lecture.
      if (generation !== this.generation) return;
      this.data = data;
      this.render();
    } catch (error) {
      if (generation === this.generation) this.deps.error(error);
    }
  }

  private tabButton(id: CrmTab, label: string): HTMLButtonElement {
    const button = h("button", "crm-tab", label);
    button.type = "button";
    button.setAttribute("role", "tab");
    button.dataset.tab = id;
    button.addEventListener("click", () => this.select(id));
    return button;
  }

  private select(id: CrmTab): void {
    this.current = id;
    this.deps.tab.store(id);
    this.render();
  }

  private createLists(): Lists {
    const { deps } = this;
    const memory = { load: () => null, store: () => undefined };
    return createLists({
      path: deps.path,
      backend: deps.backend,
      memory: deps.unfolded ?? memory,
      act: {
        redraw: () => this.render(),
        focus: (key) => void (this.focusKey = key),
        gesture: (run) => this.gesture(run),
        confirm: deps.confirm,
        openFiche: (path) => deps.openFiche?.(path),
        openAction: (name) => this.showWindow({ kind: "existing", name }),
        showProject: (project) => this.showProject(project),
        redrawing: () => this.redrawing,
      },
    });
  }

  /** « Voir les actions de … » : le Kanban, filtré sur ce seul projet. */
  private showProject(project: string): void {
    this.filters = { ...NO_FILTERS, projects: [project] };
    this.current = "kanban";
    this.deps.tab.store("kanban");
    void this.reload();
  }

  private projectsAfter(project: string | null): string[] {
    return project === null ? [] : toggled(this.filters.projects, project);
  }

  private filtered(filters: typeof NO_FILTERS): void {
    this.filters = filters;
    void this.reload();
  }

  private render(): void {
    const data = this.data;
    if (data === null) return;
    const keep = this.keptFocus();
    const scrolls = this.scrolls();
    this.redrawing = true;
    for (const button of this.tabsBar.querySelectorAll<HTMLElement>(".crm-tab"))
      button.setAttribute("aria-selected", String(button.dataset.tab === this.current));
    const board = this.current === "kanban" || this.current === "week";
    this.filtersBar.element.hidden = !board;
    this.filtersBar.update(data, this.filters);
    this.body.replaceChildren(...this.content(data));
    this.restoreScrolls(scrolls);
    this.restoreFocus(keep);
    this.redrawing = false;
    this.win?.update(data);
  }

  private content(data: CrmItem): HTMLElement[] {
    if (isListTab(this.current)) return [this.lists.render(this.current, data)];
    const ctx = this.context(data);
    const shown =
      this.current === "kanban" ? kanbanBoard(ctx) : weekView(ctx, this.weekNavigation(data));
    return isEmpty(data) ? [shown, h("p", "crm-empty", EMPTY_TEXT)] : [shown];
  }

  private context(data: CrmItem): BoardContext {
    return {
      crm: data,
      lookups: lookupsOf(data),
      filtered: isFiltered(this.filters),
      ui: { quick: this.quick, stageEdit: this.stageEdit, closedMore: this.closedMore },
      act: this.actions,
      redrawing: () => this.redrawing,
    };
  }

  private weekNavigation(data: CrmItem) {
    const to = (monday: string | null) => {
      this.weekMonday = monday;
      void this.reload();
    };
    return {
      previous: () => to(weekAround(data.week.monday, -1)),
      next: () => to(weekAround(data.week.monday, 1)),
      today: () => to(null),
    };
  }

  /** Un geste : l'écran relit toujours le CRM ensuite, réussi ou refusé, pour montrer ce qu'il en est. */
  private async gesture(run: () => Promise<unknown>): Promise<boolean> {
    let done = true;
    try {
      await run();
    } catch (error) {
      done = false;
      this.deps.error(error);
    }
    await this.reload();
    return done;
  }

  /** Ouvre la fenêtre d'une action, la précédente fermée d'abord. */
  private showWindow(start: Start): void {
    const data = this.data;
    if (data === null) return;
    this.win?.close();
    this.win = createActionWindow(data, start, this.windowEnvironment());
  }

  private windowEnvironment(): WindowEnvironment {
    const { backend, path, error } = this.deps;
    const { confirm, chooseNote, openNote, notice, openPerson } = this.deps;
    return {
      ...{ confirm, chooseNote, openNote, notice, error },
      change: (action, change) => this.gesture(() => backend.changeCrmAction(path, action, change)),
      create: (draft) => this.gesture(() => backend.createCrmAction(path, draft)),
      remove: (action) => this.gesture(() => backend.deleteCrmAction(path, action)),
      openAddress: (url) => void backend.openWebAddress(url).catch(error),
      copy: async (text) => void (await backend.copyPlainText(text)),
      ...(openPerson === undefined ? {} : { openPerson }),
      closed: () => void (this.win = null),
    };
  }

  private readonly actions: BoardActions = {
    openAction: (name) => this.showWindow({ kind: "existing", name }),
    openQuick: (key) => this.openQuick(key),
    details: () => this.openDetails(),
    title: (title) => void (this.quick = this.quick && { ...this.quick, title }),
    person: (person) => {
      this.lastPerson = person;
      this.quick = this.quick && { ...this.quick, person };
    },
    submit: () => void this.submitQuick(),
    close: () => {
      this.quick = null;
      this.render();
    },
    beginRename: (stage) => this.beginStageEdit({ kind: "rename", stage, value: stage }),
    beginAdd: () => this.beginStageEdit({ kind: "add", value: "" }),
    typed: (value) => void (this.stageEdit = this.stageEdit && { ...this.stageEdit, value }),
    commit: () => void this.commitStage(),
    cancel: () => {
      this.stageEdit = null;
      this.render();
    },
    remove: (stage) => void this.removeStage(stage),
    showMore: (status) => {
      this.closedMore.set(status, (this.closedMore.get(status) ?? 0) + 1);
      this.render();
    },
    dropCard: (card, move) => void this.dropCard(card, move),
    dropOnDay: (card, date) =>
      void this.gesture(() =>
        this.deps.backend.changeCrmAction(this.deps.path, card, { kind: "date", date }),
      ),
    moveStage: (name, to) => void this.changeStages({ kind: "move", name, to }),
  };

  private dropCard(card: string, move: Move): Promise<boolean> {
    return this.gesture(() =>
      this.deps.backend.moveCrmAction(this.deps.path, card, move.status, move.placement),
    );
  }

  /** « + Ajouter une action » : un jour de Ma semaine, ou un CRM sans personne, ouvre la fenêtre ; une colonne ouvre la ligne d'ajout rapide. */
  private openQuick(key: string): void {
    const [kind, ...rest] = key.split(":");
    const where = rest.join(":");
    if (kind === "day") return this.showWindow({ kind: "new", prefill: { date: where } });
    if ((this.data as CrmItem).people.length === 0)
      return this.showWindow({ kind: "new", prefill: { status: where } });
    const known = (this.data as CrmItem).people.some((person) => person.name === this.lastPerson);
    this.quick = { key, title: "", person: known ? this.lastPerson : "" };
    this.focusKey = "quick";
    this.render();
  }

  /** « Plus de détails » : la fenêtre de l'action, avec le titre et la personne déjà remplis ; la ligne se ferme. */
  private openDetails(): void {
    const quick = this.quick;
    if (quick === null) return;
    this.quick = null;
    this.render();
    const status = quick.key.slice(quick.key.indexOf(":") + 1);
    this.showWindow({ kind: "new", prefill: { title: quick.title, status, person: quick.person } });
  }

  /** « Entrée » : crée l'action (aujourd'hui, le statut de la colonne, le projet filtré s'il n'y en a qu'un) ; la ligne reste ouverte pour la suivante. */
  private async submitQuick(): Promise<void> {
    const quick = this.quick;
    if (quick === null || quick.title.trim() === "") return;
    this.quick = { ...quick, title: "" };
    const input = this.body.querySelector<HTMLInputElement>('[data-keep="quick"]');
    if (input !== null) input.value = "";
    const created = await this.gesture(() =>
      this.deps.backend.createCrmAction(this.deps.path, this.draft(quick)),
    );
    // Rien n'est créé : le titre tapé revient, s'il n'a pas été remplacé entre-temps.
    if (!created && this.quick?.title === "") this.quick = { ...this.quick, title: quick.title };
    this.render();
  }

  private draft(quick: QuickAdd): CrmActionDraftItem {
    const status = quick.key.slice(quick.key.indexOf(":") + 1);
    const projects = this.filters.projects;
    return {
      ...{ title: quick.title.trim(), status, date: null },
      people: quick.person === "" ? [] : [quick.person],
      ...{ channel: null, color: null, tags: [], linkedNotes: [], description: "" },
      project: projects.length === 1 ? (projects[0] as string) : null,
    };
  }

  private beginStageEdit(edit: StageEdit): void {
    this.stageEdit = edit;
    this.focusKey = "stage";
    this.render();
  }

  private async commitStage(): Promise<void> {
    const edit = this.stageEdit as StageEdit;
    const name = edit.value.trim();
    if (edit.kind === "rename" && name === edit.stage) {
      this.stageEdit = null;
      return this.render();
    }
    const change: StageChangeItem =
      edit.kind === "add" ? { kind: "add", name } : { kind: "rename", from: edit.stage, to: name };
    if (await this.changeStages(change)) this.stageEdit = null;
    this.render();
  }

  private async removeStage(stage: string): Promise<void> {
    const count = (this.data as CrmItem).columns.find((column) => column.status === stage)
      ?.count as number;
    if (count > 0) {
      const actions = `${String(count)} action${count > 1 ? "s" : ""}`;
      const question = `Retirer l'étape « ${stage} » ? Ses ${actions} repartent en « TODO ».`;
      if (!(await this.deps.confirm(question, "Retirer"))) return;
    }
    await this.changeStages({ kind: "remove", name: stage });
  }

  private changeStages(change: StageChangeItem): Promise<boolean> {
    return this.gesture(() => this.deps.backend.changeCrmStages(this.deps.path, change));
  }

  /** Le champ qui a le curseur, à retrouver après le dessin : une saisie en cours n'est pas perdue. */
  private keptFocus(): { key: string; start: number | null; end: number | null } | null {
    const active = document.activeElement;
    const key = active instanceof HTMLInputElement ? active.dataset.keep : undefined;
    if (key === undefined || !this.body.contains(active)) return null;
    const { selectionStart: start, selectionEnd: end } = active as HTMLInputElement;
    return { key, start, end };
  }

  private restoreFocus(keep: ReturnType<CrmScreen["keptFocus"]>): void {
    const key = this.focusKey ?? keep?.key;
    this.focusKey = null;
    const input =
      key === undefined ? null : this.body.querySelector<HTMLInputElement>(`[data-keep="${key}"]`);
    if (input === null) return;
    input.focus();
    if (keep !== null && keep.start !== null && keep.end !== null)
      input.setSelectionRange(keep.start, keep.end);
    else input.select();
  }

  /** Le défilement du tableau et de chaque colonne, à rendre après le dessin. */
  private scrolls(): { left: number; columns: Map<string, number> } {
    const columns = new Map<string, number>();
    for (const column of this.body.querySelectorAll<HTMLElement>(".crm-column")) {
      const cards = column.querySelector(".crm-cards") as HTMLElement;
      columns.set(datum(column, "key"), cards.scrollTop);
    }
    return { left: this.body.querySelector(".crm-board")?.scrollLeft ?? 0, columns };
  }

  private restoreScrolls(scrolls: ReturnType<CrmScreen["scrolls"]>): void {
    const board = this.body.querySelector(".crm-board");
    if (board !== null) board.scrollLeft = scrolls.left;
    for (const column of this.body.querySelectorAll<HTMLElement>(".crm-column")) {
      const cards = column.querySelector(".crm-cards") as HTMLElement;
      cards.scrollTop = scrolls.columns.get(datum(column, "key")) ?? 0;
    }
  }
}

export function createCrmView(deps: CrmViewDeps): CrmView {
  return new CrmScreen(deps);
}
