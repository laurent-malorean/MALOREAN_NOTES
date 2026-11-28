// Ce que montre la fenêtre du sélecteur de période d'un événement (spécification § 4.3), de haut en bas : la barre
// d'année (◀ 2027 ▶, un clic sur l'année ouvre la liste des années), la grille des 12 mois, le calendrier du mois
// montré (semaines, lundi en premier) avec sa plage surlignée, puis « Mois entier » et « Effacer la fin ». Chaque
// bouton porte `data-focus`, sa place pour que le curseur y revienne après le nouveau dessin, et ceux d'une grille
// `data-grid` et `data-n`, leur rang pour les flèches.
import type { Agenda12EventItem } from "../bridge";
import { monthName } from "../state/agenda-12";
import {
  dayEnabled,
  dayMark,
  MAX_OFFSET,
  MONTH_ABBREVIATIONS,
  monthWeeks,
  viewMonth,
  viewYear,
  WEEKDAYS,
} from "../state/agenda-12-calendar";
import { yearChoices } from "../state/agenda-12-when";
import { actionButton, h } from "./crm-dom";

export const PREVIOUS_YEAR = "Année précédente";
export const NEXT_YEAR_TEXT = "Année suivante";
export const NO_YEAR_TEXT = "Sans année";
export const PREVIOUS_MONTH_TEXT = "Mois précédent";
export const NEXT_MONTH_TEXT = "Mois suivant";
export const WHOLE_MONTH = "Mois entier";
export const CLEAR_END = "Effacer la fin";
export const AWAITING_END = "Choisissez le dernier jour, ou le même jour pour un seul jour.";
export const START_FIRST = "Choisissez d'abord le jour de début.";

/** Ce que la fenêtre montre. */
export interface PopupModel {
  readonly event: Agenda12EventItem;
  readonly currentYear: number;
  /** Le mois du calendrier, en mois après le mois de début. */
  readonly offset: number;
  /** Le début est fixé, la fin est attendue. */
  readonly awaitingEnd: boolean;
  /** La liste des années remplace les mois et le calendrier. */
  readonly yearList: boolean;
}

/** Ce que les boutons de la fenêtre déclenchent. */
export interface PopupHandlers {
  readonly stepYear: (delta: -1 | 1) => void;
  readonly toggleYears: () => void;
  readonly chooseYear: (year: number | null) => void;
  readonly chooseMonth: (month: number) => void;
  readonly stepView: (delta: -1 | 1) => void;
  readonly chooseDay: (day: number) => void;
  readonly wholeMonth: () => void;
  readonly clearEnd: () => void;
}

/** Un bouton de la fenêtre : son texte, son nom lu, sa place pour le curseur, son action. */
function control(
  className: string,
  text: string,
  focus: string,
  run: () => void,
  label?: string,
): HTMLButtonElement {
  const button = actionButton(className, text, label);
  button.dataset.focus = focus;
  button.addEventListener("click", run);
  return button;
}

/** Un bouton d'une grille : son rang `n` pour les flèches. */
function cell(grid: string, n: number, className: string, text: string): HTMLButtonElement {
  const button = actionButton(className, text);
  button.dataset.grid = grid;
  button.dataset.n = String(n);
  button.dataset.focus = `${grid}:${String(n)}`;
  button.tabIndex = -1;
  return button;
}

function yearBar({ event, yearList }: PopupModel, on: PopupHandlers): HTMLElement {
  const year = control(
    "agenda-period-year",
    event.year === null ? NO_YEAR_TEXT : String(event.year),
    "year",
    on.toggleYears,
    `Année : ${event.year === null ? NO_YEAR_TEXT.toLowerCase() : String(event.year)}`,
  );
  year.setAttribute("aria-expanded", String(yearList));
  const bar = h("div", "agenda-period-bar");
  bar.append(
    control("agenda-period-step", "‹", "year-previous", () => on.stepYear(-1), PREVIOUS_YEAR),
    year,
    control("agenda-period-step", "›", "year-next", () => on.stepYear(1), NEXT_YEAR_TEXT),
  );
  return bar;
}

function yearOptions({ event, currentYear }: PopupModel, on: PopupHandlers): HTMLElement {
  const list = h("div", "agenda-period-years");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Années");
  const years: (number | null)[] = [null, ...yearChoices(currentYear, event.year)];
  years.forEach((year, index) => {
    const text = year === null ? NO_YEAR_TEXT : String(year);
    const option = cell("years", index, "agenda-period-option", text);
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(year === event.year));
    option.addEventListener("click", () => on.chooseYear(year));
    list.append(option);
  });
  return list;
}

