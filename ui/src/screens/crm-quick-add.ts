// L'ajout rapide (fiche 0060, spécification § 7.1) : la ligne qui crée une action avec son seul
// titre, au pied d'une colonne ouverte du Kanban. « Plus de détails » ouvre la fenêtre de l'action.
import type { CrmItem } from "../bridge";
import { actionButton, h } from "./crm-dom";

/** Le texte du choix « aucune personne », en tête de la liste. */
export const NOBODY = "— Sans personne —";

/** La ligne d'ajout rapide ouverte : où, ce qui est tapé, la personne choisie (`""` : aucune). */
export interface QuickAdd {
  /** L'endroit : la colonne, `status:TODO`. */
  readonly key: string;
  readonly title: string;
  readonly person: string;
}

/** Ce que fait la ligne, dit par l'écran. */
export interface QuickAddActions {
  readonly title: (text: string) => void;
  readonly person: (reference: string) => void;
  readonly submit: () => void;
  readonly close: () => void;
  /** « Plus de détails » : la fenêtre de l'action, avec le titre et la personne déjà remplis. */
  readonly details: () => void;
}

/** Les personnes du CRM par ordre alphabétique : « Marie Durand · Acme », sans entreprise pour NODATA. */
export function personChoices(crm: CrmItem): { value: string; label: string }[] {
  const companies = new Map(crm.companies.map((company) => [company.name, company.title]));
  return crm.people
    .map((person) => {
      const company = person.company === null ? undefined : companies.get(person.company);
      return {
        value: person.name,
        label: company === undefined ? person.title : `${person.title} · ${company}`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

/** La liste « Personne » : « — Sans personne — » en tête, puis chaque personne avec son entreprise. */
function personSelect(crm: CrmItem, chosen: string, change: (value: string) => void) {
  const select = h("select", "crm-quick-person");
  select.setAttribute("aria-label", "Personne");
  const options = [{ value: "", label: NOBODY }, ...personChoices(crm)];
  for (const { value, label } of options) {
    const option = h("option", "", label);
    option.value = value;
    select.append(option);
  }
  select.value = chosen;
  select.addEventListener("change", () => change(select.value));
  return select;
}

/** Le texte du bouton qui ouvre la fenêtre de l'action. */
export const DETAILS_TEXT = "Plus de détails";

/** La ligne ouverte : un champ « Titre de l'action », la liste « Personne », « Plus de détails ». Entrée crée, Échap ferme. */
export function quickAddForm(crm: CrmItem, state: QuickAdd, act: QuickAddActions): HTMLFormElement {
  const form = h("form", "crm-quick-add");
  const title = h("input", "crm-quick-title");
  title.placeholder = "Titre de l'action";
  title.setAttribute("aria-label", "Titre de l'action");
  title.dataset.keep = "quick";
  title.value = state.title;
  title.spellcheck = false;
  title.addEventListener("input", () => act.title(title.value));
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // Échap ferme la ligne, pas la fenêtre ni la colonne qui l'entourent.
    event.stopPropagation();
    act.close();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    act.submit();
  });
  const details = actionButton("crm-quick-details link", DETAILS_TEXT);
  details.addEventListener("click", act.details);
  form.append(title, personSelect(crm, state.person, act.person), details);
  return form;
}

/** Le bouton « + Ajouter une action » qui ouvre la ligne. */
export function quickAddButton(open: () => void): HTMLButtonElement {
  const button = actionButton("crm-add-action link", "+ Ajouter une action");
  button.addEventListener("click", open);
  return button;
}
