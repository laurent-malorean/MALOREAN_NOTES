// Canvas (fiche 0052, spécifications canvas.md et canvas-comportement.md) : le tableau blanc infini d'une
// colonne. Rust lit et écrit le fichier (format d'Obsidian) ; l'écran tient le canvas, ses changements
// (fonctions pures de `state/canvas-*.ts`), la vue, la sélection et l'enregistrement sans conflit.
import type { CanvasFileItem, CanvasItem } from "../bridge";
import {
  type CanvasHistory,
  EMPTY_HISTORY,
  changed,
  redone,
  undone,
} from "../state/canvas-history";
import {
  type Selectable,
  arrow,
  boundsOf,
  card,
  colored,
  newTextCard,
  rectOf,
  senseOf,
  withoutArrows,
  withoutCards,
} from "../state/canvas-model";
import { GRID } from "../state/canvas-snap";
import {
  DETAIL_SCALE,
  type Rect,
  type Viewport,
  ZOOM_STEP,
  centredOn,
  fitted,
  initial,
  wheeled,
  zoomed,
} from "../state/canvas-viewport";
import { Actions } from "./canvas-actions";
import { curveOf, drawArrows } from "./canvas-arrows";
import { type CardPainter, type CardPainterOptions, createCardPainter } from "./canvas-cards";
import { createBar, createControls } from "./canvas-controls";
import { type EditHost, editArrowLabel, editGroupLabel, editText } from "./canvas-edit";
import { attachGestures } from "./canvas-gestures";
import { HELP_LINES, alignMenu, senseMenu, settingsMenu } from "./canvas-menus";
import { createSelectionBar } from "./canvas-selection-bar";
import { type MenuEntry, closeContextMenu, showContextMenu } from "./context-menu";
import "./canvas.css";

const SVG = "http://www.w3.org/2000/svg";
/** La taille de la vue quand l'écran ne la donne pas encore (colonne cachée). */
const FALLBACK_VIEW = { w: 800, h: 600 };
/** L'espace entre la barre de la sélection et ce qu'elle désigne, en pixels. */
const BAR_GAP = 10;

/** Les trois cases de l'engrenage (fiche 0052) : gardées dans l'interface, jamais dans le fichier. */
export interface CanvasSettings {
  readonly grid: boolean;
  readonly objects: boolean;
  readonly readOnly: boolean;
}

export const DEFAULT_SETTINGS: CanvasSettings = { grid: true, objects: true, readOnly: false };

export interface CanvasViewOptions {
  /** Enregistre le canvas fait à partir du texte `base` ; rend le canvas du fichier et son texte. */
  readonly save: (canvas: CanvasItem, base: string) => Promise<CanvasFileItem>;
  readonly painter: CardPainterOptions;
  readonly openExternal: (url: string) => void;
  /** Fait choisir une note (chemin depuis la racine) ; `null` si on annule. */
  readonly chooseNote: () => Promise<string | null>;
  /** Fait choisir un média ; `null` si on annule. */
  readonly chooseMedia: () => Promise<string | null>;
  /** Demande un texte ; `null` si on annule. */
  readonly askText: (question: string, initial: string, confirm: string) => Promise<string | null>;
  readonly copy: (text: string) => void;
  readonly notice: (message: string) => void;
  readonly error: (error: unknown) => void;
  readonly settings: {
    load(): CanvasSettings;
    store(settings: CanvasSettings): void;
  };
}

export interface CanvasView {
  readonly element: HTMLElement;
  /** Montre ce que Rust a lu ; un changement du fichier venu d'ailleurs est repris s'il n'y a rien à enregistrer. */
  setFile(file: CanvasFileItem): void;
  show(): void;
  /** Les groupes du canvas, pour « Aller à un groupe ». */
  groups(): { id: string; title: string }[];
  goToGroup(id: string): void;
  /** Tout voir. */
  fitAll(): void;
  /** Le canvas montré (pour l'image). */
  canvas(): CanvasItem;
  /** La vue. */
  viewport(): Viewport;
  destroy(): void;
}

const same = (a: CanvasItem, b: CanvasItem) => JSON.stringify(a) === JSON.stringify(b);

/** Une carte ou une flèche choisie existe encore dans ce canvas. */
const exists = (canvas: CanvasItem, s: Selectable) =>
  (s.kind === "card" ? card(canvas, s.id) : arrow(canvas, s.id)) !== undefined;

