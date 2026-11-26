// « Changer d'entreprise » (fiche 0063, spécification §§ 5.2 et 9.2) : la nouvelle entreprise (ou NODATA)
// et le jour du changement ; l'ancien passage est fermé à ce jour dans le parcours.
import type { CrmPersonItem } from "../bridge";
import { NODATA } from "../state/crm-lists";
import { actionButton, h } from "./crm-dom";
import type { FicheContext } from "./crm-fiche-ui";
import { dateField } from "./date-picker";

/** La liste des entreprises : NODATA en tête, puis celles du CRM. */
function companySelect(ctx: FicheContext, chosen: string): HTMLSelectElement {
  const select = h("select", "crm-fiche-input");
  select.setAttribute("aria-label", "Nouvelle entreprise");
  const options = [
    { value: "", label: NODATA },
    ...ctx.crm.companies.map((c) => ({ value: c.name, label: c.title })),
  ];
  for (const { value, label } of options) {
    const option = h("option", "", label);
    option.value = value;
    select.append(option);
  }
  select.value = chosen;
  return select;
}

/** Le formulaire : « Valider » change d'entreprise, « Annuler » le ferme. */
export function companyForm(ctx: FicheContext, person: CrmPersonItem): HTMLElement {
  const form = h("form", "crm-career-form");
  const changing = ctx.state.changing as { company: string; day: string };
  const select = companySelect(ctx, changing.company);
  let chosen = changing.day;
  const day = dateField({
    ...{ value: chosen, label: "Jour du changement", today: ctx.crm.today, clearable: false },
    className: "crm-fiche-input",
    change: (date) => {
      chosen = date;
      keep();
    },
  });
  const keep = () => void (ctx.state.changing = { company: select.value, day: chosen });
  select.addEventListener("change", keep);
  const cancel = actionButton("crm-new-button", "Annuler");
  cancel.addEventListener("click", () => {
    ctx.state.changing = null;
    ctx.act.redraw();
  });
  const confirm = h("button", "crm-new-button", "Valider");
  confirm.type = "submit";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (chosen === "") return;
    const company = select.value === "" ? null : select.value;
    void ctx.act
      .gesture(() =>
        ctx.backend.changeCrmPerson(ctx.path, person.name, {
          kind: "company",
          company,
          day: chosen,
        }),
      )
      .then((done) => {
        if (done) ctx.state.changing = null;
        ctx.act.redraw();
      });
  });
  form.append(select, day.element, confirm, cancel);
  return form;
}
