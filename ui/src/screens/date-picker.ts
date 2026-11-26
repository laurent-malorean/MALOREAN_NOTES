// Le sélecteur de date de l'application (décision 0084) : un champ où l'on écrit « JJ/MM/AAAA » et un
// calendrier en français (grand, mois en lettres avec flèches, semaine commençant le lundi), le même partout
// où l'interface demande une date. Il remplace le sélecteur natif du moteur web, petit et en anglais.
// Ouverture : le bouton, un clic ou une saisie dans le champ, la flèche du bas. Fermeture : Échap, un clic
// à côté, Tab, ou le choix d'un jour. Clavier : flèches (jour, semaine), PageHaut et PageBas (mois), Entrée.
import {
  addMonths,
  type CalendarDay,
  firstOfMonth,
  formatDate,
  longDate,
  monthGrid,
  monthLabel,
  movedBy,
  parseDate,
  WEEKDAYS,
} from "../state/date-picker";
import { appIcon } from "./app-icons";
import { actionButton, h } from "./crm-dom";
import "./date-picker.css";

export const OPEN_CALENDAR = "Ouvrir le calendrier";
export const PREVIOUS_MONTH = "Mois précédent";
export const NEXT_MONTH = "Mois suivant";
export const CLEAR_DATE = "Effacer";
export const TODAY_TEXT = "Aujourd'hui";
export const DATE_PLACEHOLDER = "JJ/MM/AAAA";
/** Le décalage entre le champ et le calendrier, en points. */
const OFFSET = 4;

export interface DateFieldOptions {
  /** La date, `AAAA-MM-JJ`, ou `""` sans date. */
  readonly value: string;
  /** Le nom du champ, lu par les lecteurs d'écran. */
  readonly label: string;
  /** Le jour d'aujourd'hui : il est repéré au calendrier, et « Aujourd'hui » y mène. */
  readonly today: string;
  /** La date peut être vide : « Effacer » est proposé. */
  readonly clearable: boolean;
  /** La date choisie ou écrite (`""` : effacée). */
  readonly change: (date: string) => void;
  /** La classe du champ de saisie. */
  readonly className?: string;
  /** Les données (`data-…`) du champ de saisie. */
  readonly data?: Readonly<Record<string, string>>;
}

class DateField {
  readonly root = h("div", "date-field");
  readonly input: HTMLInputElement;
  private readonly opener = actionButton("date-open", "", OPEN_CALENDAR);
  private popup: HTMLElement | null = null;
  private value: string;
  /** Le jour que le clavier a atteint : le mois montré est le sien. */
  private cursor: string;

  constructor(private readonly options: DateFieldOptions) {
    this.value = options.value;
    this.cursor = options.value || options.today;
    this.input = h("input", `date-input ${options.className ?? ""}`.trim());
    this.input.type = "text";
    this.input.placeholder = DATE_PLACEHOLDER;
    this.input.autocomplete = "off";
    this.input.spellcheck = false;
    this.input.value = formatDate(options.value);
    this.input.setAttribute("aria-label", options.label);
    this.input.setAttribute("aria-haspopup", "dialog");
    this.input.setAttribute("aria-expanded", "false");
    Object.assign(this.input.dataset, options.data);
    this.opener.append(appIcon("calendar"));
    this.opener.addEventListener("click", () => (this.popup === null ? this.open() : this.close()));
    this.input.addEventListener("click", () => this.open());
    this.input.addEventListener("input", () => this.typed());
    this.input.addEventListener("change", () => this.commitText());
    this.root.addEventListener("keydown", (event) => this.key(event));
    this.root.append(this.input, this.opener);
  }

  /** Ce qui est écrit : une date du calendrier suit le calendrier ouvert, le reste attend la fin de la saisie. */
  private typed(): void {
    this.open();
    const date = parseDate(this.input.value);
    if (date === null) return;
    this.cursor = date;
    this.draw();
  }

  /** Quitter le champ ou Entrée : une date valide est prise ; une date vide ou invalide reprend la valeur d'avant. */
  private commitText(): void {
    const text = this.input.value.trim();
    const date = parseDate(text);
    if (text === "" && this.options.clearable) return this.set("");
    if (date === null) {
      this.input.value = formatDate(this.value);
      return;
    }
    this.set(date);
  }

  /** Prend `date` : le champ la montre, l'appelant la reçoit si elle change. */
  private set(date: string): void {
    this.input.value = formatDate(date);
    if (date === this.value) return;
    this.value = date;
    this.options.change(date);
  }

  private pick(date: string): void {
    this.set(date);
    this.close();
    this.input.focus();
  }