class View implements CanvasView {
  readonly element = document.createElement("div");
  private readonly surface = document.createElement("div");
  private readonly world = document.createElement("div");
  private readonly groupLayer = document.createElement("div");
  private readonly lines = document.createElementNS(SVG, "svg");
  private readonly cardLayer = document.createElement("div");
  private readonly labels = document.createElement("div");
  private readonly overlay = document.createElementNS(SVG, "svg");
  private readonly elements = new Map<string, HTMLElement>();
  private readonly painter: CardPainter;
  private readonly controls;
  private readonly actions: Actions;
  private bar: HTMLElement | null = null;
  private data: CanvasItem = { cards: [], arrows: [], extra: [] };
  private base = "";
  private loaded = false;
  private view: Viewport = initial(FALLBACK_VIEW);
  private selected: readonly Selectable[] = [];
  private history: CanvasHistory = EMPTY_HISTORY;
  private settings: CanvasSettings;
  private editing: Selectable | null = null;
  private space = false;
  private dirty = false;
  private saving = false;

  constructor(private readonly options: CanvasViewOptions) {
    this.settings = options.settings.load();
    this.painter = createCardPainter(options.painter);
    this.build();
    this.actions = new Actions({
      data: () => this.data,
      change: (next) => this.change(next),
      selection: () => this.selected,
      select: (s) => this.select(s),
      surface: this.surface,
      view: () => this.view,
      setView: (v) => this.setView(v),
      size: () => this.size(),
      switches: () => this.settings,
      setSwitch: (name) => this.toggle(name),
      edit: (item) => this.edit(item),
      removeSelection: () => this.removeSelection(),
      zoomToSelection: () => this.zoomToSelection(),
      ...{ chooseNote: options.chooseNote, chooseMedia: options.chooseMedia },
      ...{ askText: options.askText, copy: options.copy },
      ...{ openExternal: options.openExternal, error: options.error },
    });
    this.controls = createControls({
      settings: (at) =>
        this.menuAtButton(at, () => settingsMenu(this.actions.menuActions(), this.settings)),
      zoomIn: () => this.zoomBy(ZOOM_STEP),
      resetZoom: () => this.setView(initial(this.size())),
      fit: () => this.fitAll(),
      zoomOut: () => this.zoomBy(1 / ZOOM_STEP),
      undo: () => this.undo(),
      redo: () => this.redo(),
      help: (at) =>
        this.menuAtButton(at, () =>
          HELP_LINES.map((label) => ({ label, disabled: true, run: () => undefined })),
        ),
    });
    this.element.append(
      this.controls.element,
      createBar({
        addText: (at) => this.actions.addCard((p) => newTextCard(p.x, p.y), at, true),
        addNote: (at) => void this.actions.addFile(at, options.chooseNote),
        addMedia: (at) => void this.actions.addFile(at, options.chooseMedia),
      }),
    );
    this.listen();
    this.attachGestures();
    this.render();
  }

  private build(): void {
    this.element.className = "canvas-view";
    this.element.tabIndex = 0;
    this.surface.className = "canvas-surface";
    this.world.className = "canvas-world";
    this.groupLayer.className = "canvas-groups";
    this.lines.setAttribute("class", "canvas-arrows");
    this.cardLayer.className = "canvas-cards";
    this.labels.className = "canvas-labels";
    this.overlay.setAttribute("class", "canvas-arrows canvas-draft");
    this.world.append(this.groupLayer, this.lines, this.cardLayer, this.labels, this.overlay);
    this.surface.append(this.world);
    this.element.append(this.surface);
  }

  private attachGestures(): void {
    attachGestures({
      surface: this.surface,
      overlay: this.overlay,
      canvas: () => this.data,
      view: () => this.view,
      setView: (v) => this.setView(v),
      selection: () => this.selected,
      select: (s) => this.select(s),
      snap: () => this.settings,
      readOnly: () => this.settings.readOnly,
      preview: (next) => this.preview(next),
      commit: (next, before) => this.commit(next, before),
      edit: (item) => this.edit(item),
      spaceDown: () => this.space,
    });
  }

  // --- Montrer -----------------------------------------------------------------------------

  show(): void {
    this.element.hidden = false;
  }

