// Le sélecteur de jour de la bande d'un événement (spécification § 4.3) : un bouton-champ qui montre le jour
// choisi et ouvre, ancrée sous lui, une petite fenêtre avec les jours en grille (1 à 10, 11 à 20, 21 à 30, puis le
// 31 et « Aucun jour »). Le même composant sert le jour du début et le jour de la fin ; il ne sait pas quels jours
// sont possibles, l'appelant le lui dit. Ouverture : un clic, Entrée, Espace, la flèche du bas. Fermeture : un
// choix, Échap, Tab, un clic ou un défilement ailleurs. Clavier : flèches, Début, Fin, Entrée, Espace.
import { actionButton, h } from "./crm-dom";
import "./agenda-12-day-picker.css";

export const NO_DAY_TEXT = "—";
export const CLEAR_DAY = "Aucun jour";
/** Le plus grand jour d'un mois, et le nombre de jours par ligne de la grille. */
const LAST_DAY = 31;
const PER_ROW = 10;
/** La place de « Aucun jour » parmi les cases que le clavier atteint : après le 31. */
const CLEAR_CELL = LAST_DAY + 1;
/** La marge entre la fenêtre et le champ, ou le bord de la fenêtre de l'application. */
const GAP = 4;

export interface DayPickerOptions {
  /** Le nom du champ, lu par les lecteurs d'écran : « Jour », « Fin : jour ». */
  readonly label: string;
  /** Le nom de la fenêtre : « Choisir le jour ». */
  readonly title: string;
  /** Le jour se choisit ; faux : grisé, sans effet. */
  readonly available: (day: number) => boolean;
  /** Le jour choisi ; `null` : « Aucun jour ». Jamais dit quand rien ne change. */
  readonly choose: (day: number | null) => void;
}

export interface DayPicker {
  readonly element: HTMLElement;
  readonly trigger: HTMLButtonElement;
  /** Montre le jour de l'événement. */
  show(day: number | null): void;
}

/** La dernière case de `cells` (rangées en ordre croissant) avant `limit`. */
const lastBefore = (cells: readonly number[], limit: number): number | undefined =>
  cells.filter((cell) => cell < limit).pop();

class Days implements DayPicker {
  readonly element = h("div", "agenda-day-picker");
  readonly trigger = actionButton("agenda-input agenda-day-trigger", NO_DAY_TEXT);
  private popup: HTMLElement | null = null;
  private day: number | null = null;

