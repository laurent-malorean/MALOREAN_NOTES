// Le champ d'étiquettes : les étiquettes d'un contenu en pastilles, chacune à sa couleur avec « × »
// pour la retirer, et un champ « Ajouter une étiquette » avec un « + ». À la prise du curseur et à la
// saisie, le champ propose la liste de celles qui existent déjà (sans celles du contenu, filtrée par ce
// qui est tapé, avec leur nombre de notes) : un clic, ou les flèches et Entrée, en choisit une ; une
// étiquette inconnue se crée toujours (« Créer “mot” »). Le même pour une note, un cahier de recherche,
// une carte mentale, un canvas, une fiche du CRM et la fenêtre d'une action : l'appelant dit seulement
// les étiquettes, celles qui existent et le geste.
import {
  noteCount,
  type TagChoice,
  tagChoices,
  tagColor,
  type TagSuggestion,
  withoutTag,
  withTag,
} from "../state/tag-field";
import { actionButton, h } from "./crm-dom";
import "./tag-field.css";

/** Le nom du champ de saisie, que le clavier et les lecteurs d'écran lisent. */
export const ADD_TAG = "Ajouter une étiquette";
/** Le nom du bouton « + », qui valide le texte tapé. */
export const VALIDATE_TAG = "Valider l'étiquette";
/** Le nom du groupe des étiquettes. */
export const TAGS_LABEL = "Étiquettes";
/** Le nom du bouton « × » d'une étiquette. */
export const removeLabel = (tag: string): string => `Retirer l'étiquette ${tag}`;

export interface TagFieldOptions {
  /** Les étiquettes du contenu, dans leur ordre. */
  readonly tags: readonly string[];
  /** Les étiquettes qui existent déjà, proposées à la prise du curseur et à la saisie (celles du contenu sont écartées). */
  readonly suggestions: readonly TagSuggestion[];
  /** Le geste : voici la liste des étiquettes après le clic sur « × » ou l'ajout ; l'appelant l'enregistre. */
  readonly change: (tags: string[]) => void;
  /** Le texte tapé et pas encore validé, gardé quand l'appelant redessine le champ. */
  readonly draft?: { get(): string; set(text: string): void };
  /** Les données (`data-…`) du champ de saisie, par lesquelles l'appelant lui rend le curseur après un dessin. */
  readonly data?: Readonly<Record<string, string>>;
}

let fields = 0;

/** La pastille d'une étiquette : son nom, et « × » qui la retire. */
function chip(tag: string, tags: readonly string[], change: (tags: string[]) => void) {
  const element = h("span", "tag-chip", tag);
  element.dataset.tag = tag;
  element.style.setProperty("--label-color", `var(--palette-${tagColor(tag)})`);
  const remove = actionButton("tag-remove", "×", removeLabel(tag));
  remove.addEventListener("click", () => change(withoutTag(tags, tag)));
  element.append(remove);
  return element;
}

/** Le décalage entre le champ de saisie et sa liste, en points. */
const OFFSET = 4;
/** La largeur de la liste au moins, en points : un nom d'étiquette et son nombre de notes y tiennent. */
const LIST_MIN_WIDTH = 240;

/** La liste des étiquettes proposées sous le champ de saisie. */
class Suggestions {
  private list: HTMLElement | null = null;
  private choices: TagChoice[] = [];
  private active = -1;

  constructor(
    private readonly input: HTMLInputElement,
    private readonly id: string,
    private readonly options: TagFieldOptions,
    private readonly choose: (name: string) => void,
  ) {}

  get isOpen(): boolean {
    return this.list !== null;
  }

  /** Ouvre la liste, ou la met à jour si elle l'est ; elle reste fermée s'il n'y a rien à proposer. */
  show(): void {
    this.choices = tagChoices(this.options.suggestions, this.options.tags, this.input.value);
    this.active = -1;
    if (this.choices.length === 0) return this.close();
    if (this.list === null) {
      this.list = h("ul", "tag-suggestions");
      this.list.id = this.id;
      this.list.setAttribute("role", "listbox");
      this.list.setAttribute("aria-label", "Étiquettes proposées");
      this.input.parentElement?.append(this.list);
      document.addEventListener("scroll", this.scrolled, true);
      this.input.setAttribute("aria-expanded", "true");
    }
    this.draw();
    this.place();
  }

  close(): void {
    this.list?.remove();
    this.list = null;
    this.active = -1;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
    document.removeEventListener("scroll", this.scrolled, true);
  }

  /** Les flèches : la ligne suivante (la première après la dernière), ou la précédente. */
  move(step: 1 | -1): void {
    const count = this.choices.length;
    this.active =
      this.active < 0 ? (step === 1 ? 0 : count - 1) : (this.active + step + count) % count;
    this.draw();
  }