function monthGrid({ event }: PopupModel, on: PopupHandlers): HTMLElement {
  const grid = h("div", "agenda-period-months");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Mois");
  MONTH_ABBREVIATIONS.forEach((abbreviation, index) => {
    const month = index + 1;
    const button = cell("months", month, "agenda-period-month", abbreviation);
    button.setAttribute("aria-label", monthName(month).toLowerCase());
    button.setAttribute("aria-pressed", String(month === event.month));
    button.addEventListener("click", () => on.chooseMonth(month));
    grid.append(button);
  });
  return grid;
}

/** « octobre 2027 » ; sans année, le nom du mois seul. */
function viewTitle(model: PopupModel): string {
  const { event, offset } = model;
  const name = monthName(viewMonth(event.month, offset)).toLowerCase();
  const year = viewYear(event.year, event.month, offset);
  return year === null ? name : `${name} ${String(year)}`;
}

function calendarBar(model: PopupModel, on: PopupHandlers): HTMLElement {
  const previous = control(
    "agenda-period-step",
    "‹",
    "view-previous",
    () => on.stepView(-1),
    PREVIOUS_MONTH_TEXT,
  );
  const next = control(
    "agenda-period-step",
    "›",
    "view-next",
    () => on.stepView(1),
    NEXT_MONTH_TEXT,
  );
  previous.disabled = model.offset === 0;
  next.disabled = model.offset >= MAX_OFFSET;
  const title = h("span", "agenda-period-view", viewTitle(model));
  title.setAttribute("aria-live", "polite");
  const bar = h("div", "agenda-period-bar");
  bar.append(previous, title, next);
  return bar;
}

function dayGrid(model: PopupModel, on: PopupHandlers): HTMLElement {
  const { event, offset } = model;
  const month = viewMonth(event.month, offset);
  const year = viewYear(event.year, event.month, offset);
  const grid = h("div", "agenda-period-days");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", `Jours : ${viewTitle(model)}`);
  for (const { initial, name } of WEEKDAYS) {
    const weekday = h("span", "agenda-period-weekday", initial);
    weekday.title = name;
    grid.append(weekday);
  }
  for (const day of monthWeeks(year, month).flat()) {
    if (day === null) {
      grid.append(h("span", "agenda-period-blank"));
      continue;
    }
    const mark = dayMark(event, offset, day);
    const button = cell("days", day, "agenda-period-day", String(day));
    button.dataset.mark = mark;
    button.disabled = !dayEnabled(event, offset);
    button.setAttribute("aria-pressed", String(mark === "start" || mark === "end"));
    button.setAttribute(
      "aria-label",
      `${String(day)} ${monthName(month).toLowerCase()}${year === null ? "" : ` ${String(year)}`}`,
    );
    button.addEventListener("click", () => on.chooseDay(day));
    grid.append(button);
  }
  return grid;
}

function hint({ awaitingEnd, event, offset }: PopupModel): HTMLElement {
  const text = awaitingEnd ? AWAITING_END : offset > 0 && event.day === null ? START_FIRST : "";
  const element = h("p", "agenda-period-hint", text);
  element.setAttribute("aria-live", "polite");
  element.hidden = text === "";
  return element;
}

function footer({ event }: PopupModel, on: PopupHandlers): HTMLElement {
  const whole = control("agenda-period-action", WHOLE_MONTH, "whole", on.wholeMonth);
  const clear = control("agenda-period-action", CLEAR_END, "clear-end", on.clearEnd);
  whole.disabled = event.day === null;
  clear.disabled = event.end === null;
  const foot = h("div", "agenda-period-foot");
  foot.append(whole, clear);
  return foot;
}

/** Tout ce que la fenêtre montre, prêt à être posé dedans. */
export function drawPeriodPopup(model: PopupModel, on: PopupHandlers): HTMLElement[] {
  const top = yearBar(model, on);
  if (model.yearList) return [top, yearOptions(model, on)];
  return [
    top,
    monthGrid(model, on),
    calendarBar(model, on),
    dayGrid(model, on),
    hint(model),
    footer(model, on),
  ];
}
