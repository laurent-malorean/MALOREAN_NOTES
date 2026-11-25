// Ce que les trois listes du CRM (fiche 0063) ont en commun : leur mémoire, ce que l'écran leur prête,
// et leurs petits éléments (« ▸ », recherche, « Nouvelle … », compteurs).
import type * as Bridge from "../bridge";
import type { CrmItem } from "../bridge";
import type { Lookups } from "../state/crm-card";
import { type ActionLine, actionLine, type LineScope, tallyBadges } from "../state/crm-lists";
import { actionList } from "./crm-action-line";
import { actionButton, h } from "./crm-dom";

/** Ce que les listes demandent à Rust, par le pont. */
export type ListsBackend = Pick<
  typeof Bridge,
  | "createCrmPerson"
  | "createCrmCompany"
  | "createCrmProject"
  | "changeCrmProject"
  | "deleteCrmProject"
>;

/** Ce que sont en train de saisir les listes : une recherche, un nom à créer, un nom à changer. */
export interface ListsState {
  people: string;
  companies: string;
  /** La fiche en cours de création, et le nom tapé. */
  adding: "person" | "company" | "project" | null;
  name: string;
  /** Le projet dont le nom se change, et le nom tapé. */
  renaming: { readonly project: string; readonly value: string } | null;
  /** Le projet dont le choix de couleur est ouvert. */
  palette: string | null;
  /** Ce qui est déplié, gardé sur ce Mac. */
  readonly unfolded: Set<string>;
}

/** Ce que l'écran du CRM prête aux listes. */
export interface ListsActions {
  /** Redessine le CRM à partir de ce qui est déjà lu. */
  readonly redraw: () => void;
  /** Le champ `data-keep` de cette clé aura le curseur au prochain dessin. */
  readonly focus: (key: string) => void;
  /** Un geste : l'écran relit le CRM ensuite ; vrai s'il a réussi. */
  readonly gesture: (run: () => Promise<unknown>) => Promise<boolean>;
  readonly confirm: (question: string, confirm: string) => Promise<boolean>;
  /** Ouvre la note d'une entreprise ou d'une personne dans la colonne. */
  readonly openFiche: (path: string) => void;
  readonly openAction: (reference: string) => void;
  /** Montre le Kanban filtré sur ce seul projet. */
  readonly showProject: (project: string) => void;
  /** Garde ce qui est déplié. */
  readonly remember: () => void;
  /** Le dessin est en cours : un champ retiré n'a pas été quitté par l'utilisateur. */
  readonly redrawing: () => boolean;
}

export interface ListsContext {
  readonly crm: CrmItem;
  readonly path: string;
  readonly lookups: Lookups;
  readonly state: ListsState;
  readonly backend: ListsBackend;
  readonly act: ListsActions;
}

/** Plie ou déplie l'élément `key`, et le garde. */
export function toggleUnfolded(ctx: ListsContext, key: string): void {
  if (!ctx.state.unfolded.delete(key)) ctx.state.unfolded.add(key);
  ctx.act.remember();
  ctx.act.redraw();
}

/** Le bouton « ▸ » (« ▾ » déplié) devant une ligne. */
export function unfoldButton(ctx: ListsContext, key: string, name: string): HTMLButtonElement {
  const open = ctx.state.unfolded.has(key);
  const button = actionButton(
    "crm-unfold",
    open ? "▾" : "▸",
    `${open ? "Replier" : "Déplier"} ${name}`,
  );
  button.setAttribute("aria-expanded", String(open));
  button.addEventListener("click", () => toggleUnfolded(ctx, key));
  return button;
}

/** Un bouton qui a l'air d'un lien (le nom qui ouvre une fiche). */
export function linkButton(className: string, text: string, click: () => void): HTMLButtonElement {
  const button = actionButton(`${className} link`, text);
  button.addEventListener("click", click);
  return button;
}

/** Le champ de recherche d'une liste : chaque frappe la redessine, le curseur est retrouvé. */
export function searchField(
  label: string,
  value: string,
  typed: (value: string) => void,
): HTMLInputElement {
  const input = h("input", "crm-search crm-list-search");
  input.type = "search";
  input.placeholder = label;
  input.setAttribute("aria-label", label);
  input.dataset.keep = "search";
  input.value = value;
  input.addEventListener("input", () => typed(input.value));
  return input;
}

/** Le compteur rouge du retard et l'orange du jour, seulement quand il y en a. */
export function badges(tally: CrmItem["people"][number]["tally"]): HTMLElement[] {
  const { late, today } = tallyBadges(tally);
  const found: HTMLElement[] = [];
  if (late !== null) found.push(h("span", "crm-badge late", late));
  if (today !== null) found.push(h("span", "crm-badge today", today));
  return found;
}

/** Les actions `references` de la liste, chacune en ligne ; `empty` quand il n'y en a pas. */
export function actionsOf(
  ctx: ListsContext,
  references: readonly string[],
  scope: LineScope,
  empty: string,
): HTMLElement {
  const lines: ActionLine[] = references.flatMap((reference) => {
    const action = ctx.lookups.actions.get(reference);
    return action === undefined ? [] : [actionLine(action, ctx.lookups, ctx.crm.today, scope)];
  });
  return actionList(lines, ctx.act.openAction, empty);
}

/** Le champ de nom d'une création : Entrée crée, Échap abandonne. */
function nameForm(
  ctx: ListsContext,
  label: string,
  submit: (name: string) => Promise<boolean>,
): HTMLFormElement {
  const form = h("form", "crm-new-form");
  const input = h("input", "crm-new-name");
  input.placeholder = label;
  input.setAttribute("aria-label", label);
  input.dataset.keep = "new";
  input.spellcheck = false;
  input.value = ctx.state.name;
  input.addEventListener("input", () => void (ctx.state.name = input.value));
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    ctx.state.adding = null;
    ctx.state.name = "";
    ctx.act.redraw();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void createdOnce(ctx, submit);
  });
  form.append(input);
  return form;
}

/** « Entrée » : un nom vide ne crée rien ; un nom refusé reste dans le champ. */
async function createdOnce(ctx: ListsContext, submit: (name: string) => Promise<boolean>) {
  const name = ctx.state.name.trim();
  if (name === "") return;
  if (!(await submit(name))) return;
  ctx.state.adding = null;
  ctx.state.name = "";
  ctx.act.redraw();
}

/** « Nouvelle … » : le bouton, et le champ de nom quand il est ouvert. */
export function newBar(
  ctx: ListsContext,
  kind: NonNullable<ListsState["adding"]>,
  texts: { readonly button: string; readonly field: string },
  submit: (name: string) => Promise<boolean>,
): { readonly button: HTMLButtonElement; readonly form: HTMLFormElement | null } {
  const button = actionButton("crm-new-button", texts.button);
  button.addEventListener("click", () => {
    ctx.state.adding = kind;
    ctx.state.name = "";
    ctx.act.focus("new");
    ctx.act.redraw();
  });
  return { button, form: ctx.state.adding === kind ? nameForm(ctx, texts.field, submit) : null };
}

/** La barre du haut d'une liste (sa recherche, son bouton « Nouvelle … »), puis le champ de nom ouvert. */
export function listHead(
  parts: readonly HTMLElement[],
  form: HTMLFormElement | null,
): HTMLElement[] {
  const bar = h("div", "crm-toolbar");
  bar.append(...parts);
  return form === null ? [bar] : [bar, form];
}

/** Un nombre seul dans une cellule ou une ligne : « 3 ouvertes ». */
export const countElement = (className: string, text: string): HTMLElement =>
  h("span", className, text);