  constructor(private readonly options: DayPickerOptions) {
    const { trigger } = this;
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-label", options.label);
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", () => (this.popup === null ? this.open() : this.close()));
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" || this.popup !== null) return;
      event.preventDefault();
      this.open();
    });
    this.element.addEventListener("keydown", (event) => this.key(event));
    this.element.addEventListener("focusout", (event) => this.left(event));
    this.element.append(trigger);
  }

  show(day: number | null): void {
    this.day = day;
    this.trigger.textContent = day === null ? NO_DAY_TEXT : String(day);
  }

  private open(): void {
    const popup = h("div", "agenda-day-popup");
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", this.options.title);
    // Un clic dans la fenêtre ne retire pas le curseur d'un bouton avant d'avoir choisi (Safari ne le donne pas au clic).
    popup.addEventListener("mousedown", (event) => event.preventDefault());
    const grid = h("div", "agenda-day-grid");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Jours");
    for (let day = 1; day <= LAST_DAY; day += 1) grid.append(this.cell(day));
    const clear = actionButton("agenda-day-clear", CLEAR_DAY);
    clear.addEventListener("click", () => this.pick(null));
    clear.tabIndex = 0;
    grid.append(clear);
    popup.append(grid);
    this.popup = popup;
    this.trigger.setAttribute("aria-expanded", "true");
    this.element.append(popup);
    document.addEventListener("pointerdown", this.outside, true);
    document.addEventListener("scroll", this.scrolled, true);
    this.place(popup);
    this.focusDay(this.startingDay());
  }

  private cell(day: number): HTMLButtonElement {
    const button = actionButton("agenda-day", String(day));
    button.tabIndex = -1;
    button.disabled = !this.options.available(day);
    button.setAttribute("aria-pressed", String(day === this.day));
    button.addEventListener("click", () => this.pick(day));
    return button;
  }

  private close(): void {
    this.popup?.remove();
    this.popup = null;
    this.trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", this.outside, true);
    document.removeEventListener("scroll", this.scrolled, true);
  }

  /** Choisit `day` (`null` : aucun), ferme, et rend le curseur au champ ; rien n'est dit si le jour ne change pas. */
  private pick(day: number | null): void {
    this.close();
    this.trigger.focus();
    if (day !== this.day) this.options.choose(day);
  }

  private readonly outside = (event: PointerEvent): void => {
    if (!this.element.isConnected || !this.element.contains(event.target as Node)) this.close();
  };

  private readonly scrolled = (event: Event): void => {
    if (!this.popup?.contains(event.target as Node)) this.close();
  };

  /** Le curseur quitte le sélecteur (Tab, ou ailleurs) : la fenêtre se ferme. */
  private left(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (this.popup !== null && !(next instanceof Node && this.element.contains(next))) this.close();
  }

  /** Les cases que le clavier atteint : les 31 jours, puis « Aucun jour ». */
  private buttons(): HTMLButtonElement[] {
    return [
      ...(this.popup?.querySelectorAll<HTMLButtonElement>(".agenda-day, .agenda-day-clear") ?? []),
    ];
  }

  /** Le jour choisi s'il se choisit, sinon le premier jour possible, sinon « Aucun jour ». */
  private startingDay(): number {
    const possible = this.possible();
    const chosen = possible.find((cell) => cell === this.day);
    return chosen ?? possible[0] ?? CLEAR_CELL;
  }

  /** Les cases qui se choisissent, de 1 à 31, puis `CLEAR_CELL`. */
  private possible(): number[] {
    return this.buttons().flatMap((button, index) => (button.disabled ? [] : [index + 1]));
  }

  /** Le curseur va sur cette case ; parmi les jours, c'est la seule que Tab atteigne. */
  private focusDay(cell: number): void {
    this.buttons().forEach((button, index) => {
      if (index < LAST_DAY) button.tabIndex = index + 1 === cell ? 0 : -1;
    });
    this.buttons()[cell - 1]?.focus();
  }

  private key(event: KeyboardEvent): void {
    if (this.popup === null) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      this.close();
      this.trigger.focus();
      return;
    }
    const current = this.buttons().findIndex((button) => button === document.activeElement);
    if (current < 0) return;
    const target = this.target(event.key, current + 1);
    if (target === null) return;
    event.preventDefault();
    if (target !== current + 1) this.focusDay(target);
  }

  /** La case que la touche atteint depuis `from` : elle-même si elle ne bouge pas, `null` pour une touche étrangère. */
  private target(key: string, from: number): number | null {
    const possible = this.possible();
    const days = possible.filter((cell) => cell <= LAST_DAY);
    const step = (to: number) => (possible.includes(to) ? to : from);
    const moves: Record<string, () => number> = {
      ArrowRight: () => possible.find((cell) => cell > from) ?? from,
      ArrowLeft: () => lastBefore(possible, from) ?? from,
      ArrowUp: () =>
        from === CLEAR_CELL ? (lastBefore(days, CLEAR_CELL - 1) ?? from) : step(from - PER_ROW),
      ArrowDown: () => this.down(from, step(from + PER_ROW)),
      Home: () => days[0] ?? from,
      End: () => days[days.length - 1] ?? from,
    };
    return moves[key]?.() ?? null;
  }

  /** Vers le bas : la ligne du dessous, ou « Aucun jour » quand la dernière ligne de dix jours n'a rien dessous. */
  private down(from: number, below: number): number {
    const lastRow = from > 2 * PER_ROW && from <= 3 * PER_ROW;
    return below === from && lastRow ? CLEAR_CELL : below;
  }

  /** Sous le champ, ou au-dessus s'il n'y a pas la place ; jamais hors de la fenêtre ni de la colonne, où elle se rétrécit. */
  private place(popup: HTMLElement): void {
    const field = this.trigger.getBoundingClientRect();
    const column = this.element.closest(".agenda-band")?.getBoundingClientRect();
    const left = Math.max(GAP, column?.left ?? 0);
    const right = Math.min(window.innerWidth - GAP, column?.right ?? window.innerWidth);
    const width = Math.min(popup.getBoundingClientRect().width, right - left);
    popup.style.width = `${String(width)}px`;
    const { height } = popup.getBoundingClientRect();
    const below = field.bottom + GAP;
    const top = below + height > window.innerHeight - GAP ? field.top - GAP - height : below;
    popup.style.top = `${String(Math.max(GAP, top))}px`;
    popup.style.left = `${String(Math.max(left, Math.min(field.left, right - width)))}px`;
  }
}

export function createDayPicker(options: DayPickerOptions): DayPicker {
  return new Days(options);
}
