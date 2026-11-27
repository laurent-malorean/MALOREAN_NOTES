// Une ligne d'événement (spécification § 5.3) : `date – drapeau (ville) – titre`, chaque partie absente
// disparaissant avec son séparateur ; l'année est une pastille dont la couleur vient du thème.
import type { Agenda12LineItem } from "../bridge";
import { h } from "./crm-dom";

/** Ce qui sépare deux parties d'une ligne. */
export const LINE_SEPARATOR = " – ";

/** La date : le jour et le mois (ou l'intervalle), suivis de l'année en pastille ; la pastille seule sans jour. */
function dateOf(line: Agenda12LineItem): HTMLElement | null {
  if (line.date === null && line.year === null) return null;
  const date = h("span", "agenda-date");
  if (line.date !== null) date.append(line.date);
  if (line.year === null) return date;
  const year = h("span", "agenda-year", String(line.year));
  year.dataset.tone = line.yearTone ?? "past";
  date.append(...(line.date === null ? [] : [" "]), year);
  return date;
}

/** Le drapeau, suivi de la ville entre parenthèses ; la ville seule est entre parenthèses aussi. */
function placeOf(line: Agenda12LineItem): HTMLElement | null {
  if (line.flag === null && line.city === null) return null;
  const place = h("span", "agenda-place");
  if (line.flag !== null) place.append(h("span", "agenda-flag", line.flag));
  if (line.city !== null) place.append(...(line.flag === null ? [] : [" "]), `(${line.city})`);
  return place;
}

/** Les parties de la ligne, dans l'ordre, séparées par « – » ; celles qui manquent n'y sont pas. */
export function lineParts(line: Agenda12LineItem): (Node | string)[] {
  const parts = [dateOf(line), placeOf(line), h("span", "agenda-title", line.title)];
  return parts
    .filter((part): part is HTMLElement => part !== null)
    .flatMap((part, index) => (index === 0 ? [part] : [LINE_SEPARATOR, part]));
}
