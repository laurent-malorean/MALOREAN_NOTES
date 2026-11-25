// L'onglet Personnes (fiche 0063, spécification § 7.3) : une recherche par nom, « Nouvelle personne »,
// puis le tableau (nom, fonction, entreprise, actions ouvertes). Une personne se déplie sur ses
// actions, les ouvertes d'abord ; son nom ouvre sa fiche.
import type { CrmPersonItem } from "../bridge";
import { crmFichePath } from "../state/crm-fiche";
import { matchesName, NODATA } from "../state/crm-lists";
import { h } from "./crm-dom";
import {
  actionsOf,
  countElement,
  linkButton,
  listHead,
  type ListsContext,
  newBar,
  searchField,
  unfoldButton,
} from "./crm-lists-ui";

/** Ce qui est écrit en tête de chaque colonne du tableau. */
export const PEOPLE_COLUMNS = ["Nom", "Fonction", "Entreprise", "Actions ouvertes"] as const;

const unfoldKey = (person: CrmPersonItem) => `people:${person.name}`;

/** L'entreprise d'une personne : son titre, NODATA sans entreprise (ou si sa fiche n'existe plus, § 4.1). */
export function companyTitle(ctx: ListsContext, person: CrmPersonItem): string {
  const title = person.company === null ? undefined : ctx.lookups.companies.get(person.company);
  return title ?? NODATA;
}

function row(ctx: ListsContext, person: CrmPersonItem): HTMLElement[] {
  const tr = h("tr", "crm-row");
  tr.dataset.person = person.name;
  const name = h("td", "crm-cell-name");
  name.append(
    unfoldButton(ctx, unfoldKey(person), person.title),
    linkButton("crm-name", person.title, () =>
      ctx.act.openFiche(crmFichePath(ctx.path, "person", person.name)),
    ),
  );
  const open = h("td", "crm-cell-count");
  open.append(countElement("crm-open-count", String(person.tally.open)));
  tr.append(name, h("td", "", person.role ?? ""), h("td", "", companyTitle(ctx, person)), open);
  if (!ctx.state.unfolded.has(unfoldKey(person))) return [tr];
  const sub = h("tr", "crm-sub");
  const cell = h("td", "crm-sub-cell");
  cell.colSpan = PEOPLE_COLUMNS.length;
  const references = [...person.openActions, ...person.closedActions];
  cell.append(actionsOf(ctx, references, "person", "Aucune action."));
  sub.append(cell);
  return [tr, sub];
}

function table(ctx: ListsContext, people: readonly CrmPersonItem[]): HTMLElement {
  const element = h("table", "crm-table");
  const head = h("thead", "");
  const headRow = h("tr", "");
  for (const label of PEOPLE_COLUMNS) headRow.append(h("th", "", label));
  head.append(headRow);
  const body = h("tbody", "");
  for (const person of people) body.append(...row(ctx, person));
  element.append(head, body);
  return element;
}

/** Ce que montre l'onglet Personnes. */
export function peopleTab(ctx: ListsContext): HTMLElement {
  const { crm, state } = ctx;
  const search = searchField("Rechercher une personne", state.people, (value) => {
    state.people = value;
    ctx.act.redraw();
  });
  const add = newBar(
    ctx,
    "person",
    { button: "Nouvelle personne", field: "Nom de la personne" },
    (name) => ctx.act.gesture(() => ctx.backend.createCrmPerson(ctx.path, name, null)),
  );
  const shown = crm.people.filter((person) => matchesName(person.title, state.people));
  const empty = crm.people.length === 0 ? "Aucune personne." : "Aucune personne ne correspond.";
  const list = h("div", "crm-list crm-people");
  list.append(
    ...listHead([search, add.button], add.form),
    shown.length === 0 ? h("p", "crm-list-empty", empty) : table(ctx, shown),
  );
  return list;
}
