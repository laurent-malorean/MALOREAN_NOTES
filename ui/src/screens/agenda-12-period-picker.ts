// Le sélecteur de période de la bande d'un événement (spécification § 4.3) : un seul bouton-champ qui dit la date
// en toutes lettres (« 5 – 11 octobre 2026 ») et ouvre une seule fenêtre ancrée où l'on choisit l'année, le mois, le
// jour de début puis le jour de fin. Chaque choix s'applique aussitôt (le moteur le valide, la bande relit l'événement,
// la fenêtre se redessine) ; rien n'est écrit avant. Ouverture : un clic, Entrée, Espace, la flèche du bas. Fermeture :
// Échap (le curseur revient au champ), Tab, un clic ou un défilement ailleurs, la fin de la plage.
import type { Agenda12EventItem } from "../bridge";
import { summaryDate } from "../state/agenda-12";
import { MAX_OFFSET, stepYear } from "../state/agenda-12-calendar";
import {
  type Choice,
  clearEnd,
  pickDay,
  pickStart,
  wholeMonth,
} from "../state/agenda-12-date-pick";
import { appIcon } from "./app-icons";
import { actionButton, h } from "./crm-dom";
import { CLEAR_END, drawPeriodPopup, type PopupHandlers } from "./agenda-12-period-popup";
import "./agenda-12-period-picker.css";

export const PERIOD_TITLE = "Choisir la date";
/** La marge entre la fenêtre et le champ, ou le bord de la fenêtre de l'application. */
const GAP = 4;
/** Les pas des flèches dans chaque grille : d'une case à l'autre, et d'une ligne à l'autre. */
const STEPS: Record<string, readonly [number, number]> = {
  months: [1, 3],
  days: [1, 7],
  years: [1, 3],
};
const ARROWS: Record<string, readonly [0 | 1, -1 | 1]> = {
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  ArrowUp: [1, -1],
  ArrowDown: [1, 1],
};

export interface PeriodPickerDeps {
  /** L'année en cours, d'après l'horloge : la liste des années part de là. */
  readonly currentYear: () => number;
  /** Applique un choix : les gestes du moteur, et le message de l'écran. Rend la main quand l'événement est relu. */
  readonly apply: (pick: Choice) => Promise<void>;
}

export interface PeriodPicker {
  readonly element: HTMLElement;
  readonly trigger: HTMLButtonElement;
  readonly clearEndButton: HTMLButtonElement;
  /** Montre l'événement : le champ, et la fenêtre si elle est ouverte. */
  show(event: Agenda12EventItem): void;
}

class Period implements PeriodPicker {
  readonly element = h("div", "agenda-period");
  readonly trigger = actionButton("agenda-input agenda-period-trigger", "");
  readonly clearEndButton = actionButton("agenda-period-clear", "×", CLEAR_END);
  private readonly text = h("span", "agenda-period-text");
  private popup: HTMLElement | null = null;
  private event: Agenda12EventItem | null = null;
  private offset = 0;
  private awaitingEnd = false;
  private yearList = false;
  private busy = false;
  private drawing = false;

