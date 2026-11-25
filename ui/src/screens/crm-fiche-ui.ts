// Ce que les fiches d'entreprise et de personne ont en commun (fiche 0063, spécification § 9) : leur
// mémoire, ce que l'écran leur prête, un champ modifiable en cliquant dessus, les notes libres.
import type * as Bridge from "../bridge";
import type { CrmItem } from "../bridge";
import type { Lookups } from "../state/crm-card";
import { actionButton, h } from "./crm-dom";
import type { ActionHooks } from "./crm-hooks";

/** Ce que les fiches demandent à Rust, par le pont. */
export type FicheBackend = Pick<
  typeof Bridge,
  | "createCrmPerson"
  | "changeCrmPerson"
  | "deleteCrmPerson"
  | "changeCrmCompany"
  | "deleteCrmCompany"
  | "crmEmailIsKnown"
>;

/** Ce que la fiche a en cours de saisie : un champ, les notes, une personne à créer, un changement d'entreprise. */
export interface FicheState {
  editing: { readonly key: string; readonly value: string } | null;
  /** Les notes tapées et pas encore enregistrées. */
  notes: string | null;
  adding: boolean;
  name: string;
  changing: { readonly company: string; readonly day: string } | null;
  /** L'e-mail que la saisie a signalé comme déjà connu. */
  warned: string | null;
}

export const newFicheState = (): FicheState => ({
  ...{ editing: null, notes: null, adding: false, name: "" },
  changing: null,
  warned: null,
});

/** Ce que l'écran de la fiche lui prête. */
export interface FicheActions {
  readonly redraw: () => void;
  /** Le champ `data-keep` de cette clé aura le curseur au prochain dessin. */
  readonly focus: (key: string) => void;
  /** Un geste : l'écran relit le CRM ensuite ; vrai s'il a réussi. */
  readonly gesture: (run: () => Promise<unknown>) => Promise<boolean>;
  readonly confirm: (question: string, confirm: string) => Promise<boolean>;
  /** Ouvre une autre fiche, dans la colonne. */
  readonly openNote: (path: string) => void;
  readonly hooks: ActionHooks;
  /** Le dessin est en cours : un champ retiré n'a pas été quitté par l'utilisateur. */
  readonly redrawing: () => boolean;
}

export interface FicheContext {
  readonly crm: CrmItem;
  readonly path: string;
  readonly lookups: Lookups;
  readonly state: FicheState;
  readonly backend: FicheBackend;
  readonly act: FicheActions;
}

/** Un champ de la fiche : son nom à l'écran, ce qu'il vaut, comment l'enregistrer. */
export interface FieldSpec {
  readonly key: string;
  readonly label: string;
  readonly value: string | null;
  readonly save: (value: string) => Promise<unknown>;
  /** Faux : le champ peut être vidé (une valeur vide l'efface). Vrai : un champ vidé reprend sa valeur. */
  readonly required?: boolean;
}

/** Enregistre ce qui est tapé : rien si c'est inchangé, ou vide pour un champ obligatoire. */
function commit(ctx: FicheContext, spec: FieldSpec): void {
  const edit = ctx.state.editing;
  if (edit?.key !== spec.key) return;
  ctx.state.editing = null;
  const value = edit.value.trim();
  const unchanged = value === (spec.value ?? "") || (spec.required === true && value === "");
  if (unchanged) return ctx.act.redraw();
  void ctx.act.gesture(() => spec.save(value));
}

function fieldInput(ctx: FicheContext, spec: FieldSpec, value: string): HTMLInputElement {
  const input = h("input", "crm-fiche-input");
  input.setAttribute("aria-label", spec.label);
  input.dataset.keep = spec.key;
  input.spellcheck = false;
  input.value = value;
  input.addEventListener(
    "input",
    () => void (ctx.state.editing = { key: spec.key, value: input.value }),
  );
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") commit(ctx, spec);
    if (event.key !== "Escape") return;
    event.stopPropagation();
    ctx.state.editing = null;
    ctx.act.redraw();
  });
  // Le dessin de l'écran retire le champ : ce n'est pas un départ de l'utilisateur.
  input.addEventListener(
    "blur",
    () => ctx.act.redrawing() || !input.isConnected || commit(ctx, spec),
  );
  return input;
}

/** Un champ modifiable en cliquant dessus : sa valeur (ou « — »), puis un champ ; Entrée ou quitter enregistre, Échap abandonne. */
export function editable(ctx: FicheContext, spec: FieldSpec, className: string): HTMLElement {
  const edit = ctx.state.editing?.key === spec.key ? ctx.state.editing : null;
  if (edit !== null) return fieldInput(ctx, spec, edit.value);
  const empty = spec.value === null || spec.value === "";
  const button = actionButton(`${className} crm-fiche-value`, empty ? "—" : (spec.value as string));
  button.classList.toggle("empty", empty);
  button.setAttribute("aria-label", `Modifier : ${spec.label}`);
  button.title = "Cliquer pour modifier";
  button.addEventListener("click", () => {
    ctx.state.editing = { key: spec.key, value: spec.value ?? "" };
    ctx.act.focus(spec.key);
    ctx.act.redraw();
  });
  return button;
}

/** Une ligne « Libellé : valeur » dont la valeur se modifie en cliquant dessus. */
export function fieldRow(ctx: FicheContext, spec: FieldSpec): HTMLElement {
  const row = h("div", "crm-fiche-field");
  row.dataset.field = spec.key;
  row.append(h("span", "crm-fiche-label", spec.label), editable(ctx, spec, "crm-fiche-text"));
  return row;
}

/** Les notes libres : un texte qui s'enregistre en quittant le champ. */
export function notesField(
  ctx: FicheContext,
  notes: string,
  save: (text: string) => Promise<unknown>,
): HTMLTextAreaElement {
  const area = h("textarea", "crm-fiche-notes");
  area.setAttribute("aria-label", "Notes");
  area.placeholder = "Notes libres";
  area.dataset.keep = "notes";
  area.rows = 6;
  area.value = ctx.state.notes ?? notes;
  area.addEventListener("input", () => void (ctx.state.notes = area.value));
  area.addEventListener("blur", () => {
    if (ctx.act.redrawing() || !area.isConnected || ctx.state.notes === null) return;
    const typed = ctx.state.notes;
    if (typed === notes) return void (ctx.state.notes = null);
    void ctx.act
      .gesture(() => save(typed))
      .then((done) => {
        if (done) ctx.state.notes = null;
        ctx.act.redraw();
      });
  });
  return area;
}

/** Un titre de section. */
export const heading = (text: string): HTMLElement => h("h2", "crm-fiche-heading", text);