  /** Le nom de la ligne atteinte aux flèches ; `null` si aucune. */
  get chosen(): string | null {
    return this.choices[this.active]?.name ?? null;
  }

  private readonly scrolled = (event: Event): void => {
    if (!this.list?.contains(event.target as Node)) this.close();
  };

  private draw(): void {
    const list = this.list as HTMLElement;
    list.replaceChildren(...this.choices.map((choice, index) => this.row(choice, index)));
    const active = list.children[this.active];
    if (active === undefined) this.input.removeAttribute("aria-activedescendant");
    else {
      this.input.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    }
  }

  private row(choice: TagChoice, index: number): HTMLElement {
    const create = choice.kind === "create";
    const text = create ? `Créer « ${choice.name} »` : choice.name;
    const row = h("li", create ? "tag-suggestion create" : "tag-suggestion");
    row.id = `${this.id}-${String(index)}`;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(index === this.active));
    const count = choice.count === undefined ? null : noteCount(choice.count);
    row.setAttribute("aria-label", count === null ? text : `${text}, ${count}`);
    if (!create) {
      const dot = h("span", "tag-suggestion-dot");
      dot.style.setProperty("--label-color", `var(--palette-${tagColor(choice.name)})`);
      row.append(dot);
    }
    row.append(h("span", "tag-suggestion-name", text));
    if (count !== null) row.append(h("span", "tag-suggestion-count", count));
    // Le curseur reste dans le champ : ce qui y est tapé n'est ni validé ni perdu en route.
    row.addEventListener("mousedown", (event) => event.preventDefault());
    row.addEventListener("click", () => this.choose(choice.name));
    return row;
  }

  /** Sous le champ, ou au-dessus s'il n'y a pas la place ; jamais hors de la fenêtre. */
  private place(): void {
    const list = this.list as HTMLElement;
    const field = this.input.getBoundingClientRect();
    const width = Math.max(field.width, LIST_MIN_WIDTH);
    list.style.width = `${String(width)}px`;
    const height = list.getBoundingClientRect().height;
    const below = field.bottom + OFFSET;
    const top = below + height > window.innerHeight ? field.top - OFFSET - height : below;
    list.style.top = `${String(Math.max(OFFSET, top))}px`;
    list.style.left = `${String(Math.max(OFFSET, Math.min(field.left, window.innerWidth - width - OFFSET)))}px`;
  }
}

/** Le champ d'étiquettes d'un contenu. */
export function tagField(options: TagFieldOptions): HTMLElement {
  const { tags, change, draft, data } = options;
  const id = `tag-field-suggestions-${String(++fields)}`;
  const root = h("div", "tag-field");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", TAGS_LABEL);
  root.append(...tags.map((tag) => chip(tag, tags, change)));
  const input = h("input", "tag-input");
  input.setAttribute("aria-label", ADD_TAG);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", id);
  input.placeholder = ADD_TAG;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.value = draft?.get() ?? "";
  Object.assign(input.dataset, data);
  const add = (text: string) => {
    input.value = "";
    draft?.set("");
    suggestions.close();
    const next = withTag(tags, text);
    if (next.length !== tags.length) change(next);
  };
  const suggestions = new Suggestions(input, id, options, add);
  input.addEventListener("focus", () => suggestions.show());
  input.addEventListener("click", () => suggestions.show());
  input.addEventListener("blur", () => suggestions.close());
  input.addEventListener("input", () => {
    draft?.set(input.value);
    suggestions.show();
  });
  input.addEventListener("keydown", (event) => keyed(event, input, suggestions, add));
  const validate = actionButton("tag-add", "+", VALIDATE_TAG);
  validate.title = VALIDATE_TAG;
  validate.addEventListener("click", () =>
    input.value.trim() === "" ? input.focus() : add(input.value),
  );
  root.append(input, validate);
  return root;
}

/** Les touches du champ : Entrée ajoute (la ligne atteinte, sinon le texte tapé), les flèches parcourent la liste, Échap et Tab la ferment. */
function keyed(
  event: KeyboardEvent,
  input: HTMLInputElement,
  suggestions: Suggestions,
  add: (text: string) => void,
): void {
  if (event.key === "Enter") {
    event.preventDefault();
    add(suggestions.chosen ?? input.value);
  } else if (event.key === "Escape" && suggestions.isOpen) {
    event.stopPropagation();
    suggestions.close();
  } else if (event.key === "Tab") suggestions.close();
  else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!suggestions.isOpen) suggestions.show();
    else suggestions.move(event.key === "ArrowDown" ? 1 : -1);
  }
}
