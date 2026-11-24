// Canvas (fiche 0052, spécification § 2, § 6, § 7 et § 8) : ce que font les menus et les barres : ajouter une
// carte (texte, note, média, page web, groupe), changer le fichier ou l'adresse, grouper, aligner, régler, suivre
// une connexion ; et le menu du clic droit.
import type { CanvasItem } from "../bridge";
import { type Alignment, type Distribution, aligned, distributed } from "../state/canvas-align";
import {
  type Selectable,
  type Sense,
  arrow,
  card,
  imageSize,
  newFileCard,
  newGroup,
  newLinkCard,
  withArrowChanged,
  withCard,
  withCardChanged,
  withGroupAround,
  withSense,
} from "../state/canvas-model";
import { type Point, type Rect, type Viewport, centredOn, toMap } from "../state/canvas-viewport";
import { curveOf } from "./canvas-arrows";
import {
  type CanvasEntry,
  type CardMenuKind,
  type MenuActions,
  arrowMenu,
  canvasMenu,
  cardMenu,
} from "./canvas-menus";
import { naturalSize } from "./canvas-cards";
import { showContextMenu } from "./context-menu";

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/i;

/** Les trois cases de l'engrenage. */
export interface Switches {
  readonly grid: boolean;
  readonly objects: boolean;
  readonly readOnly: boolean;
}

/** Ce que les actions demandent à la vue. */
export interface ActionHost {
  readonly data: () => CanvasItem;
  readonly change: (next: CanvasItem) => void;
  readonly selection: () => readonly Selectable[];
  readonly select: (selection: readonly Selectable[]) => void;
  readonly surface: HTMLElement;
  readonly view: () => Viewport;
  readonly setView: (view: Viewport) => void;
  readonly size: () => { w: number; h: number };
  readonly switches: () => Switches;
  readonly setSwitch: (name: keyof Switches) => void;
  readonly edit: (item: Selectable) => void;
  readonly removeSelection: () => void;
  readonly zoomToSelection: () => void;
  readonly chooseNote: () => Promise<string | null>;
  readonly chooseMedia: () => Promise<string | null>;
  /** L'adresse chargeable d'une image du canvas (chemin depuis la racine de l'espace de travail). */
  readonly resolveImage: (file: string) => string;
  readonly askText: (question: string, initial: string, confirm: string) => Promise<string | null>;
  readonly copy: (text: string) => void;
  readonly openExternal: (url: string) => void;
  readonly error: (error: unknown) => void;
}

/** Les actions : le point du canvas où l'on a cliqué pour ouvrir le menu sert aux cartes ajoutées et à « Suivre la connexion ». */
export class Actions {
  /** Le point du canvas où le menu a été ouvert. */
  private menuAt: Point = { x: 0, y: 0 };

  constructor(private readonly host: ActionHost) {}

  private ids(kind: Selectable["kind"]): string[] {
    return this.host
      .selection()
      .filter((s) => s.kind === kind)
      .map((s) => s.id);
  }

  private onlyCard() {
    const id = this.ids("card")[0];
    return this.host.selection().length === 1 && id !== undefined
      ? card(this.host.data(), id)
      : undefined;
  }

  private onlyArrow() {
    const id = this.ids("arrow")[0];
    return this.host.selection().length === 1 && id !== undefined
      ? arrow(this.host.data(), id)
      : undefined;
  }

  /** Le point du canvas sous `at` (un point de l'écran), sinon au centre de la vue. */
  placeOf(at: { x: number; y: number } | null): Point {
    const box = this.host.surface.getBoundingClientRect();
    const size = this.host.size();
    const screen =
      at === null ? { x: size.w / 2, y: size.h / 2 } : { x: at.x - box.left, y: at.y - box.top };
    return toMap(this.host.view(), screen);
  }

  /** Ajoute une carte centrée sur le point `at` de l'écran (le centre de la vue sans point). */
  addCard(
    make: (place: Point) => ReturnType<typeof newGroup>,
    at: { x: number; y: number } | null,
    edit = false,
  ): void {
    if (this.host.switches().readOnly) return;
    const place = this.placeOf(at);
    const made = make(place);
    const x = Math.round(place.x - made.width / 2);
    const y = Math.round(place.y - made.height / 2);
    const centred = { ...made, x, y };
    this.host.change(withCard(this.host.data(), centred));
    this.host.select([{ kind: "card", id: centred.id }]);
    if (edit) this.host.edit({ kind: "card", id: centred.id });
  }

  async addFile(
    at: { x: number; y: number } | null,
    choose: () => Promise<string | null>,
  ): Promise<void> {
    try {
      const file = await choose();
      if (file === null) return;
      // Une image prend les proportions de l'image ; les autres fichiers, la taille d'une carte de fichier.
      const natural = IMAGE.test(file) ? await naturalSize(this.host.resolveImage(file)) : null;
      const size = natural === null ? undefined : imageSize(natural);
      this.addCard((p) => newFileCard(p.x, p.y, file, size), at);
    } catch (error) {
      this.host.error(error);
    }
  }

  private menuScreen(): { x: number; y: number } {
    const box = this.host.surface.getBoundingClientRect();
    const { x, y, scale } = this.host.view();
    return { x: box.left + x + this.menuAt.x * scale, y: box.top + y + this.menuAt.y * scale };
  }

