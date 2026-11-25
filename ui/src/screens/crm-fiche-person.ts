// La fiche d'une personne (fiche 0063, spécification § 9.2) : ses champs, son entreprise, ses notes
// libres, son parcours, toutes ses actions, « Nouvelle action » et « Changer d'entreprise ».
import type { CrmActionItem, CrmPersonItem } from "../bridge";
import { careerLines, crmFichePath, personActions } from "../state/crm-fiche";
import { actionLine, NODATA } from "../state/crm-lists";
import { actionList } from "./crm-action-line";
import { actionButton, h } from "./crm-dom";
import { companyForm } from "./crm-fiche-career";
import { type FicheContext, editable, fieldRow, heading, notesField } from "./crm-fiche-ui";

/** Les champs d'une personne : le nom du champ dans le fichier et son libellé. */
export const PERSON_FIELDS = [
  ["fonction", "Fonction"],
  ["email", "E-mail"],
  ["telephone", "Téléphone"],
  ["linkedin", "LinkedIn"],
] as const;

const VALUES: Record<string, (person: CrmPersonItem) => string | null> = {
  fonction: (p) => p.role,
  email: (p) => p.email,
  telephone: (p) => p.phone,
  linkedin: (p) => p.linkedin,
};

/** Enregistre un champ ; pour l'e-mail, signale d'abord qu'il est déjà connu d'une autre personne (§ 4.7), sans bloquer. */
async function saveField(
  ctx: FicheContext,
  person: CrmPersonItem,
  field: string,
  value: string,
): Promise<unknown> {
  if (field === "email" && value !== "") {
    const known = await ctx.backend.crmEmailIsKnown(ctx.path, value, person.name);
    ctx.state.warned = known ? value : null;
  } else if (field === "email") ctx.state.warned = null;
  return ctx.backend.changeCrmPerson(ctx.path, person.name, { kind: "field", field, value });
}

/** L'entreprise : un lien vers sa fiche, ou NODATA (sans fiche), et « Changer d'entreprise ». */
function companyRow(ctx: FicheContext, person: CrmPersonItem): HTMLElement {
  const row = h("div", "crm-fiche-field crm-fiche-company");
  const title = person.company === null ? undefined : ctx.lookups.companies.get(person.company);
  const company = person.company;
  row.append(h("span", "crm-fiche-label", "Entreprise"));
  if (company === null || title === undefined) row.append(h("span", "crm-name nodata", NODATA));
  else {
    const link = actionButton("crm-name link", title);
    link.addEventListener("click", () =>
      ctx.act.openNote(crmFichePath(ctx.path, "company", company)),
    );
    row.append(link);
  }
  const change = actionButton("crm-new-button", "Changer d'entreprise");
  change.addEventListener("click", () => {
    const current = person.company ?? "";
    ctx.state.changing = { company: current, day: ctx.crm.today };
    ctx.act.redraw();
  });
  row.append(change);
  return row;
}

/** Les actions d'un groupe, en lignes `date · statut · [projet] · titre`. */
function group(ctx: FicheContext, title: string, actions: readonly CrmActionItem[], empty: string) {
  const section = h("section", "crm-fiche-actions");
  section.append(h("h3", "crm-fiche-subheading", `${title} (${String(actions.length)})`));
  const lines = actions.map((a) => actionLine(a, ctx.lookups, ctx.crm.today, "person"));
  const open = (reference: string) => ctx.act.hooks.onOpenAction(reference, ctx.path);
  section.append(actionList(lines, open, empty));
  return section;
}

/** « Supprimer la personne » : une confirmation, puis la personne est retirée de ses actions (§ 5.2). */
function deleteButton(ctx: FicheContext, person: CrmPersonItem): HTMLButtonElement {
  const button = actionButton("crm-fiche-delete", "Supprimer la personne");
  button.addEventListener("click", () => {
    const count = person.openActions.length + person.closedActions.length;
    const effect =
      count === 0
        ? ""
        : count === 1
          ? " Elle est retirée de son action, qui reste."
          : ` Elle est retirée de ses ${String(count)} actions, qui restent.`;
    const question = `Supprimer la personne « ${person.title} » ?${effect}`;
    void ctx.act.confirm(question, "Supprimer").then((accepted) => {
      if (accepted) void ctx.act.gesture(() => ctx.backend.deleteCrmPerson(ctx.path, person.name));
    });
  });
  return button;
}

/** Le parcours : une ligne par passage ; rien sans passage. */
function career(ctx: FicheContext, person: CrmPersonItem): HTMLElement[] {
  const lines = careerLines(person.career, ctx.lookups);
  if (lines.length === 0) return [];
  const list = h("ul", "crm-career");
  for (const line of lines) list.append(h("li", "", line));
  return [heading("Parcours"), list];
}

/** Tout ce que montre la fiche de la personne `person`. */
export function personFiche(ctx: FicheContext, person: CrmPersonItem): HTMLElement[] {
  const title = editable(
    ctx,
    {
      ...{ key: "name", label: "Nom", value: person.title, required: true },
      save: (name) => ctx.backend.changeCrmPerson(ctx.path, person.name, { kind: "rename", name }),
    },
    "crm-fiche-title",
  );
  const fields = PERSON_FIELDS.map(([field, label]) =>
    fieldRow(ctx, {
      ...{
        key: field,
        label,
        value: (VALUES[field] as (p: CrmPersonItem) => string | null)(person),
      },
      save: (value) => saveField(ctx, person, field, value),
    }),
  );
  const warning =
    ctx.state.warned !== null && ctx.state.warned === person.email
      ? [h("p", "crm-fiche-warning", "Cet e-mail est déjà connu d'une autre personne du CRM.")]
      : [];
  const notes = notesField(ctx, person.notes, (text) =>
    ctx.backend.changeCrmPerson(ctx.path, person.name, { kind: "notes", notes: text }),
  );
  const found = personActions(person, ctx.lookups);
  const newAction = actionButton("crm-new-button", "Nouvelle action");
  newAction.addEventListener("click", () => ctx.act.hooks.onNewAction(person.name, ctx.path));
  const head = h("div", "crm-fiche-section-head");
  head.append(heading("Actions"), newAction);
  return [
    ...[title, companyRow(ctx, person)],
    ...(ctx.state.changing === null ? [] : [companyForm(ctx, person)]),
    ...fields.slice(0, 2),
    ...warning,
    ...fields.slice(2),
    ...career(ctx, person),
    notes,
    head,
    group(ctx, "Ouvertes", found.open, "Aucune action ouverte."),
    group(ctx, "Terminées", found.closed, "Aucune action terminée."),
    deleteButton(ctx, person),
  ];
}