  constructor(private readonly deps: PeriodPickerDeps) {
    const { trigger, clearEndButton } = this;
    const icon = appIcon("calendar");
    icon.classList.add("agenda-period-icon");
    icon.setAttribute("aria-hidden", "true");
    trigger.append(icon, this.text);
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", () =>
      this.popup === null ? this.open() : this.close(false),
    );
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" || this.popup !== null) return;
      event.preventDefault();
      this.open();
    });
    clearEndButton.title = CLEAR_END;
    clearEndButton.hidden = true;
    clearEndButton.addEventListener("click", () => void this.run(clearEnd(this.current())));
    this.element.addEventListener("keydown", (event) => this.key(event));
    this.element.addEventListener("focusin", (event) => this.rove(event.target));
    this.element.addEventListener("focusout", (event) => this.left(event));
    this.element.append(trigger, clearEndButton);
  }

  private current(): Agenda12EventItem {
    return this.event as Agenda12EventItem;
  }

  show(event: Agenda12EventItem): void {
    this.event = event;
    this.text.textContent = summaryDate(event);
    this.clearEndButton.hidden = event.end === null;
    this.offset = Math.min(this.offset, MAX_OFFSET);
    if (this.popup !== null) this.draw(this.focusKey());
  }

  /** Ce qui s'applique : les gestes (rien ne part s'il n'y en a pas), puis la main revient à la fenêtre. */
  private async run(pick: Choice): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.deps.apply(pick);
    } finally {
      this.busy = false;
    }
  }

  private open(): void {
    const event = this.current();
    this.offset = 0;
    this.yearList = false;
    this.awaitingEnd = event.day !== null && event.end === null;
    const popup = h("div", "agenda-period-popup");
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", PERIOD_TITLE);
    // Un clic dans la fenêtre ne retire pas le curseur d'un bouton avant d'avoir choisi (Safari ne le donne pas au clic).
    popup.addEventListener("mousedown", (mouse) => mouse.preventDefault());
    this.popup = popup;
    this.trigger.setAttribute("aria-expanded", "true");
    this.element.append(popup);
    document.addEventListener("pointerdown", this.outside, true);
    document.addEventListener("scroll", this.scrolled, true);
    this.draw(`months:${String(event.month)}`);
  }

  /** Ferme la fenêtre ; `back` : le curseur revient au champ. */
  private close(back: boolean): void {
    this.popup?.remove();
    this.popup = null;
    this.trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", this.outside, true);
    document.removeEventListener("scroll", this.scrolled, true);
    if (back) this.trigger.focus();
  }

  private readonly outside = (event: PointerEvent): void => {
    if (!this.element.isConnected || !this.element.contains(event.target as Node))
      this.close(false);
  };

  private readonly scrolled = (event: Event): void => {
    if (!this.popup?.contains(event.target as Node)) this.close(false);
  };

  /** Le curseur quitte le sélecteur (Tab, ou ailleurs) : la fenêtre se ferme ; un nouveau dessin ne compte pas pour une sortie. */
  private left(event: FocusEvent): void {
    if (this.popup === null || this.drawing) return;
    const next = event.relatedTarget;
    if (!(next instanceof Node && this.element.contains(next))) this.close(false);
  }

  private focusKey(): string {
    const active = document.activeElement;
    return active instanceof HTMLElement && this.popup?.contains(active)
      ? (active.dataset.focus ?? "")
      : "";
  }

  /** Redessine la fenêtre, puis rend le curseur au bouton de `focus` s'il existe encore. */
  private draw(focus: string): void {
    const { popup } = this;
    if (popup === null) return;
    this.drawing = true;
    popup.replaceChildren(
      ...drawPeriodPopup(
        {
          event: this.current(),
          currentYear: this.deps.currentYear(),
          offset: this.offset,
          awaitingEnd: this.awaitingEnd,
          yearList: this.yearList,
        },
        this.handlers,
      ),
    );
    this.stops(popup);
    this.place(popup);
    const target = popup.querySelector<HTMLElement>(`[data-focus="${focus}"]:not(:disabled)`);
    (target ?? popup.querySelector<HTMLElement>(".agenda-period-year"))?.focus();
    this.drawing = false;
  }

  private readonly handlers: PopupHandlers = {
    stepYear: (delta) => {
      const year = stepYear(this.current().year, this.deps.currentYear(), delta);
      void this.run(pickStart(this.current(), { kind: "year", year })).then(() =>
        this.draw("year-next"),
      );
    },
    toggleYears: () => {
      this.yearList = !this.yearList;
      this.draw(this.yearList ? "years:0" : "year");
    },
    chooseYear: (year) => {
      this.yearList = false;
      void this.run(pickStart(this.current(), { kind: "year", year })).then(() =>
        this.draw("year"),
      );
    },
    chooseMonth: (month) => {
      this.offset = 0;
      const pick = pickStart(this.current(), { kind: "month", month });
      this.awaitingEnd = false;
      void this.run(pick).then(() => this.draw(`months:${String(month)}`));
    },
    stepView: (delta) => {
      this.offset = Math.max(0, Math.min(MAX_OFFSET, this.offset + delta));
      this.draw(delta > 0 ? "view-next" : "view-previous");
    },
    chooseDay: (day) => {
      const pick = pickDay(this.current(), this.offset, this.awaitingEnd, day);
      this.awaitingEnd = pick.awaitingEnd;
      if (pick.close) this.close(true);
      void this.run(pick).then(() => this.draw(`days:${String(day)}`));
    },
    wholeMonth: () => {
      this.awaitingEnd = false;
      this.close(true);
      void this.run(wholeMonth(this.current()));
    },
    clearEnd: () => {
      this.awaitingEnd = this.current().day !== null;
      void this.run(clearEnd(this.current())).then(() => this.draw("clear-end"));
    },
  };

  /** Chaque grille a un bouton que Tab atteint : le choisi, sinon le premier qui se choisit. */
  private stops(popup: HTMLElement): void {
    for (const grid of new Set(
      [...popup.querySelectorAll<HTMLElement>("[data-grid]")].map((b) => b.dataset.grid),
    )) {
      const buttons = [
        ...popup.querySelectorAll<HTMLButtonElement>(`[data-grid="${String(grid)}"]`),
      ];
      const chosen = buttons.find(
        (b) =>
          b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-selected") === "true",
      );
      const stop = chosen ?? buttons.find((b) => !b.disabled);
      for (const button of buttons) button.tabIndex = button === stop ? 0 : -1;
    }
  }

  /** Le bouton d'une grille qui a le curseur est le seul que Tab atteint dans cette grille. */
  private rove(target: EventTarget | null): void {
    if (!(target instanceof HTMLElement) || target.dataset.grid === undefined) return;
    for (const button of this.popup?.querySelectorAll<HTMLElement>(
      `[data-grid="${target.dataset.grid}"]`,
    ) ?? [])
      button.tabIndex = button === target ? 0 : -1;
  }

  private key(event: KeyboardEvent): void {
    if (this.popup === null) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      if (!this.yearList) return this.close(true);
      this.yearList = false;
      return this.draw("year");
    }
    const active = document.activeElement;
    const arrow = ARROWS[event.key];
    if (
      arrow === undefined ||
      !(active instanceof HTMLElement) ||
      active.dataset.grid === undefined
    )
      return;
    event.preventDefault();
    const grid = active.dataset.grid;
    const step = (STEPS[grid] ?? [1, 1])[arrow[0]] * arrow[1];
    const target = this.popup.querySelector<HTMLElement>(
      `[data-grid="${grid}"][data-n="${String(Number(active.dataset.n) + step)}"]:not(:disabled)`,
    );
    target?.focus();
  }

  /** Sous le champ, sinon au-dessus ; sans place des deux côtés, à la hauteur du champ, qu'elle recouvre, dans la fenêtre. */
  private top(field: DOMRect, height: number): number {
    const below = field.bottom + GAP;
    const above = field.top - GAP - height;
    const room = window.innerHeight - GAP;
    if (below + height <= room) return below;
    if (above >= GAP) return above;
    return Math.max(GAP, Math.min(field.top, room - height));
  }

  /** Placée sous le champ ou au-dessus, jamais hors de la fenêtre ni de la colonne, où elle se rétrécit. */
  private place(popup: HTMLElement): void {
    popup.style.width = "";
    popup.style.maxHeight = `${String(window.innerHeight - 2 * GAP)}px`;
    const field = this.trigger.getBoundingClientRect();
    const column = this.element.closest(".agenda-band")?.getBoundingClientRect();
    const left = Math.max(GAP, column?.left ?? 0);
    const right = Math.min(window.innerWidth - GAP, column?.right ?? window.innerWidth);
    const width = Math.min(popup.getBoundingClientRect().width, right - left);
    popup.style.width = `${String(width)}px`;
    const { height } = popup.getBoundingClientRect();
    popup.style.top = `${String(this.top(field, height))}px`;
    popup.style.left = `${String(Math.max(left, Math.min(field.left, right - width)))}px`;
  }
}

export function createPeriodPicker(deps: PeriodPickerDeps): PeriodPicker {
  return new Period(deps);
}
