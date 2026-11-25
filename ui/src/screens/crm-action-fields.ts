// Les champs de la fenêtre d'une action (fiche 0062, spécification § 8) : les personnes ; le statut,
// la date et le canal ; le projet ; la couleur ; le titre ; la description. Chaque contrôle dit son geste
// par `act.change` ; le texte, qui s'enregistre en quittant le champ, passe par `act.commit`.
import type { CrmActionChangeItem, CrmActionItem, CrmItem } from "../bridge";
import type { BodyChangeItem } from "../bridge/generated/BodyChangeItem";
import { type ActionFields, CHANNELS, emailsToCopy } from "../state/crm-action-window";
import { PALETTE } from "../state/palette";
import { actionButton, h } from "./crm-dom";
import { personChoices } from "./crm-quick-add";

/** Ce que la fenêtre montre : les fiches du CRM, les champs, l'action lue (rien pour une nouvelle). */
export interface WindowModel {
  readonly crm: CrmItem;
  readonly fields: ActionFields;
  readonly action: CrmActionItem | null;
}

/** Les champs de texte dont la valeur s'enregistre en quittant le champ. */
export type TextField = "title" | "description" | "date";

/** Ce que font les contrôles de la fenêtre, dit par la fenêtre. */
export interface WindowActions {
  readonly change: (change: CrmActionChangeItem) => void;
  readonly body: (change: BodyChangeItem) => void;
  /** La valeur d'un champ de texte est prise : en quittant le champ, ou à Entrée. */
  readonly commit: (field: TextField, input: HTMLInputElement | HTMLTextAreaElement) => void;
  /** Entrée dans le titre : enregistre le titre ; pour une nouvelle action, crée l'action. */
  readonly enter: (input: HTMLInputElement) => void;
  /** Le texte tapé dans un champ d'ajout, gardé quand la fenêtre se redessine. */
  readonly drafts: {
    get(key: string): string;
    set(key: string, value: string): void;
  };
  readonly copyEmails: () => void;
  readonly openPerson: ((reference: string) => void) | undefined;
  readonly linkNote: () => void;
  readonly openNote: (title: string) => void;
  readonly openAddress: (url: string) => void;
  /** La place du commentaire en cours de modification, dans l'ordre écrit. */
  readonly editing: { get(): number | null; set(index: number | null): void };
}

/** Le texte de la liste qui ajoute une personne. */
export const ADD_PERSON = "+ Ajouter une personne";
/** Le texte du choix « aucun projet ». */
export const NO_PROJECT = "Sans projet";
/** Le texte du choix « aucune couleur ». */
export const NO_COLOR = "Sans couleur";
/** Le texte du choix « aucun canal ». */
export const NO_CHANNEL = "Sans canal";
/** Le texte qui dit que les e-mails sont dans le presse-papiers. */
export const COPY_EMAILS = "Copier les e-mails";

/** Une partie de la fenêtre : un titre, puis ses contrôles. */
export function section(className: string, label: string | null, ...content: HTMLElement[]) {
  const box = h("section", `crm-aw-section ${className}`);
  if (label !== null) box.append(h("h3", "crm-aw-label", label));
  box.append(...content);
  return box;
}

/** Un contrôle précédé de son nom, que le clavier et les lecteurs d'écran lisent aussi. */
function labelled(label: string, control: HTMLElement, className = "crm-aw-field"): HTMLElement {
  const box = h("label", className);
  box.append(h("span", "crm-aw-label", label), control);
  return box;
}

function selectOf(
  { label, field }: { label: string; field: string },
  options: readonly { value: string; label: string }[],
  chosen: string,
  change: (value: string) => void,
): HTMLSelectElement {
  const select = h("select", "crm-aw-select");
  select.setAttribute("aria-label", label);
  select.dataset.field = field;
  for (const { value, label: text } of options) {
    const option = h("option", "", text);
    option.value = value;
    select.append(option);
  }
  select.value = chosen;
  select.addEventListener("change", () => change(select.value));
  return select;
}

