// Une carte du Kanban à l'écran (fiche 0060, spécification § 7.1) : de haut en bas, la date ou la
// pastille, le projet, le titre, les personnes, les étiquettes, les repères.
import type { CardView } from "../state/crm-card";
import { h } from "./crm-dom";

/** Une pastille de couleur de la palette, pour le projet et les étiquettes. */
function label(text: string, color: string, className: string): HTMLElement {
  const element = h("span", className, text);
  element.style.setProperty("--label-color", `var(--palette-${color})`);
  return element;
}

/** Les personnes, une par ligne ; une ligne vide sans personne, pour que les cartes gardent la même hauteur. */
function peopleList(card: CardView): HTMLElement {
  const list = h("ul", "crm-card-people");
  for (const line of card.people) list.append(h("li", "", line));
  if (card.people.length === 0) list.append(h("li", "crm-card-nobody", " "));
  if (card.morePeople > 0) list.append(h("li", "crm-card-more", `+${String(card.morePeople)}`));
  return list;
}

/** Les repères : une description, les éléments cochés, les commentaires, les notes liées. */
function marks(card: CardView): HTMLElement {
  const row = h("div", "crm-card-marks");
  const mark = (text: string, title: string) => {
    const element = h("span", "crm-card-mark", text);
    element.title = title;
    row.append(element);
  };
  if (card.hasDescription) mark("≡", "Description");
  if (card.checklist !== null) mark(card.checklist, "Éléments cochés");
  if (card.comments > 0) mark(`💬 ${String(card.comments)}`, "Commentaires");
  if (card.linkedNotes > 0) mark(`⧉ ${String(card.linkedNotes)}`, "Notes liées");
  return row;
}

/** La carte de l'action : un `article` qui garde sa référence dans `data-card`. */
export function cardElement(card: CardView): HTMLElement {
  const element = h("article", "crm-card");
  element.dataset.card = card.name;
  if (card.color !== null) {
    element.classList.add("colored");
    element.style.setProperty("--card-color", `var(--palette-${card.color})`);
  } else if (card.tone !== null) {
    element.classList.add(`tone-${card.tone}`);
  }
  if (card.when !== null)
    element.append(h("div", `crm-card-when ${card.when.kind}`, card.when.text));
  if (card.project !== null)
    element.append(label(card.project.title, card.project.color, "crm-card-project"));
  element.append(h("div", "crm-card-title", card.title), peopleList(card));
  if (card.tags.length > 0) {
    const tags = h("div", "crm-card-tags");
    for (const tag of card.tags) tags.append(label(tag.name, tag.color, "crm-tag"));
    element.append(tags);
  }
  const row = marks(card);
  if (row.childElementCount > 0) element.append(row);
  return element;
}
