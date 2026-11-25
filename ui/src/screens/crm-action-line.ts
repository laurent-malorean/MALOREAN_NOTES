// Une action dans une liste (fiche 0063, spécification § 7.6) : un bouton qui dit, avant le titre,
// `date · statut · [personnes · entreprises] · [projet] · titre`. Un clic ouvre la fenêtre de l'action.
import type { ActionLine } from "../state/crm-lists";
import { actionButton, h } from "./crm-dom";

/** Le séparateur entre deux parties de la ligne. */
const SEPARATOR = " · ";

/** Les parties de la ligne, chacune avec sa classe, dans l'ordre du § 7.6. */
function partsOf(line: ActionLine): { className: string; text: string; color?: string }[] {
  const parts: { className: string; text: string; color?: string }[] = [];
  if (line.date !== null) parts.push({ className: "crm-line-date", text: line.date });
  parts.push({ className: "crm-line-status", text: line.status });
  if (line.people !== null) parts.push({ className: "crm-line-people", text: line.people });
  if (line.companies !== null)
    parts.push({ className: "crm-line-companies", text: line.companies });
  if (line.project !== null)
    parts.push({
      ...{ className: "crm-line-project", text: line.project.title },
      color: line.project.color,
    });
  parts.push({ className: "crm-line-title", text: line.title });
  return parts;
}

/** Le bouton de la ligne : `data-action` porte la référence de l'action. */
export function lineButton(line: ActionLine, open: (reference: string) => void): HTMLButtonElement {
  const button = actionButton("crm-line", "");
  button.dataset.action = line.name;
  partsOf(line).forEach((part, index) => {
    if (index > 0) button.append(h("span", "crm-line-sep", SEPARATOR));
    const element = h("span", part.className, part.text);
    if (part.color !== undefined)
      element.style.setProperty("--label-color", `var(--palette-${part.color})`);
    button.append(element);
  });
  button.addEventListener("click", () => open(line.name));
  return button;
}

/** Les lignes d'actions en liste ; `empty` dit qu'il n'y en a aucune. */
export function actionList(
  lines: readonly ActionLine[],
  open: (reference: string) => void,
  empty: string,
): HTMLElement {
  if (lines.length === 0) return h("p", "crm-list-empty", empty);
  const list = h("ul", "crm-action-list");
  for (const line of lines) {
    const item = h("li", "crm-action-item");
    item.append(lineButton(line, open));
    list.append(item);
  }
  return list;
}