/** Les personnes de l'action : « Nom · Entreprise » avec « × », un lien vers la fiche, l'ajout, « Copier les e-mails ». */
export function peopleSection(model: WindowModel, act: WindowActions): HTMLElement {
  const { crm, fields } = model;
  const list = h("ul", "crm-aw-people");
  for (const { person, company } of fields.people) {
    const found = crm.people.find((p) => p.name === person);
    const where = crm.companies.find((c) => c.name === company)?.title;
    const row = h("li", "crm-aw-person");
    const name = found?.title ?? person;
    const shown = act.openPerson
      ? actionButton("crm-aw-person-name link", name, `Fiche de ${name}`)
      : h("span", "crm-aw-person-name", name);
    if (act.openPerson) shown.addEventListener("click", () => act.openPerson?.(person));
    const remove = actionButton("crm-aw-remove", "×", `Retirer ${name}`);
    remove.addEventListener("click", () => act.change({ kind: "removePerson", person }));
    row.append(shown, ...(where === undefined ? [] : [h("span", "crm-aw-company", ` · ${where}`)]));
    row.append(remove);
    list.append(row);
  }
  const present = new Set(fields.people.map((p) => p.person));
  const choices = personChoices(crm).filter((choice) => !present.has(choice.value));
  const add = selectOf(
    { label: ADD_PERSON, field: "add-person" },
    [{ value: "", label: ADD_PERSON }, ...choices],
    "",
    (value) => value !== "" && act.change({ kind: "addPerson", person: value }),
  );
  const parts: HTMLElement[] = [list, add];
  if (emailsToCopy(fields.people, crm) !== "") {
    const copy = actionButton("crm-aw-copy link", COPY_EMAILS);
    copy.addEventListener("click", act.copyEmails);
    parts.push(copy);
  }
  return section("crm-aw-people-section", "Personnes", ...parts);
}

/** Le statut (une colonne du CRM), la date et le canal, côte à côte. */
export function statusSection(model: WindowModel, act: WindowActions): HTMLElement {
  const { crm, fields } = model;
  const statuses = crm.columns.map((c) => ({ value: c.status, label: c.status }));
  const status = selectOf({ label: "Statut", field: "status" }, statuses, fields.status, (value) =>
    act.change({ kind: "status", status: value }),
  );
  const date = h("input", "crm-aw-date");
  date.type = "date";
  date.value = fields.date;
  date.setAttribute("aria-label", "Date");
  date.dataset.field = "date";
  date.addEventListener("change", () => act.commit("date", date));
  const channels = [
    { value: "", label: NO_CHANNEL },
    ...CHANNELS.map((c) => ({ value: c, label: c })),
  ];
  const channel = selectOf(
    { label: "Canal", field: "channel" },
    channels,
    fields.channel ?? "",
    (value) => act.change({ kind: "channel", channel: value === "" ? null : value }),
  );
  const row = h("div", "crm-aw-row");
  row.append(labelled("Statut", status), labelled("Date", date), labelled("Canal", channel));
  return section("crm-aw-status", null, row);
}

/** Le projet : « Sans projet » en tête. */
export function projectSection(model: WindowModel, act: WindowActions): HTMLElement {
  const { crm, fields } = model;
  const projects = crm.projects.map((p) => ({ value: p.name, label: p.title }));
  const known = projects.some((p) => p.value === fields.project);
  const select = selectOf(
    { label: "Projet", field: "project" },
    [{ value: "", label: NO_PROJECT }, ...projects],
    known ? (fields.project as string) : "",
    (value) => act.change({ kind: "project", project: value === "" ? null : value }),
  );
  return section("crm-aw-project", null, labelled("Projet", select));
}

/** La couleur : une pastille par couleur de la palette, et « Sans couleur ». */
export function colorSection(model: WindowModel, act: WindowActions): HTMLElement {
  const row = h("div", "crm-aw-colors");
  const none = actionButton("crm-aw-no-color link", NO_COLOR);
  none.setAttribute("aria-pressed", String(model.fields.color === null));
  none.addEventListener("click", () => act.change({ kind: "color", color: null }));
  row.append(none);
  for (const color of PALETTE) {
    const swatch = actionButton("crm-aw-swatch", "", color);
    swatch.style.setProperty("--swatch-color", `var(--palette-${color})`);
    swatch.setAttribute("aria-pressed", String(model.fields.color === color));
    swatch.addEventListener("click", () => act.change({ kind: "color", color }));
    row.append(swatch);
  }
  return section("crm-aw-color", "Couleur", row);
}

/** Le titre : une ligne ; Entrée ou quitter le champ l'enregistre. */
export function titleSection(model: WindowModel, act: WindowActions): HTMLElement {
  const title = h("input", "crm-aw-title");
  title.value = model.fields.title;
  title.setAttribute("aria-label", "Titre");
  title.dataset.field = "title";
  title.addEventListener("change", () => act.commit("title", title));
  title.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    act.enter(title);
  });
  return section("crm-aw-title-section", null, labelled("Titre", title));
}

/** La description : du Markdown, en saisie de texte ; quitter le champ l'enregistre. */
export function descriptionSection(model: WindowModel, act: WindowActions): HTMLElement {
  const area = h("textarea", "crm-aw-description");
  area.value = model.fields.description;
  area.rows = 6;
  area.setAttribute("aria-label", "Description");
  area.dataset.field = "description";
  area.addEventListener("change", () => act.commit("description", area));
  return section("crm-aw-description-section", null, labelled("Description", area));
}
