// La fiche d'une entreprise (fiche 0063, spécification § 9.1) : ses champs, ses notes libres, ses
// personnes (leurs 10 dernières actions), les anciennes personnes, « Nouvelle personne ».
import type { CrmActionItem, CrmCompanyItem, CrmPersonItem } from "../bridge";
import { crmFichePath, formerPeople, LAST_ACTIONS, lastActions } from "../state/crm-fiche";
import { actionLine } from "../state/crm-lists";
import { actionList } from "./crm-action-line";
import { h, actionButton } from "./crm-dom";
import { type FicheContext, editable, fieldRow, heading, notesField } from "./crm-fiche-ui";

/** Les champs d'une entreprise : le nom du champ dans le fichier et son libellé. */
export const COMPANY_FIELDS = [
  ["site", "Site"],
  ["sector", "Secteur"],
  ["address", "Adresse"],
  ["phone", "Téléphone"],
] as const;

const VALUES: Record<string, (company: CrmCompanyItem) => string | null> = {
  site: (c) => c.site,
  sector: (c) => c.sector,
  address: (c) => c.address,
  phone: (c) => c.phone,
};

/** Les actions d'une personne, en lignes `date · statut · [projet] · titre` : un clic ouvre la fenêtre de l'action. */
function lines(ctx: FicheContext, actions: readonly CrmActionItem[]): HTMLElement {
  const found = actions.map((a) => actionLine(a, ctx.lookups, ctx.crm.today, "person"));
  return actionList(found, ctx.act.openAction, "Aucune action.");
}

/** Une personne, avec ses actions et le lien vers sa fiche. */
function personBlock(
  ctx: FicheContext,
  person: CrmPersonItem,
  actions: readonly CrmActionItem[],
): HTMLElement {
  const block = h("section", "crm-fiche-person");
  block.dataset.person = person.name;
  const open = () => ctx.act.openFiche(crmFichePath(ctx.path, "person", person.name));
  const head = h("div", "crm-fiche-person-head");
  const name = actionButton("crm-name link", person.title);
  name.addEventListener("click", open);
  const all = actionButton("crm-fiche-all link", "Toutes les actions");
  all.setAttribute("aria-label", `Toutes les actions de ${person.title}`);
  all.addEventListener("click", open);
  head.append(name, h("span", "crm-fiche-role", person.role ?? ""), all);
  block.append(head, lines(ctx, actions.slice(0, LAST_ACTIONS)));
  return block;
}

/** « Nouvelle personne » : le bouton, puis le champ du nom ; la personne entre dans cette entreprise. */
function newPerson(ctx: FicheContext, company: CrmCompanyItem): HTMLElement[] {
  const button = actionButton("crm-new-button", "Nouvelle personne");
  button.addEventListener("click", () => {
    ctx.state.adding = true;
    ctx.state.name = "";
    ctx.act.focus("new");
    ctx.act.redraw();
  });
  if (!ctx.state.adding) return [button];
  const form = h("form", "crm-new-form");
  const input = h("input", "crm-new-name");
  input.placeholder = "Nom de la personne";
  input.setAttribute("aria-label", "Nom de la personne");
  input.dataset.keep = "new";
  input.spellcheck = false;
  input.value = ctx.state.name;
  input.addEventListener("input", () => void (ctx.state.name = input.value));
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    ctx.state.adding = false;
    ctx.act.redraw();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = ctx.state.name.trim();
    if (name === "") return;
    void ctx.act
      .gesture(() => ctx.backend.createCrmPerson(ctx.path, name, company.name))
      .then((done) => {
        if (done) ctx.state.adding = false;
        ctx.act.redraw();
      });
  });
  form.append(input);
  return [button, form];
}

/** « Supprimer l'entreprise » : une confirmation dit que ses personnes passent à NODATA (§ 5.1). */
function deleteButton(ctx: FicheContext, company: CrmCompanyItem): HTMLButtonElement {
  const button = actionButton("crm-fiche-delete", "Supprimer l'entreprise");
  button.addEventListener("click", () => {
    const people = company.people.length;
    const effect =
      people === 0
        ? ""
        : people === 1
          ? " Sa personne passe à NODATA."
          : ` Ses ${String(people)} personnes passent à NODATA.`;
    const question = `Supprimer l'entreprise « ${company.title} » ?${effect}`;
    void ctx.act.confirm(question, "Supprimer").then((accepted) => {
      if (accepted)
        void ctx.act.gesture(() => ctx.backend.deleteCrmCompany(ctx.path, company.name));
    });
  });
  return button;
}

/** La section repliée des personnes passées par l'entreprise, avec les actions qu'elles y avaient. */
function formerSection(ctx: FicheContext, company: CrmCompanyItem): HTMLElement | null {
  const former = formerPeople(company, ctx.crm);
  if (former.length === 0) return null;
  const section = h("details", "crm-former");
  section.append(h("summary", "", `Anciennes personnes (${String(former.length)})`));
  for (const { person, actions } of former) section.append(personBlock(ctx, person, actions));
  return section;
}

/** Tout ce que montre la fiche de l'entreprise `company`. */
export function companyFiche(ctx: FicheContext, company: CrmCompanyItem): HTMLElement[] {
  const change = (value: string, field: string) =>
    ctx.backend.changeCrmCompany(ctx.path, company.name, { kind: "field", field, value });
  const title = editable(
    ctx,
    {
      ...{ key: "name", label: "Nom", value: company.title, required: true },
      save: (name) =>
        ctx.backend.changeCrmCompany(ctx.path, company.name, { kind: "rename", name }),
    },
    "crm-fiche-title",
  );
  const fields = COMPANY_FIELDS.map(([field, label]) =>
    fieldRow(ctx, {
      ...{
        key: field,
        label,
        value: (VALUES[field] as (c: CrmCompanyItem) => string | null)(company),
      },
      save: (value) => change(value, field),
    }),
  );
  const notes = notesField(ctx, company.notes, (text) =>
    ctx.backend.changeCrmCompany(ctx.path, company.name, { kind: "notes", notes: text }),
  );
  const people = company.people.flatMap((reference) => {
    const person = ctx.crm.people.find((p) => p.name === reference);
    return person === undefined ? [] : [personBlock(ctx, person, lastActions(person, ctx.lookups))];
  });
  const head = h("div", "crm-fiche-section-head");
  head.append(heading("Personnes"), ...newPerson(ctx, company));
  const former = formerSection(ctx, company);
  return [
    ...[title, ...fields, notes, head],
    ...(people.length === 0 ? [h("p", "crm-list-empty", "Aucune personne.")] : people),
    ...(former === null ? [] : [former]),
    deleteButton(ctx, company),
  ];
}
