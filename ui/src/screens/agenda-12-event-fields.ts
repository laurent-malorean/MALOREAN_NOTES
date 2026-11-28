// Les champs de la bande d'un événement (spécification § 4.2) : le titre, en grand ; « Quand » (jour, mois, année,
// puis « au », jour et mois de la fin) ; « Où » (pays, ville). Chaque champ ne fait que dire son geste ; Rust le
// valide (dates, mois, pays) et l'écran montre sa réponse. L'écran garde en plus la fin cohérente avec le début
// (§§ 4.3 et 4.4) : il grise les jours impossibles, ramène la fin au début, montre une fin incohérente en erreur.
import type { Agenda12EventChangeItem, Agenda12EventItem, CountryItem } from "../bridge";
import { monthName } from "../state/agenda-12";
import {
  endBeforeStart,
  endDayAvailable,
  endWraps,
  mustBringEndBack,
  type StartGesture,
  startDayAvailable,
  yearChoices,
} from "../state/agenda-12-when";
import { type CountryField, createCountryField } from "./agenda-12-country";
import { createDayPicker, type DayPicker } from "./agenda-12-day-picker";
import { h } from "./crm-dom";
import "./agenda-12-when.css";

/** Ce que l'écran dit quand il a effacé la fin parce que le début la dépassait. */
export const END_BROUGHT_BACK = "La fin a été ramenée au début.";
/** Ce que l'écran dit d'une fin avant le début qu'il a reçue telle quelle, et d'une fin qui tombe l'année suivante. */
export const END_BEFORE_START = "La fin est avant le début.";
export const END_NEXT_YEAR = "Fin l'année suivante.";
/** Le choix vide d'une liste, et le nom de la fenêtre des jours de fin. */
const NO_VALUE_TEXT = "—";
const END_DAY_TITLE = "Choisir le jour de fin";

export const FIELD_LABELS = {
  title: "Titre",
  month: "Mois",
  day: "Jour",
  year: "Année",
  endDay: "Fin : jour",
  endMonth: "Fin : mois",
  city: "Ville",
} as const;

/** Le champ du pays a son propre nom, posé par le champ lui-même. */
const COUNTRY_FIELD = "Pays";

/** Les deux groupes de champs, et le mot qui relie le début de la date à sa fin. */
export const WHEN_TEXT = "Quand";
export const WHERE_TEXT = "Où";
export const UNTIL_TEXT = "au";

/** Ce que les champs demandent à la bande. */
export interface FieldsDeps {
  /** Les gestes d'un champ, joués l'un après l'autre ; `notice` : ce que l'écran dit quand ils ont tous réussi. */
  readonly change: (changes: readonly Agenda12EventChangeItem[], notice?: string) => void;
  /** L'année en cours, d'après l'horloge. */
  readonly currentYear: () => number;
  readonly loadCountries: () => Promise<readonly CountryItem[]>;
  readonly error: (error: unknown) => void;
}

export interface EventFields {
  readonly element: HTMLElement;
  readonly title: HTMLInputElement;
  /** Montre l'événement ; `force` remplace aussi ce qui est tapé dans un champ qui a le curseur. */
  show(event: Agenda12EventItem, force: boolean): void;
}

/**
 * Un champ et son nom, petit et discret au-dessus ; `shown` : le nom affiché, quand il est plus court que celui du
 * champ (sous « au », « Fin : jour » s'affiche « Jour »). Le pays, qui porte une liste, n'est pas une étiquette :
 * un clic dans la liste ne vise pas le champ.
 */
function labelled(label: string, control: HTMLElement, named = true, shown = label): HTMLElement {
  const field = h(named ? "label" : "div", "agenda-field");
  field.append(h("span", "agenda-field-label", shown), control);
  if (named) control.setAttribute("aria-label", label);
  return field;
}

