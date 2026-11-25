// L'onglet Entreprises (fiche 0063, spécification § 7.4) : une recherche, « Nouvelle entreprise »,
// NODATA (masquée pendant une recherche), puis les entreprises. L'arbre : chaque entreprise se
// déplie sur ses personnes, chaque personne sur ses actions ouvertes, la plus en retard d'abord.
import type { CrmPersonItem } from "../bridge";

type TallyItem = CrmPersonItem["tally"];
import { crmFichePath } from "../state/crm-fiche";
import { countText, matchesName, NODATA } from "../state/crm-lists";
import { h } from "./crm-dom";
import {
  actionsOf,
  badges,
  countElement,
  linkButton,
  listHead,
  type ListsContext,
  newBar,
  searchField,
  unfoldButton,
} from "./crm-lists-ui";

/** La clé de NODATA dans ce qui est déplié. */
export const NODATA_KEY = "nodata";

/** Une ligne de l'arbre : le « ▸ », le nom, ce qu'elle dit d'elle-même, ses compteurs. */
function nodeRow(
  ctx: ListsContext,
  parts: { key: string; title: string; name: HTMLElement; count?: string; tally: TallyItem },
): HTMLElement {
  const row = h("div", "crm-node-row");
  row.append(unfoldButton(ctx, parts.key, parts.title), parts.name);
  if (parts.count !== undefined) row.append(countElement("crm-people-count", parts.count));
  const open = countText(parts.tally.open, "ouverte");
  row.append(...badges(parts.tally), countElement("crm-open-count", open));
  return row;
}

/** Une personne sous son entreprise : ses actions ouvertes, la plus en retard d'abord. */
function personNode(ctx: ListsContext, owner: string, person: CrmPersonItem): HTMLElement {
  const key = `member:${owner}:${person.name}`;
  const node = h("li", "crm-node crm-node-person");
  node.dataset.person = person.name;
  const name = linkButton("crm-name", person.title, () =>
    ctx.act.openFiche(crmFichePath(ctx.path, "person", person.name)),
  );
  node.append(nodeRow(ctx, { key, title: person.title, name, tally: person.tally }));
  if (ctx.state.unfolded.has(key))
    node.append(actionsOf(ctx, person.openActions, "person", "Aucune action ouverte."));
  return node;
}

/** Les personnes d'une entreprise, sous sa ligne, quand elle est dépliée. */
function members(ctx: ListsContext, owner: string, references: readonly string[]): HTMLElement {
  const list = h("ul", "crm-tree-people");
  for (const reference of references) {
    const person = ctx.crm.people.find((p) => p.name === reference);
    if (person !== undefined) list.append(personNode(ctx, owner, person));
  }
  if (list.childElementCount === 0) return h("p", "crm-list-empty", "Aucune personne.");
  return list;
}

function node(
  ctx: ListsContext,
  entry: {
    key: string;
    title: string;
    name: HTMLElement;
    people: readonly string[];
    tally: TallyItem;
  },
): HTMLElement {
  const item = h("li", "crm-node crm-node-company");
  item.dataset.company = entry.key;
  const count = countText(entry.people.length, "personne");
  item.append(nodeRow(ctx, { ...entry, count }));
  if (ctx.state.unfolded.has(entry.key)) item.append(members(ctx, entry.key, entry.people));
  return item;
}

/** Ce que montre l'onglet Entreprises. */
export function companiesTab(ctx: ListsContext): HTMLElement {
  const { crm, state } = ctx;
  const search = searchField("Rechercher une entreprise", state.companies, (value) => {
    state.companies = value;
    ctx.act.redraw();
  });
  const add = newBar(
    ctx,
    "company",
    { button: "Nouvelle entreprise", field: "Nom de l'entreprise" },
    (name) => ctx.act.gesture(() => ctx.backend.createCrmCompany(ctx.path, name)),
  );
  const tree = h("ul", "crm-tree");
  if (state.companies.trim() === "") {
    const nodata = h("span", "crm-name nodata", NODATA);
    tree.append(node(ctx, { ...crm.nodata, key: NODATA_KEY, title: NODATA, name: nodata }));
  }
  for (const company of crm.companies.filter((c) => matchesName(c.title, state.companies))) {
    const name = linkButton("crm-name", company.title, () =>
      ctx.act.openFiche(crmFichePath(ctx.path, "company", company.name)),
    );
    tree.append(node(ctx, { ...company, key: company.name, name }));
  }
  const list = h("div", "crm-list crm-companies");
  list.append(...listHead([search, add.button], add.form), tree);
  return list;
}
