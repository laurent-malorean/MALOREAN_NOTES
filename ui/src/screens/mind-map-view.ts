// Carte mentale à l'écran (fiche 0050) : les nœuds, les liens, la vue, la sélection, la saisie et
// le glisser-déposer. L'arbre et ses changements sont ceux de `state/mind-map.ts` ; l'écran
// enregistre l'arbre entier après chaque changement.
import type { MindMapItem } from "../bridge";
import {
  addChild,
  addRoot,
  addSibling,
  ancestorsOf,
  descendantsCount,
  moveBranch,
  newNode,
  type NodePath,
  nodeAt,
  parentOf,
  parseTyped,
  pathKey,
  removeAt,
  siblingOf,
  typedOf,
  updateNode,
} from "../state/mind-map";
import { imageFrame } from "../state/mind-map-image";
import { type Op, typedOp } from "../state/mind-map-ops";
import { changed, EMPTY_HISTORY, type MapHistory, redone, undone } from "../state/mind-map-history";
import { type Box, bounds, layoutMap } from "../state/mind-map-layout";
import {
  centredOn,
  fitted,
  type Point,
  panned,
  revealed,
  toMap,
  type Viewport,
  wheeled,
  ZOOM_STEP,
  zoomed,
} from "../state/mind-map-viewport";
import { mapImage } from "./mind-map-image";
import { showContextMenu } from "./context-menu";
import { nodeMenu } from "./mind-map-menu";
import { MapSaver } from "./mind-map-saver";
import { nodeKey, type KeyHost } from "./mind-map-keys";
import { createNodeRenderer } from "./mind-map-nodes";
import {
  button,
  confirmDeletion,
  drawLinks,
  followLink,
  nodeElement,
  pathOfTarget,
} from "./mind-map-paint";
import { dropTarget, startDrag, startPan } from "./mind-map-drag";
import "./mind-map.css";

export interface MindMapDeps {
  /** Enregistre la carte ; une erreur est montrée par `error`, et l'enregistrement suivant reprend tout. */
  readonly save: (map: MindMapItem) => Promise<void>;
  /** La carte telle que le fichier la dit maintenant. */
  readonly read: () => Promise<MindMapItem>;
  /** Un message d'information. */
  readonly notice: (message: string) => void;
  /** Suit un lien `[[titre]]`. */
  readonly openWikiLink: (title: string, inNewTab: boolean) => void;
  /** Suit un autre lien. */
  readonly openLink: (target: string) => void;
  readonly error: (error: unknown) => void;
  readonly resolveImage: (src: string) => string;
  /** Enregistre l'image PNG de la carte entière (fenêtre d'enregistrement du Mac). */
  readonly exportImage: (png: Uint8Array) => Promise<void>;
  /** Les branches pliées de cette carte, gardées sur ce Mac. */
  readonly folded: {
    load(): readonly string[];
    store(keys: readonly string[]): void;
  };
}

export interface MindMapView {
  readonly element: HTMLElement;
  /** La carte lue sur le disque : remplace celle montrée (après la saisie en cours). */
  setMap(map: MindMapItem): void;
  map(): MindMapItem;
  show(): void;
  hide(): void;
  /** Choisit un nœud, ses ancêtres dépliés, la vue centrée sur lui. */
  reveal(path: NodePath): void;
  selected(): NodePath | null;
  destroy(): void;
}

const EMPTY_MESSAGE = "Double-cliquez pour ajouter une idée.";
/** Sous un nœud racine ajouté par Entrée : l'écart sous le bas de sa branche. */
const ROOT_GAP = 40;
const SVG = "http://www.w3.org/2000/svg";

interface Editing {
  readonly path: NodePath;
  /** La carte avant l'ajout du nœud, ou avant sa modification. */
  readonly before: MindMapItem;
  readonly isNew: boolean;
  readonly area: HTMLTextAreaElement;
}