/** Un groupe de champs : son nom à gauche (au-dessus en largeur étroite), ses champs alignés à droite. */
function group(kind: "when" | "where", name: string, ...rows: HTMLElement[]): HTMLElement {
  const element = h("div", `agenda-group agenda-${kind}`);
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", name);
  const fields = h("div", "agenda-group-fields");
  fields.append(...rows);
  element.append(h("span", "agenda-group-label", name), fields);
  return element;
}

function row(className: string, ...children: HTMLElement[]): HTMLElement {
  const element = h("div", className);
  element.append(...children);
  return element;
}

function textInput(): HTMLInputElement {
  const input = h("input", "agenda-input");
  input.type = "text";
  input.autocomplete = "off";
  return input;
}

/** Le titre : un champ sans cadre qui se lit comme un titre ; son cadre paraît au survol et au focus. */
function titleInput(): HTMLInputElement {
  const input = textInput();
  input.className = "agenda-title-input";
  return input;
}

function monthSelect(): HTMLSelectElement {
  const select = h("select", "agenda-select");
  for (let month = 1; month <= 12; month += 1)
    select.add(new Option(monthName(month), String(month)));
  return select;
}

/** La liste des années : le choix vide, puis les années proposées (remplies à chaque lecture de l'événement). */
function yearSelect(): HTMLSelectElement {
  return h("select", "agenda-select agenda-year-select");
}

/** Les options d'une liste, sauf si elles sont déjà là (une liste ouverte ne se redessine pas pour rien). */
function fillOptions(select: HTMLSelectElement, options: readonly [string, string][]): void {
  const same =
    select.options.length === options.length &&
    options.every(([value], index) => select.options[index]?.value === value);
  if (!same) select.replaceChildren(...options.map(([value, text]) => new Option(text, value)));
}

/** Le numéro des textes d'aide de la fin, pour que chacun ait son identifiant dans la page. */
let notes = 0;

/** Remplace la valeur d'un champ, sauf s'il a le curseur (une saisie en cours n'est pas perdue) et que `force` est faux. */
function setValue(control: HTMLInputElement | HTMLSelectElement, value: string, force: boolean) {
  if (force || document.activeElement !== control) control.value = value;
}

class Fields implements EventFields {
  readonly element = h("div", "agenda-fields");
  readonly title = titleInput();
  private readonly month = monthSelect();
  private readonly day: DayPicker;
  private readonly year = yearSelect();
  private readonly endDay: DayPicker;
  private readonly endMonth = monthSelect();
  private readonly endNote = h("p", "agenda-end-note");
  private readonly city = textInput();
  private readonly country: CountryField;
  /** L'événement montré : les jours possibles et la cohérence de la fin se jugent sur lui. */
  private event: Agenda12EventItem | null = null;

  constructor(private readonly deps: FieldsDeps) {
    this.country = createCountryField({
      load: deps.loadCountries,
      error: deps.error,
      change: (country) => deps.change([{ kind: "country", country }]),
    });
    this.day = createDayPicker({
      label: FIELD_LABELS.day,
      title: "Choisir le jour",
      available: (day) =>
        this.event !== null && startDayAvailable(day, this.event.month, this.event.year),
      choose: (day) => this.changeStart({ kind: "day", day }),
    });
    this.endDay = createDayPicker({
      label: FIELD_LABELS.endDay,
      title: END_DAY_TITLE,
      available: (day) =>
        this.event !== null && endDayAvailable(day, this.event, Number(this.endMonth.value)),
      choose: (day) => deps.change([this.endTo(day, Number(this.endMonth.value))]),
    });
    this.endNote.id = `agenda-end-note-${String((notes += 1))}`;
    this.endNote.hidden = true;
    this.wire();
    const { title, month, day, year, endDay, endMonth, city } = FIELD_LABELS;
    this.title.setAttribute("aria-label", title);
    const start = row(
      "agenda-range-start",
      ...[labelled(day, this.day.element, false), labelled(month, this.month)],
      labelled(year, this.year),
    );
    const end = row(
      "agenda-range-end",
      ...[
        h("span", "agenda-range-to", UNTIL_TEXT),
        labelled(endDay, this.endDay.element, false, "Jour"),
      ],
      labelled(endMonth, this.endMonth, true, "Mois"),
    );
    const place = row(
      "agenda-place-fields",
      labelled(COUNTRY_FIELD, this.country.element, false),
      labelled(city, this.city),
    );
    const when = group("when", WHEN_TEXT, row("agenda-range", start, end));
    // Le texte d'aide de la fin est à part du groupe des champs : le nom « Quand » reste à la hauteur des champs.
    when.append(this.endNote);
    this.element.append(this.title, when, group("where", WHERE_TEXT, place));
  }