  canvas(): CanvasItem {
    return this.data;
  }

  viewport(): Viewport {
    return this.view;
  }

  private size(): { w: number; h: number } {
    const { clientWidth: w, clientHeight: h } = this.surface;
    return w > 0 && h > 0 ? { w, h } : FALLBACK_VIEW;
  }

  setFile(file: CanvasFileItem): void {
    if (this.dirty || this.saving) return;
    this.base = file.text;
    this.data = file.canvas;
    this.selected = this.selected.filter((s) => exists(file.canvas, s));
    if (!this.loaded) {
      this.loaded = true;
      this.view = fitted(boundsOf(file.canvas.cards.map(rectOf)), this.size());
    }
    this.render();
  }

  private setView(view: Viewport): void {
    this.view = view;
    this.applyView();
    this.placeBar();
  }

  private applyView(): void {
    const { x, y, scale } = this.view;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    this.world.classList.toggle("canvas-far", scale < DETAIL_SCALE);
    this.surface.style.setProperty("--grid-size", `${GRID * scale}px`);
    this.surface.style.setProperty("--grid-x", `${x}px`);
    this.surface.style.setProperty("--grid-y", `${y}px`);
  }

  private zoomBy(factor: number): void {
    const { w, h } = this.size();
    this.setView(zoomed(this.view, factor, { x: w / 2, y: h / 2 }));
  }

  fitAll(): void {
    this.setView(fitted(boundsOf(this.data.cards.map(rectOf)), this.size()));
  }

  /** Les cartes et flèches choisies, vues de près (Maj + 2) ; tout voir sans sélection. */
  private zoomToSelection(): void {
    const box = this.selectionBox();
    if (box === null) this.fitAll();
    else this.setView(fitted(box, this.size()));
  }

  groups(): { id: string; title: string }[] {
    return this.data.cards
      .filter((c) => c.kind === "group")
      .map((c) => ({ id: c.id, title: c.label ?? "" }));
  }

  goToGroup(id: string): void {
    const group = card(this.data, id);
    if (group === undefined) return;
    this.select([{ kind: "card", id }]);
    this.setView(centredOn(this.view, rectOf(group), this.size()));
  }

  // --- Changer -----------------------------------------------------------------------------

  /** Montre `next` sans le garder : un glissement en cours. */
  private preview(next: CanvasItem): void {
    this.data = next;
    this.render();
  }

  /** Garde `next` comme un changement : annulable, enregistré. `before` est ce qu'on voyait avant. */
  private commit(next: CanvasItem, before: CanvasItem): void {
    if (this.settings.readOnly || same(next, before)) {
      this.data = this.settings.readOnly ? before : next;
      this.render();
      return;
    }
    this.history = changed(this.history, before);
    this.data = next;
    this.render();
    this.save();
  }

  private change(next: CanvasItem): void {
    this.commit(next, this.data);
  }

  private save(): void {
    this.dirty = true;
    if (!this.saving) void this.flush();
  }

  private async flush(): Promise<void> {
    this.saving = true;
    try {
      while (this.dirty) {
        this.dirty = false;
        const sent = this.data;
        const saved = await this.options.save(sent, this.base);
        this.base = saved.text;
        // Le fichier avait changé ailleurs : ce que Rust a fusionné remplace l'écran, sauf si on a encore changé depuis.
        if (!this.dirty && !same(saved.canvas, sent)) {
          this.data = saved.canvas;
          this.render();
        }
      }
    } catch (error) {
      this.options.error(error);
    } finally {
      this.saving = false;
    }
  }

  private undo(): void {
    const back = undone(this.history, this.data);
    if (back !== null) this.apply(back.canvas, back.history);
  }

  private redo(): void {
    const forward = redone(this.history, this.data);
    if (forward !== null) this.apply(forward.canvas, forward.history);
  }

  private apply(canvas: CanvasItem, history: CanvasHistory): void {
    this.history = history;
    this.data = canvas;
    this.selected = this.selected.filter((s) => exists(canvas, s));
    this.render();
    this.save();
  }

  private toggle(name: keyof CanvasSettings): void {
    this.settings = { ...this.settings, [name]: !this.settings[name] };
    this.options.settings.store(this.settings);
  }

  // --- Sélection ---------------------------------------------------------------------------