  private key(event: KeyboardEvent): void {
    const open = this.popup !== null;
    if (event.key === "Tab") return this.close();
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      return this.close();
    }
    if (event.key === "Enter") return this.enter(event, open);
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      return this.open();
    }
    const moved = open ? movedBy(this.cursor, event.key) : null;
    if (moved === null) return;
    event.preventDefault();
    this.cursor = moved;
    this.draw();
  }

  /** Entrée : avec le calendrier ouvert, elle choisit le jour atteint ; sinon elle prend le texte et laisse passer la touche (un formulaire se valide). */
  private enter(event: KeyboardEvent, open: boolean): void {
    if (!open) return this.commitText();
    event.preventDefault();
    event.stopPropagation();
    this.pick(this.cursor);
  }

  open(): void {
    if (this.popup !== null) return;
    this.cursor = parseDate(this.input.value) ?? (this.value || this.options.today);
    this.popup = h("div", "date-popup");
    this.popup.setAttribute("role", "dialog");
    this.popup.setAttribute("aria-label", "Calendrier");
    // Un clic dans le calendrier ne prend pas le curseur au champ : ce qui y est écrit n'est pas validé en route.
    this.popup.addEventListener("mousedown", (event) => event.preventDefault());
    this.input.setAttribute("aria-expanded", "true");
    this.root.append(this.popup);
    document.addEventListener("pointerdown", this.outside, true);
    document.addEventListener("scroll", this.scrolled, true);
    this.draw();
    this.place();
  }

  private close(): void {
    this.popup?.remove();
    this.popup = null;
    this.input.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", this.outside, true);
    document.removeEventListener("scroll", this.scrolled, true);
  }

  /** Un clic ailleurs ferme le calendrier ; le champ retiré de la page le ferme aussi. */
  private readonly outside = (event: PointerEvent): void => {
    if (!this.root.isConnected || !this.root.contains(event.target as Node)) this.close();
  };

  /** Un défilement hors du calendrier le ferme : il ne suivrait plus son champ. */
  private readonly scrolled = (event: Event): void => {
    if (!this.popup?.contains(event.target as Node)) this.close();
  };

  /** Sous le champ, ou au-dessus s'il n'y a pas la place ; jamais hors de la fenêtre. */
  private place(): void {
    const popup = this.popup as HTMLElement;
    const field = this.input.getBoundingClientRect();
    const { width, height } = popup.getBoundingClientRect();
    const below = field.bottom + OFFSET;
    const top = below + height > window.innerHeight ? field.top - OFFSET - height : below;
    popup.style.top = `${String(Math.max(OFFSET, top))}px`;
    popup.style.left = `${String(Math.max(OFFSET, Math.min(field.left, window.innerWidth - width - OFFSET)))}px`;
  }

  /** Dessine le mois du jour atteint, avec ses jours, « Effacer » et « Aujourd'hui ». */
  private draw(): void {
    const popup = this.popup;
    if (popup === null) return;
    popup.replaceChildren(this.header(), this.weekdays(), this.days(), this.footer());
  }

  private header(): HTMLElement {
    const previous = actionButton("date-nav", "‹", PREVIOUS_MONTH);
    const next = actionButton("date-nav", "›", NEXT_MONTH);
    previous.addEventListener("click", () => this.go(-1));
    next.addEventListener("click", () => this.go(1));
    const month = h("span", "date-month", monthLabel(this.cursor));
    month.setAttribute("aria-live", "polite");
    const head = h("div", "date-head");
    head.append(month, previous, next);
    return head;
  }

  private go(months: number): void {
    this.cursor = addMonths(this.cursor, months);
    this.draw();
  }

  private weekdays(): HTMLElement {
    const row = h("div", "date-weekdays");
    for (const { initial, name } of WEEKDAYS) {
      const cell = h("span", "date-weekday", initial);
      cell.title = name;
      row.append(cell);
    }
    return row;
  }

  private days(): HTMLElement {
    const grid = h("div", "date-days");
    grid.setAttribute("role", "grid");
    for (const day of monthGrid(firstOfMonth(this.cursor))) grid.append(this.day(day));
    return grid;
  }

  private day({ iso, day, inMonth }: CalendarDay): HTMLElement {
    const button = actionButton("date-day", String(day), longDate(iso));
    button.tabIndex = -1;
    button.dataset.date = iso;
    button.classList.toggle("outside", !inMonth);
    button.classList.toggle("today", iso === this.options.today);
    button.classList.toggle("cursor", iso === this.cursor);
    button.setAttribute("aria-pressed", String(iso === this.value));
    button.addEventListener("click", () => this.pick(iso));
    return button;
  }

  private footer(): HTMLElement {
    const foot = h("div", "date-foot");
    const today = actionButton("date-today link", TODAY_TEXT);
    today.addEventListener("click", () => this.pick(this.options.today));
    if (this.options.clearable) {
      const clear = actionButton("date-clear link", CLEAR_DATE);
      clear.addEventListener("click", () => this.pick(""));
      foot.append(clear);
    }
    foot.append(today);
    return foot;
  }
}

/** Le champ de date : le champ de saisie et son bouton calendrier dans `element`, le champ de saisie dans `input`. */
export function dateField(options: DateFieldOptions): {
  element: HTMLElement;
  input: HTMLInputElement;
} {
  const field = new DateField(options);
  return { element: field.root, input: field.input };
}