  private async addPage(): Promise<void> {
    const url = await this.host.askText("Adresse de la page web", "https://", "Enregistrer");
    if (url !== null && url.trim() !== "")
      this.addCard((p) => newLinkCard(p.x, p.y, url.trim()), this.menuScreen());
  }

  async changeAddress(id: string): Promise<void> {
    const current = card(this.host.data(), id);
    const url = await this.host.askText(
      "Adresse de la page web",
      current?.url ?? "",
      "Enregistrer",
    );
    if (url !== null && url.trim() !== "")
      this.host.change(withCardChanged(this.host.data(), id, { url: url.trim() }));
  }

  private async changeFile(id: string): Promise<void> {
    const current = card(this.host.data(), id);
    const choose = IMAGE.test(current?.file ?? "") ? this.host.chooseMedia : this.host.chooseNote;
    const file = await choose();
    if (file !== null)
      this.host.change(withCardChanged(this.host.data(), id, { file, subpath: null }));
  }

  /** Centre la vue sur la carte à l'autre bout de la flèche, du côté opposé à l'endroit cliqué. */
  private follow(id: string): void {
    const a = arrow(this.host.data(), id);
    const c = a === undefined ? null : curveOf(this.host.data(), a);
    if (a === undefined || c === null) return;
    const near = (p: Point) => Math.hypot(p.x - this.menuAt.x, p.y - this.menuAt.y);
    this.goToCard(near(c.from) <= near(c.to) ? a.to : a.from);
  }

  goToCard(id: string): void {
    const target = card(this.host.data(), id);
    if (target === undefined) return;
    this.host.select([{ kind: "card", id }]);
    const box: Rect = { x: target.x, y: target.y, w: target.width, h: target.height };
    this.host.setView(centredOn(this.host.view(), box, this.host.size()));
  }

  /** Ce que chaque entrée de menu fait. */
  menuActions(): MenuActions {
    const host = this.host;
    const change = (next: CanvasItem) => host.change(next);
    return {
      addNote: () => void this.addFile(this.menuScreen(), host.chooseNote),
      addMedia: () => void this.addFile(this.menuScreen(), host.chooseMedia),
      addPage: () => void this.addPage(),
      addGroup: () => this.addCard((p) => newGroup(p.x, p.y), this.menuScreen()),
      groupSelection: () => {
        const made = withGroupAround(host.data(), this.ids("card"));
        change(made.canvas);
        host.select([{ kind: "card", id: made.id }]);
      },
      edit: () => this.editSelection(),
      remove: () => host.removeSelection(),
      zoomToSelection: () => host.zoomToSelection(),
      copyAddress: () => host.copy(this.onlyCard()?.url ?? ""),
      changeAddress: () => void this.changeAddress(this.onlyCard()?.id ?? ""),
      openExternal: () => host.openExternal(this.onlyCard()?.url ?? ""),
      changeFile: () => void this.changeFile(this.onlyCard()?.id ?? ""),
      follow: () => this.follow(this.onlyArrow()?.id ?? ""),
      editLabel: () => host.edit({ kind: "arrow", id: this.onlyArrow()?.id ?? "" }),
      removeLabel: () =>
        change(withArrowChanged(host.data(), this.onlyArrow()?.id ?? "", { label: null })),
      setSense: (sense: Sense) => change(withSense(host.data(), this.onlyArrow()?.id ?? "", sense)),
      align: (how: Alignment) => change(aligned(host.data(), this.ids("card"), how)),
      distribute: (how: Distribution) => change(distributed(host.data(), this.ids("card"), how)),
      toggleSetting: (name) => host.setSwitch(name),
    };
  }

  editSelection(): void {
    const only = this.host.selection().length === 1 ? this.host.selection()[0] : undefined;
    if (only !== undefined) this.host.edit(only);
  }

  /** Les entrées du menu du clic droit à `event` : sur une flèche, une carte ou le fond. */
  private entriesAt(target: HTMLElement): CanvasEntry[] {
    const actions = this.menuActions();
    const arrowId = target.closest("[data-arrow]")?.getAttribute("data-arrow");
    const cardId = target.closest<HTMLElement>(".canvas-card")?.dataset.id;
    if (arrowId) {
      this.host.select([{ kind: "arrow", id: arrowId }]);
      return arrowMenu(actions, (arrow(this.host.data(), arrowId)?.label ?? "") !== "");
    }
    if (!cardId) return canvasMenu(actions);
    if (!this.ids("card").includes(cardId)) this.host.select([{ kind: "card", id: cardId }]);
    const kind = (card(this.host.data(), cardId)?.kind ?? "text") as CardMenuKind;
    return cardMenu(actions, kind, this.ids("card").length > 1);
  }

  /** Ouvre le menu du clic droit. En lecture seule, il ne garde que ce qui ne change rien. */
  contextMenu(event: MouseEvent): void {
    event.preventDefault();
    const box = this.host.surface.getBoundingClientRect();
    this.menuAt = toMap(this.host.view(), {
      x: event.clientX - box.left,
      y: event.clientY - box.top,
    });
    let entries = this.entriesAt(event.target as HTMLElement);
    if (this.host.switches().readOnly) entries = entries.filter((e) => e.readOnly === true);
    if (entries.length > 0) showContextMenu(event.clientX, event.clientY, entries);
  }
}