  private select(selection: readonly Selectable[]): void {
    this.selected = selection;
    this.render();
  }

  private ids(kind: Selectable["kind"]): string[] {
    return this.selected.filter((s) => s.kind === kind).map((s) => s.id);
  }

  private selectionBox(): Rect | null {
    const rects = this.ids("card")
      .flatMap((id) => card(this.data, id) ?? [])
      .map(rectOf);
    for (const id of this.ids("arrow")) {
      const a = arrow(this.data, id);
      const c = a === undefined ? null : curveOf(this.data, a);
      if (c === null) continue;
      const x = Math.min(c.from.x, c.to.x);
      const y = Math.min(c.from.y, c.to.y);
      rects.push({ x, y, w: Math.abs(c.to.x - c.from.x), h: Math.abs(c.to.y - c.from.y) });
    }
    return boundsOf(rects);
  }

  private removeSelection(): void {
    if (this.settings.readOnly) return;
    const next = withoutArrows(withoutCards(this.data, this.ids("card")), this.ids("arrow"));
    this.selected = [];
    this.change(next);
  }

  // --- Dessiner ----------------------------------------------------------------------------

  private render(): void {
    const chosen = new Set(this.ids("card"));
    const seen = new Set<string>();
    for (const item of this.data.cards) {
      seen.add(item.id);
      const element = this.elements.get(item.id) ?? document.createElement("div");
      this.elements.set(item.id, element);
      this.painter.paint(element, item);
      element.classList.toggle("selected", chosen.has(item.id));
      element.classList.toggle("only-selected", chosen.has(item.id) && this.selected.length === 1);
    }
    for (const [id, element] of this.elements)
      if (!seen.has(id)) {
        element.remove();
        this.elements.delete(id);
      }
    this.order(this.groupLayer, (c) => c.kind === "group");
    this.order(this.cardLayer, (c) => c.kind !== "group");
    const editingArrow = this.editing?.kind === "arrow" ? this.editing.id : null;
    drawArrows(this.lines, this.labels, this.data, new Set(this.ids("arrow")), editingArrow);
    this.applyView();
    this.controls.history(this.history.past.length > 0, this.history.future.length > 0);
    this.drawBar();
  }

  /** Range les éléments du calque dans l'ordre des cartes (le premier est au fond), sans toucher à ce qui est déjà bien. */
  private order(layer: HTMLElement, wanted: (c: CanvasItem["cards"][number]) => boolean): void {
    const expected = this.data.cards.filter(wanted).flatMap((c) => this.elements.get(c.id) ?? []);
    const placed =
      expected.length === layer.children.length &&
      expected.every((el, at) => layer.children[at] === el);
    if (!placed) layer.append(...expected);
  }

  /** La couleur que toute la sélection partage, s'il y en a une. */
  private sharedColor(): string | null {
    const colors = new Set([
      ...this.ids("card").map((id) => card(this.data, id)?.palette ?? null),
      ...this.ids("arrow").map((id) => arrow(this.data, id)?.palette ?? null),
    ]);
    return colors.size === 1 ? ([...colors][0] ?? null) : null;
  }

  private drawBar(): void {
    this.bar?.remove();
    const ids = this.ids("card");
    const arrows = this.ids("arrow");
    const oneArrow =
      ids.length === 0 && arrows.length === 1 ? arrow(this.data, arrows[0] ?? "") : undefined;
    const sense = oneArrow === undefined ? undefined : senseOf(oneArrow);
    const context = {
      cards: ids.length,
      arrows: arrows.length,
      sense,
      color: this.sharedColor(),
      editable: this.selected.length === 1,
    };
    this.bar = this.editing
      ? null
      : createSelectionBar(context, {
          remove: () => this.removeSelection(),
          color: (name) => this.change(colored(this.data, this.selected, name)),
          zoom: () => this.zoomToSelection(),
          edit: () => this.actions.editSelection(),
          sense: (at) =>
            this.menuAtButton(at, () => senseMenu(this.actions.menuActions(), sense ?? null)),
          align: (at) =>
            this.menuAtButton(at, () => alignMenu(this.actions.menuActions(), ids.length)),
        });
    if (this.bar !== null) this.element.append(this.bar);
    this.placeBar();
  }

