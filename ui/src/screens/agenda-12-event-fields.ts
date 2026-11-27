// Les champs de la bande d'un événement (spécification § 4.2) : titre, mois, jour, année, fin, pays, ville.
// Chaque champ ne fait que dire son geste ; Rust le valide (dates, mois, pays) et l'écran montre sa réponse.
import type { Agenda12EventChangeItem, Agenda12EventItem, CountryItem } from "../bridge";
import { monthName, wholeNumber } from "../state/agenda-12";
import { type CountryField, createCountryField } from "./agenda-12-country";
import { h } from "./crm-dom";

/** Ce que disent les champs de nombre quand on y écrit autre chose que des chiffres. */
export const NOT_A_NUMBER = "Un nombre entier est attendu.";

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

/** Ce que les champs demandent à la bande. */
export interface FieldsDeps {
  /** Un geste du champ. */
  readonly change: (change: Agenda12EventChangeItem) => void;
  /** Le champ est refusé avant d'aller à Rust (ce n'est pas un nombre). */
  readonly refuse: (message: string) => void;
  readonly loadCountries: () => Promise<readonly CountryItem[]>;
  readonly error: (error: unknown) => void;
}

export interface EventFields {
  readonly element: HTMLElement;
  readonly title: HTMLInputElement;
  /** Montre l'événement ; `force` remplace aussi ce qui est tapé dans un champ qui a le curseur. */
  show(event: Agenda12EventItem, force: boolean): void;
}

/** Un champ et son nom ; le pays, qui porte une liste, n'est pas une étiquette : un clic dans la liste ne vise pas le champ. */
function labelled(label: string, control: HTMLElement, named = true): HTMLElement {
  const field = h(named ? "label" : "div", "agenda-field");
  field.append(h("span", "agenda-field-label", label), control);
  if (named) control.setAttribute("aria-label", label);
  return field;
}

function textInput(): HTMLInputElement {
  const input = h("input", "agenda-input");
  input.type = "text";
  input.autocomplete = "off";
  return input;
}

function monthSelect(): HTMLSelectElement {
  const select = h("select", "agenda-select");
  for (let month = 1; month <= 12; month += 1)
    select.add(new Option(monthName(month), String(month)));
  return select;
}

/** Remplace la valeur d'un champ, sauf s'il a le curseur (une saisie en cours n'est pas perdue) et que `force` est faux. */
function setValue(control: HTMLInputElement | HTMLSelectElement, value: string, force: boolean) {
  if (force || document.activeElement !== control) control.value = value;
}

class Fields implements EventFields {
  readonly element = h("div", "agenda-fields");
  readonly title = textInput();
  private readonly month = monthSelect();
  private readonly day = textInput();
  private readonly year = textInput();
  private readonly endDay = textInput();
  private readonly endMonth = monthSelect();
  private readonly city = textInput();
  private readonly country: CountryField;

  constructor(private readonly deps: FieldsDeps) {
    this.country = createCountryField({
      load: deps.loadCountries,
      error: deps.error,
      change: (country) => deps.change({ kind: "country", country }),
    });
    for (const input of [this.day, this.year, this.endDay]) input.inputMode = "numeric";
    this.wire();
    const { title, month, day, year, endDay, endMonth, city } = FIELD_LABELS;
    this.element.append(
      labelled(title, this.title),
      labelled(month, this.month),
      labelled(day, this.day),
      labelled(year, this.year),
      labelled(endDay, this.endDay),
      labelled(endMonth, this.endMonth),
      labelled(COUNTRY_FIELD, this.country.element, false),
      labelled(city, this.city),
    );
  }

  private wire(): void {
    const { deps } = this;
    this.title.addEventListener("change", () =>
      deps.change({ kind: "title", title: this.title.value }),
    );
    this.month.addEventListener("change", () =>
      deps.change({ kind: "month", month: Number(this.month.value) }),
    );
    this.city.addEventListener("change", () => {
      const city = this.city.value.trim();
      deps.change({ kind: "city", city: city === "" ? null : city });
    });
    this.whole(this.day, (day) => ({ kind: "day", day }));
    this.whole(this.year, (year) => ({ kind: "year", year }));
    this.whole(this.endDay, () => this.endChange());
    this.endMonth.addEventListener("change", () => deps.change(this.endChange()));
  }

  /** Un champ de nombre : vide, il efface ; des chiffres, il change ; autre chose, il est refusé. */
  private whole(
    input: HTMLInputElement,
    gesture: (value: number | null) => Agenda12EventChangeItem,
  ): void {
    input.addEventListener("change", () => {
      const value = wholeNumber(input.value);
      if (value === undefined) this.deps.refuse(NOT_A_NUMBER);
      else this.deps.change(gesture(value));
    });
  }

  /** La fin : un jour et un mois ; sans jour, elle est effacée. */
  private endChange(): Agenda12EventChangeItem {
    const day = wholeNumber(this.endDay.value);
    if (day === undefined || day === null) return { kind: "end", end: null };
    return { kind: "end", end: { day, month: Number(this.endMonth.value) } };
  }

  show(event: Agenda12EventItem, force: boolean): void {
    setValue(this.title, event.title, force);
    setValue(this.month, String(event.month), force);
    setValue(this.day, event.day === null ? "" : String(event.day), force);
    setValue(this.year, event.year === null ? "" : String(event.year), force);
    setValue(this.endDay, event.end === null ? "" : String(event.end.day), force);
    setValue(this.endMonth, String(event.end?.month ?? event.month), force);
    // Sans jour de fin, le mois de fin n'a rien à dire.
    this.endMonth.disabled = event.end === null;
    setValue(this.city, event.city ?? "", force);
    this.country.show(event.country);
  }
}

export function createEventFields(deps: FieldsDeps): EventFields {
  return new Fields(deps);
}
