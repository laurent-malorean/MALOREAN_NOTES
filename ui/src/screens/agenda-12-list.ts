// La vue liste d'un agenda 12 (spécification § 5.5) : un titre par mois, de janvier à décembre, puis une
// ligne par événement, la même que celle de la grille. Les cases sont celles de Rust, dans son ordre ;
// la mise en colonnes est faite par le style, jamais par un calcul d'écran.
import type { Agenda12CellItem } from "../bridge";
import { monthName } from "../state/agenda-12";
import { h } from "./crm-dom";
import "./agenda-12-list.css";

/** Ce que la liste emprunte à l'écran de l'agenda 12 : sa ligne d'événement et son « + » de mois. */
export interface MonthListParts {
  readonly item: (event: Agenda12CellItem["events"][number]) => HTMLElement;
  readonly add: (cell: Agenda12CellItem) => HTMLButtonElement;
}

/** Un mois : son titre avec son « + » à droite, puis ses lignes ; sans événement, le titre reste, discret. */
function group(cell: Agenda12CellItem, parts: MonthListParts): HTMLElement {
  const section = h("section", "agenda-month-group");
  section.dataset.month = String(cell.month);
  section.dataset.empty = String(cell.events.length === 0);
  section.setAttribute("aria-label", monthName(cell.month));
  const head = h("header", "agenda-month-head");
  head.append(h("h3", "agenda-month", monthName(cell.month)), parts.add(cell));
  const events = h("ul", "agenda-month-events");
  events.append(...cell.events.map(parts.item));
  section.append(head, events);
  return section;
}

/** Les douze mois en liste, de janvier à décembre. */
export function monthList(cells: readonly Agenda12CellItem[], parts: MonthListParts): HTMLElement {
  const list = h("div", "agenda-list");
  list.append(...cells.map((cell) => group(cell, parts)));
  return list;
}