  /** La barre de la sélection au-dessus de ce qu'elle désigne. */
  private placeBar(): void {
    const box = this.selectionBox();
    if (this.bar === null || box === null) return;
    const { x, y, scale } = this.view;
    const top = y + box.y * scale - BAR_GAP;
    this.bar.style.left = `${x + (box.x + box.w / 2) * scale}px`;
    this.bar.style.top = `${Math.max(top, this.bar.offsetHeight + BAR_GAP)}px`;
  }

  // --- Modifier le contenu ------------------------------------------------------------------

  private edit(item: Selectable): void {
    if (this.settings.readOnly) return;
    const host: EditHost = {
      data: () => this.data,
      change: (next) => this.change(next),
      rerender: () => this.render(),
      element: (id) => this.elements.get(id),
      labels: this.labels,
      editing: (now) => {
        this.editing = now;
        if (now !== null) this.drawBar();
      },
    };
    const target = item.kind === "card" ? card(this.data, item.id) : undefined;
    const kind = item.kind === "arrow" ? "arrow" : (target?.kind ?? "none");
    const edits: Record<string, () => void> = {
      arrow: () => editArrowLabel(host, item.id),
      text: () => editText(host, item.id),
      group: () => editGroupLabel(host, item.id),
      file: () => this.options.painter.openNote(target?.file ?? "", false),
      link: () => void this.actions.changeAddress(item.id),
    };
    edits[kind]?.();
  }

  // --- Clavier et souris -------------------------------------------------------------------

  private menuAtButton(at: HTMLElement, entries: () => MenuEntry[]): void {
    const box = at.getBoundingClientRect();
    showContextMenu(box.left, box.bottom + 4, entries());
  }

  private listen(): void {
    this.surface.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const box = this.surface.getBoundingClientRect();
        const at = { x: event.clientX - box.left, y: event.clientY - box.top };
        this.setView(wheeled(this.view, event, at));
      },
      { passive: false },
    );
    this.surface.addEventListener("contextmenu", (event) => this.actions.contextMenu(event));
    this.surface.addEventListener("pointerdown", () => {
      closeContextMenu();
      this.element.focus({ preventScroll: true });
    });
    this.element.addEventListener("keydown", (event) => {
      if (this.editing === null && this.shortcut(event)) event.preventDefault();
    });
    this.element.addEventListener("keyup", (event) => {
      if (event.key === " ") this.setSpace(false);
    });
  }

  private setSpace(down: boolean): void {
    this.space = down;
    this.element.classList.toggle("space", down);
  }

  private selectAll(): void {
    this.select([
      ...this.data.cards.map((c): Selectable => ({ kind: "card", id: c.id })),
      ...this.data.arrows.map((a): Selectable => ({ kind: "arrow", id: a.id })),
    ]);
  }

  /** Les raccourcis avec Cmd (ou Ctrl) : tout sélectionner, annuler, rétablir. */
  private metaShortcut(key: string, shift: boolean): (() => void) | undefined {
    const table: Record<string, () => void> = {
      a: () => this.selectAll(),
      z: () => (shift ? this.redo() : this.undo()),
      y: () => this.redo(),
    };
    return table[key];
  }

  /** Les autres : Espace, Suppr, Échap, Maj + 1 et Maj + 2. */
  private plainShortcut(event: KeyboardEvent): (() => void) | undefined {
    const digit = event.shiftKey ? event.code : "";
    const table: Record<string, () => void> = {
      " ": () => this.setSpace(true),
      Delete: () => this.removeSelection(),
      Backspace: () => this.removeSelection(),
      Escape: () => this.select([]),
    };
    if (digit === "Digit1") return () => this.fitAll();
    if (digit === "Digit2") return () => this.zoomToSelection();
    return table[event.key];
  }

  /** Le raccourci tapé : ce qu'il fait ; faux s'il ne sert à rien ici. Seuls ceux de la spécification existent. */
  private shortcut(event: KeyboardEvent): boolean {
    const meta = event.metaKey || event.ctrlKey;
    const run = meta
      ? this.metaShortcut(event.key.toLowerCase(), event.shiftKey)
      : this.plainShortcut(event);
    run?.();
    return run !== undefined;
  }

  destroy(): void {
    closeContextMenu();
    this.element.remove();
  }
}

export function createCanvasView(options: CanvasViewOptions): CanvasView {
  return new View(options);
}