  private wire(): void {
    const { deps } = this;
    this.title.addEventListener("change", () =>
      deps.change([{ kind: "title", title: this.title.value }]),
    );
    this.month.addEventListener("change", () =>
      this.changeStart({ kind: "month", month: Number(this.month.value) }),
    );
    this.year.addEventListener("change", () =>
      this.changeStart({
        kind: "year",
        year: this.year.value === "" ? null : Number(this.year.value),
      }),
    );
    this.city.addEventListener("change", () => {
      const city = this.city.value.trim();
      deps.change([{ kind: "city", city: city === "" ? null : city }]);
    });
    this.endMonth.addEventListener("change", () =>
      deps.change([this.endTo(this.event?.end?.day ?? null, Number(this.endMonth.value))]),
    );
  }

  /** La fin au jour `day` du mois `month` ; sans jour, elle est effacée. */
  private endTo(day: number | null, month: number): Agenda12EventChangeItem {
    return day === null ? { kind: "end", end: null } : { kind: "end", end: { day, month } };
  }

  /** Un geste sur le début : si la fin déjà saisie passerait avant lui, elle est ramenée au début (effacée) d'abord. */
  private changeStart(gesture: StartGesture): void {
    const bringBack = this.event !== null && mustBringEndBack(this.event, gesture);
    if (bringBack) this.deps.change([{ kind: "end", end: null }, gesture], END_BROUGHT_BACK);
    else this.deps.change([gesture]);
  }

  show(event: Agenda12EventItem, force: boolean): void {
    this.event = event;
    setValue(this.title, event.title, force);
    setValue(this.month, String(event.month), force);
    this.day.show(event.day);
    this.showYear(event.year, force);
    this.endDay.show(event.end?.day ?? null);
    setValue(this.endMonth, String(event.end?.month ?? event.month), force);
    // Sans jour de fin, le mois de fin n'a rien à dire.
    this.endMonth.disabled = event.end === null;
    this.showEndNote(event);
    setValue(this.city, event.city ?? "", force);
    this.country.show(event.country);
  }

  /** L'année de l'événement est toujours dans la liste, même hors de la plage proposée. */
  private showYear(year: number | null, force: boolean): void {
    const years = yearChoices(this.deps.currentYear(), year);
    fillOptions(this.year, [
      ["", NO_VALUE_TEXT],
      ...years.map((value): [string, string] => [String(value), String(value)]),
    ]);
    setValue(this.year, year === null ? "" : String(year), force);
  }

  /** La fin avant le début est montrée en erreur, sans être corrigée ; une fin de l'année suivante est signalée. */
  private showEndNote(event: Agenda12EventItem): void {
    const invalid = endBeforeStart(event);
    const text = invalid ? END_BEFORE_START : endWraps(event) ? END_NEXT_YEAR : "";
    this.endNote.textContent = text;
    this.endNote.hidden = text === "";
    this.endNote.dataset.tone = invalid ? "error" : "hint";
    for (const control of [this.endDay.trigger, this.endMonth]) {
      if (invalid) control.setAttribute("aria-invalid", "true");
      else control.removeAttribute("aria-invalid");
      if (text === "") control.removeAttribute("aria-describedby");
      else control.setAttribute("aria-describedby", this.endNote.id);
    }
  }
}

export function createEventFields(deps: FieldsDeps): EventFields {
  return new Fields(deps);
}
