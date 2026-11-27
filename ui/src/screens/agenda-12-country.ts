// Le champ « Pays » d'un événement (spécification § 4.1) : le pays montré par son drapeau et son nom ; en
// tapant, la liste des pays (249, nom en français) se filtre ; un clic, ou Entrée, choisit.
import type { CountryItem } from "../bridge";
import { countryText, matchingCountries } from "../state/agenda-12";
import { actionButton, h } from "./crm-dom";

export const COUNTRY_LABEL = "Pays";
export const CLEAR_COUNTRY = "Retirer le pays";
export const NO_COUNTRY_TEXT = "Aucun pays";

export interface CountryFieldDeps {
  /** Les pays de la norme, lus une fois, à la première ouverture de la liste. */
  readonly load: () => Promise<readonly CountryItem[]>;
  /** Le pays choisi, par son code ; `null` : retiré. */
  readonly change: (code: string | null) => void;
  readonly error: (error: unknown) => void;
}

export interface CountryField {
  readonly element: HTMLElement;
  readonly input: HTMLInputElement;
  /** Le pays de l'événement ; la saisie en cours (liste ouverte) n'est pas écrasée. */
  show(country: CountryItem | null): void;
}

class CountryChoice implements CountryField {
  readonly element = h("div", "agenda-country");
  readonly input = h("input", "agenda-input agenda-country-input");
  private readonly list = h("ul", "agenda-country-list");
  private readonly clear = actionButton("link agenda-country-clear", "×", CLEAR_COUNTRY);
  private countries: readonly CountryItem[] | null = null;
  private current: CountryItem | null = null;
  private found: CountryItem[] = [];
  private active = -1;

  constructor(private readonly deps: CountryFieldDeps) {
    const { input, list } = this;
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = NO_COUNTRY_TEXT;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-label", COUNTRY_LABEL);
    input.setAttribute("aria-expanded", "false");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Liste des pays");
    list.hidden = true;
    this.clear.hidden = true;
    this.clear.title = CLEAR_COUNTRY;
    this.clear.addEventListener("click", () => deps.change(null));
    input.addEventListener("focus", () => void this.open(""));
    input.addEventListener("input", () => void this.open(input.value));
    input.addEventListener("blur", () => this.close());
    input.addEventListener("keydown", (event) => this.key(event));
    this.element.append(input, this.clear, list);
  }

  show(country: CountryItem | null): void {
    this.current = country;
    this.clear.hidden = country === null;
    if (this.list.hidden) this.input.value = this.text();
  }

  private text(): string {
    return this.current === null ? "" : countryText(this.current);
  }

  private async open(query: string): Promise<void> {
    try {
      this.countries ??= await this.deps.load();
    } catch (error) {
      return this.deps.error(error);
    }
    this.found = matchingCountries(this.countries, query);
    this.active = this.found.length === 0 ? -1 : 0;
    this.renderList();
  }

  private renderList(): void {
    this.list.replaceChildren(
      ...this.found.map((country, index) => {
        const option = h("li", "agenda-country-option", countryText(country));
        option.setAttribute("role", "option");
        option.dataset.code = country.code;
        option.setAttribute("aria-selected", String(index === this.active));
        // Le clic ne retire pas le focus du champ avant d'avoir choisi.
        option.addEventListener("mousedown", (event) => event.preventDefault());
        option.addEventListener("click", () => this.choose(country));
        return option;
      }),
    );
    this.list.hidden = false;
    this.input.setAttribute("aria-expanded", "true");
    this.list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }

  private close(): void {
    this.list.hidden = true;
    this.input.setAttribute("aria-expanded", "false");
    this.input.value = this.text();
  }

  private choose(country: CountryItem): void {
    this.close();
    if (country.code !== this.current?.code) this.deps.change(country.code);
  }

  private key(event: KeyboardEvent): void {
    if (event.key === "Escape") return this.close();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const count = this.found.length;
      if (count > 0) this.active = (this.active + step + count) % count;
      return this.renderList();
    }
    const chosen = this.found[this.active];
    if (event.key === "Enter" && !this.list.hidden && chosen !== undefined) {
      event.preventDefault();
      this.choose(chosen);
    }
  }
}

export function createCountryField(deps: CountryFieldDeps): CountryField {
  return new CountryChoice(deps);
}