class MindMapScreen implements MindMapView {
  readonly element = document.createElement("div");
  private readonly world = document.createElement("div");
  private readonly links = document.createElementNS(SVG, "svg");
  private readonly probe = document.createElement("div");
  private readonly empty = document.createElement("p");
  private readonly renderer = createNodeRenderer((src) => this.deps.resolveImage(src));
  private current: MindMapItem = { roots: [], places: [] };
  private readonly saver: MapSaver;
  private history: MapHistory = EMPTY_HISTORY;
  private chosen: NodePath | null = null;
  private readonly folded: Set<string>;
  private viewport: Viewport = { x: 0, y: 0, scale: 1 };
  private boxes: readonly Box[] = [];
  private editing: Editing | null = null;
  private deferred: MindMapItem | null = null;
  private needsFit = true;
  private visible = false;
  private drawing = 0;

  constructor(private readonly deps: MindMapDeps) {
    this.folded = new Set(deps.folded.load());
    this.saver = new MapSaver(deps, {
      current: () => this.current,
      merged: (map) => {
        this.current = map;
        this.draw();
      },
      reloaded: (disk) => this.reload(disk),
      refreshed: (disk) => this.setMap(disk),
    });

    this.element.className = "mind-map";
    this.element.tabIndex = 0;
    this.element.hidden = true;
    this.world.className = "mind-map-world";
    this.links.setAttribute("class", "mind-map-links");
    this.probe.className = "mind-map-node mind-map-probe";
    this.empty.className = "mind-map-empty";
    this.empty.textContent = EMPTY_MESSAGE;
    this.world.append(this.links, this.probe);
    const controls = document.createElement("div");
    controls.className = "mind-map-controls";
    controls.append(
      button("Réduire", "−", () => this.zoomBy(1 / ZOOM_STEP)),
      button("Agrandir", "+", () => this.zoomBy(ZOOM_STEP)),
      button("Tout afficher", "Tout afficher", () => this.fit()),
      button("Exporter en image", "Image", () => this.exportImage()),
    );
    this.element.append(this.world, this.empty, controls);
    this.listen();
  }

  map(): MindMapItem {
    return this.current;
  }

  selected(): NodePath | null {
    return this.chosen;
  }

  show(): void {
    this.visible = true;
    this.element.hidden = false;
    this.draw();
  }

  hide(): void {
    this.visible = false;
    this.element.hidden = true;
  }

  destroy(): void {
    this.element.remove();
  }

  setMap(map: MindMapItem): void {
    if (this.editing !== null) {
      this.deferred = map;
      return;
    }
    // Ce qui va être enregistré est déjà montré ; l'enregistrement relit le fichier.
    if (this.saver.busy()) return;
    this.saver.reset(map);
    if (JSON.stringify(map) === JSON.stringify(this.current) && !this.needsFit) return;
    this.current = map;
    this.history = EMPTY_HISTORY;
    if (this.chosen !== null && nodeAt(map, this.chosen) === null) this.chosen = null;
    this.draw();
  }

  reveal(path: NodePath): void {
    for (const above of ancestorsOf(path)) this.folded.delete(pathKey(above));
    this.deps.folded.store([...this.folded]);
    this.chosen = path;
    this.draw(() => {
      const box = this.boxes.find((b) => pathKey(b.path) === pathKey(path));
      if (box) this.viewport = centredOn(this.viewport, this.rect(box), this.size());
      this.apply();
    });
  }

  // --- Dessin ---------------------------------------------------------------------------

  private size() {
    return { w: this.element.clientWidth, h: this.element.clientHeight };
  }

  private rect(box: Box) {
    return { x: box.x, y: box.y, w: box.width, h: box.height };
  }

  /** Met l'écran en accord avec la carte ; les textes pas encore mis en forme le sont d'abord. */
  private draw(after?: () => void): void {
    if (!this.visible) return;
    const token = ++this.drawing;
    const pending = this.renderer.missing(this.current.roots);
    const finish = () => {
      if (token !== this.drawing) return;
      this.paint();
      after?.();
    };
    if (pending.length === 0) finish();
    else void this.renderer.prepare(pending).then(finish).catch(this.deps.error);
  }

