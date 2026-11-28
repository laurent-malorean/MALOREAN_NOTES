// Les champs de la bande d'un événement (spécification § 4.2) : le titre, en grand ; « Quand » (jour, mois, année,
// puis « au », jour et mois de la fin) ; « Où » (pays, ville). Chaque champ ne fait que dire son geste ; Rust le
// valide (dates, mois, pays) et l'écran montre sa réponse. L'écran garde en plus la fin cohérente avec le début
// (§§ 4.3 et 4.4) : il grise les jours impossibles, ramène la fin au début, montre une fin incohérente en erreur.
import type { Agenda12EventChangeItem, Agenda12EventItem, CountryItem } from "../bridge";
import { type Choice } from "../state/agenda-12-date-pick";
import { endBeforeStart, endWraps } from "../state/agenda-12-when";
import { type CountryField, createCountryField } from "./agenda-12-country";
import { createPeriodPicker, type PeriodPicker } from "./agenda-12-period-picker";
import { h } from "./crm-dom";
import "./agenda-12-when.css";

/** Ce que l'écran dit d'une fin avant le début qu'il a reçue telle quelle, et d'une fin qui tombe l'année suivante. */
export const END_BEFORE_START = "La fin est avant le début.";
export const END_NEXT_YEAR = "Fin l'année suivante.";

export const FIELD_LABELS = {
  title: "Titre",
  period: "Date",
  city: "Ville",
} as const;

/** Le champ du pays a son propre nom, posé par le champ lui-même. */
const COUNTRY_FIELD = "Pays";

/** Les deux groupes de champs. */
export const WHEN_TEXT = "Quand";
export const WHERE_TEXT = "Où";

/** Ce que les champs demandent à la bande. */
export interface FieldsDeps {
  /**
   * Les gestes d'un champ, joués l'un après l'autre ; `notice` : ce que l'écran dit quand ils ont tous réussi.
   * Rend la main quand la bande a relu l'événement.
   */
  readonly change: (changes: readonly Agenda12EventChangeItem[], notice?: string) => Promise<void>;
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
 * Un champ et son nom, petit et discret au-dessus. Le pays et la période, qui portent une liste ou une fenêtre,
 * ne sont pas des étiquettes (`named` faux) : un clic dans la liste ne vise pas le champ, qui se nomme lui-même.
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

/** Remplace la valeur d'un champ, sauf s'il a le curseur (une saisie en cours n'est pas perdue) et que `force` est faux. */
function setValue(control: HTMLInputElement, value: string, force: boolean) {
  if (force || document.activeElement !== control) control.value = value;
}

/** Le numéro des textes d'aide de la fin, pour que chacun ait son identifiant dans la page. */
let notes = 0;

class Fields implements EventFields {
  readonly element = h("div", "agenda-fields");
  readonly title = titleInput();
  private readonly period: PeriodPicker;
  private readonly endNote = h("p", "agenda-end-note");
  private readonly city = textInput();
  private readonly country: CountryField;

  constructor(private readonly deps: FieldsDeps) {
    this.country = createCountryField({
      load: deps.loadCountries,
      error: deps.error,
      change: (country) => void deps.change([{ kind: "country", country }]),
    });
    this.period = createPeriodPicker({
      currentYear: deps.currentYear,
      apply: (choice) => this.apply(choice),
    });
    this.endNote.id = `agenda-end-note-${String((notes += 1))}`;
    this.endNote.hidden = true;
    this.wire();
    const { title, period, city } = FIELD_LABELS;
    this.title.setAttribute("aria-label", title);
    const when = group("when", WHEN_TEXT, labelled(period, this.period.element, false));
    // Le texte d'aide de la fin est à part du groupe des champs : le nom « Quand » reste à la hauteur du champ.
    when.append(this.endNote);
    const place = h("div", "agenda-place-fields");
    place.append(labelled(COUNTRY_FIELD, this.country.element, false), labelled(city, this.city));
    this.element.append(this.title, when, group("where", WHERE_TEXT, place));
  }

  /** Un choix du sélecteur de période : ses gestes partent, et rien ne part s'il n'y en a pas. */
  private apply({ changes, notice }: Choice): Promise<void> {
    return changes.length === 0 ? Promise.resolve() : this.deps.change(changes, notice);
  }

  private wire(): void {
    const { deps } = this;
    this.title.addEventListener(
      "change",
      () => void deps.change([{ kind: "title", title: this.title.value }]),
    );
    this.city.addEventListener("change", () => {
      const city = this.city.value.trim();
      void deps.change([{ kind: "city", city: city === "" ? null : city }]);
    });
  }

  show(event: Agenda12EventItem, force: boolean): void {
    setValue(this.title, event.title, force);
    this.period.show(event);
    this.showEndNote(event);
    setValue(this.city, event.city ?? "", force);
    this.country.show(event.country);
  }

  /** La fin avant le début est montrée en erreur, sans être corrigée ; une fin de l'année suivante est signalée. */
  private showEndNote(event: Agenda12EventItem): void {
    const invalid = endBeforeStart(event);
    const text = invalid ? END_BEFORE_START : endWraps(event) ? END_NEXT_YEAR : "";
    this.endNote.textContent = text;
    this.endNote.hidden = text === "";
    this.endNote.dataset.tone = invalid ? "error" : "hint";
    const { trigger } = this.period;
    if (invalid) trigger.setAttribute("aria-invalid", "true");
    else trigger.removeAttribute("aria-invalid");
    if (text === "") trigger.removeAttribute("aria-describedby");
    else trigger.setAttribute("aria-describedby", this.endNote.id);
  }
}

export function createEventFields(deps: FieldsDeps): EventFields {
  return new Fields(deps);
}