  private paint(): void {
    const layout = layoutMap(this.current, this.folded, this.renderer.measure(this.probe));
    this.boxes = layout.boxes;
    this.world.replaceChildren(this.links, this.probe);
    this.empty.hidden = this.current.roots.length > 0;
    drawLinks(this.links, layout);
    const byKey = new Map(layout.boxes.map((box) => [pathKey(box.path), box]));
    for (const box of layout.boxes) {
      const state = {
        selected: this.chosen !== null && pathKey(this.chosen) === pathKey(box.path),
        editing: this.editing !== null && pathKey(this.editing.path) === pathKey(box.path),
      };
      this.world.append(nodeElement(this.renderer, box, state, () => this.toggleFold(box.path)));
    }
    if (this.editing) this.placeEditor(this.editing, byKey);
    if (this.needsFit && this.size().w > 0) {
      this.needsFit = false;
      this.viewport = fitted(bounds(layout.boxes), this.size());
    }
    this.apply();
  }

  private apply(): void {
    const { x, y, scale } = this.viewport;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  private toggleFold(path: NodePath): void {
    const key = pathKey(path);
    if (this.folded.has(key)) this.folded.delete(key);
    else this.folded.add(key);
    this.deps.folded.store([...this.folded]);
    this.draw();
  }

  // --- Vue ------------------------------------------------------------------------------

  private fit(): void {
    this.viewport = fitted(bounds(this.boxes), this.size());
    this.apply();
  }

  private exportImage(): void {
    const frame = imageFrame(bounds(this.boxes));
    if (frame === null) return this.deps.notice("La carte est vide : rien à exporter.");
    mapImage(frame, this.element, this.world, this.links)
      .then((png) => this.deps.exportImage(png))
      .catch(this.deps.error);
  }

  private zoomBy(factor: number): void {
    const { w, h } = this.size();
    this.viewport = zoomed(this.viewport, factor, { x: w / 2, y: h / 2 });
    this.apply();
  }

  private viewPoint(event: { clientX: number; clientY: number }): Point {
    const at = this.element.getBoundingClientRect();
    return { x: event.clientX - at.left, y: event.clientY - at.top };
  }

  private mapPoint(event: { clientX: number; clientY: number }): Point {
    return toMap(this.viewport, this.viewPoint(event));
  }

  private boxOf(path: NodePath): Box | undefined {
    return this.boxes.find((box) => pathKey(box.path) === pathKey(path));
  }

  private choose(path: NodePath | null): void {
    this.chosen = path;
    this.draw(() => {
      const box = path === null ? undefined : this.boxOf(path);
      if (box) {
        this.viewport = revealed(this.viewport, this.rect(box), this.size());
        this.apply();
      }
    });
  }

  // --- Changements ----------------------------------------------------------------------

  private commit(next: MindMapItem, choose: NodePath | null, op: Op): void {
    this.history = changed(this.history, this.current);
    this.current = next;
    this.saver.record(op);
    this.choose(choose);
    void this.saver.persist();
  }

  /** Un changement n'a pas pu être refait : la carte du fichier remplace la nôtre. */
  private reload(disk: MindMapItem): void {
    this.current = disk;
    this.saver.reset(disk);
    this.history = EMPTY_HISTORY;
    if (this.chosen !== null && nodeAt(disk, this.chosen) === null) this.chosen = null;
    this.draw();
    this.deps.notice("La carte est rechargée.");
  }

  private undo(redo: boolean): void {
    const result = (redo ? redone : undone)(this.history, this.current);
    if (result === null) return;
    this.current = result.map;
    this.history = result.history;
    this.saver.record({ kind: "replace" });
    if (this.chosen !== null && nodeAt(this.current, this.chosen) === null) this.chosen = null;
    this.draw();
    void this.saver.persist();
  }

  private async remove(path: NodePath): Promise<void> {
    const node = nodeAt(this.current, path);
    if (node === null) return;
    const count = descendantsCount(node);
    if (count > 0 && !(await confirmDeletion(this.element, count))) return;
    // Le nœud qui prend sa place : le frère de dessous, sinon celui de dessus, sinon le parent.
    const after =
      siblingOf(this.current, path, 1) !== null
        ? path
        : (siblingOf(this.current, path, -1) ?? parentOf(path));
    this.commit(removeAt(this.current, path), after, { kind: "remove", path });
  }

  private setColor(path: NodePath, color: string | null): void {
    this.commit(updateNode(this.current, path, { color }), path, {
      kind: "update",
      path,
      patch: { color },
    });
  }

  // --- Saisie ---------------------------------------------------------------------------

  /** Ajoute un nœud vide et le met en saisie ; il n'existe qu'une fois validé. */
  private add(kind: "child" | "sibling", path: NodePath): void {
    const before = this.current;
    if (kind === "child") this.folded.delete(pathKey(path));
    let added: { map: MindMapItem; path: NodePath };
    if (kind === "child") added = addChild(before, path, newNode(""));
    else if (path.length > 1) added = addSibling(before, path, newNode(""));
    else added = addRoot(before, newNode(""), this.placeBelow(path));
    this.current = added.map;
    this.chosen = added.path;
    this.beginEdit(added.path, before, true);
  }

  private placeBelow(root: NodePath): { x: number; y: number } {
    const own = this.boxes.filter((box) => box.path[0] === root[0]);
    const base = this.boxOf(root);
    const bottom = Math.max(...own.map((box) => box.y + box.height), base?.y ?? 0);
    return { x: base?.x ?? 0, y: bottom + ROOT_GAP };
  }

  private beginEdit(path: NodePath, before: MindMapItem, isNew: boolean): void {
    this.finishEdit(false);
    const node = nodeAt(this.current, path);
    if (node === null) return;
    const area = document.createElement("textarea");
    area.className = "mind-map-input";
    area.value = typedOf(node);
    area.setAttribute("aria-label", "Texte du nœud");
    this.editing = { path, before, isNew, area };
    area.addEventListener("keydown", (event) => this.editKey(event, area));
    area.addEventListener("pointerdown", (event) => event.stopPropagation());
    area.addEventListener("dblclick", (event) => event.stopPropagation());
    area.addEventListener("blur", () => {
      if (this.editing?.area === area) this.validate(false);
    });
    this.draw(() => {
      area.focus();
      area.select();
      const box = this.boxOf(path);
      if (box) {
        this.viewport = revealed(this.viewport, this.rect(box), this.size());
        this.apply();
      }
    });
  }

  private placeEditor(editing: Editing, byKey: Map<string, Box>): void {
    const box = byKey.get(pathKey(editing.path));
    const root = box ?? this.boxes[0];
    const { area } = editing;
    area.style.left = `${root?.x ?? 0}px`;
    area.style.top = `${root?.y ?? 0}px`;
    area.style.minWidth = `${root?.width ?? 0}px`;
    area.style.minHeight = `${root?.height ?? 0}px`;
    this.world.append(area);
  }

  private editKey(event: KeyboardEvent, area: HTMLTextAreaElement): void {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      this.finishEdit(true);
    } else if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.validate(true);
    } else if (event.key === "Tab") {
      event.preventDefault();
      const path = this.editing?.path;
      if (path && this.validate(true)) this.add("child", path);
    } else if (area.value === "") {
      area.style.height = "";
    }
  }

  /** Valide la saisie ; une première ligne vide est refusée et le nœud reste en saisie. */
  private validate(keepFocus: boolean): boolean {
    const editing = this.editing;
    if (editing === null) return false;
    const typed = parseTyped(editing.area.value);
    if (typed.title === "") {
      editing.area.classList.add("refused");
      if (!keepFocus) this.finishEdit(true);
      return false;
    }
    this.editing = null;
    editing.area.remove();
    const next = updateNode(this.current, editing.path, typed);
    const unchanged = JSON.stringify(next) === JSON.stringify(editing.before);
    this.current = editing.before;
    if (unchanged) this.choose(editing.path);
    else this.commit(next, editing.path, typedOp(next, editing.path, editing.isNew, typed));
    this.afterEdit(keepFocus);
    return true;
  }

  /** Abandonne la saisie : un nœud neuf est retiré. */
  private finishEdit(cancel: boolean): void {
    const editing = this.editing;
    if (editing === null) return;
    this.editing = null;
    editing.area.remove();
    if (cancel || editing.isNew) {
      this.current = editing.before;
      this.chosen = editing.isNew ? parentOf(editing.path) : editing.path;
      this.draw();
    }
    this.afterEdit(true);
  }

  private afterEdit(focus: boolean): void {
    if (focus) this.element.focus();
    const later = this.deferred;
    this.deferred = null;
    if (later !== null) this.setMap(later);
  }

  // --- Souris et clavier ----------------------------------------------------------------

  private listen(): void {
    const el = this.element;
    el.addEventListener("keydown", (event) => this.key(event));
    el.addEventListener("wheel", (event) => this.wheel(event), { passive: false });
    el.addEventListener("pointerdown", (event) => this.pointerDown(event));
    el.addEventListener("dblclick", (event) => this.doubleClick(event));
    el.addEventListener("contextmenu", (event) => this.contextMenu(event));
    el.addEventListener("click", (event) => followLink(event, this.deps));
  }

  private wheel(event: WheelEvent): void {
    event.preventDefault();
    this.viewport = wheeled(this.viewport, event, this.viewPoint(event));
    this.apply();
  }

  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".mind-map-controls, .mind-map-input, .mind-map-confirm, a")) return;
    this.element.focus({ preventScroll: true });
    // Le clic redessine les nœuds : sans capture, plus ni clic ni double-clic.
    try {
      this.element.setPointerCapture(event.pointerId);
    } catch {
      /* pointeur déjà relâché : rien à suivre */
    }
    const path = pathOfTarget(target);
    if (path === null) this.panByDragging(event);
    else this.pressNode(event, path);
  }

  private panByDragging(event: PointerEvent): void {
    this.finishEdit(false);
    startPan(event, {
      by: (dx, dy) => {
        this.viewport = panned(this.viewport, dx, dy);
        this.apply();
      },
      onClick: () => this.choose(null),
    });
  }

  private pressNode(event: PointerEvent, path: NodePath): void {
    this.finishEdit(false);
    const box = this.boxOf(path);
    if (!box) return;
    startDrag(event, {
      world: this.world,
      boxes: this.boxes,
      from: box,
      point: (e) => this.mapPoint(e),
      onClick: () => this.choose(path),
      onDrop: (drop) => {
        const moved = moveBranch(this.current, path, drop);
        if (moved !== null) this.commit(moved.map, moved.path, { kind: "move", from: path, drop });
      },
      dropAt: (at, dragged) => dropTarget(this.boxes, at, dragged),
    });
  }

  private doubleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest(".mind-map-controls, .mind-map-input")) return;
    // Le premier clic a redessiné les nœuds : le nœud est sous le pointeur, plus la cible.
    const path =
      pathOfTarget(document.elementFromPoint(event.clientX, event.clientY)) ?? pathOfTarget(target);
    if (path !== null) {
      this.chosen = path;
      this.beginEdit(path, this.current, false);
      return;
    }
    const at = this.mapPoint(event);
    const before = this.current;
    const added = addRoot(before, newNode(""), { x: at.x, y: at.y });
    this.current = added.map;
    this.chosen = added.path;
    this.beginEdit(added.path, before, true);
  }

  private contextMenu(event: MouseEvent): void {
    event.preventDefault();
    const path = pathOfTarget(event.target);
    if (path === null) return;
    this.choose(path);
    const current = nodeAt(this.current, path)?.color ?? null;
    showContextMenu(event.clientX, event.clientY, nodeMenu(this.keyHost, path, current));
  }

  private key(event: KeyboardEvent): void {
    if (this.editing !== null) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      this.undo(event.shiftKey);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || this.chosen === null) return;
    if (nodeKey(this.keyHost, event.key, this.chosen)) event.preventDefault();
  }

  private readonly keyHost: KeyHost = {
    map: () => this.current,
    add: (kind, path) => this.add(kind, path),
    edit: (path) => this.beginEdit(path, this.current, false),
    remove: (path) => void this.remove(path),
    choose: (path) => this.choose(path),
    color: (path, color) => this.setColor(path, color),
    unfold: (path) => {
      this.folded.delete(pathKey(path));
      this.deps.folded.store([...this.folded]);
    },
  };
}

export function createMindMapView(deps: MindMapDeps): MindMapView {
  return new MindMapScreen(deps);
}
