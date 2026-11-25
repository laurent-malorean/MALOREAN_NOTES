// Le champ d'étiquettes : les étiquettes d'un contenu en pastilles, chacune à sa couleur avec « × »
// pour la retirer, et un champ « Ajouter une étiquette » avec un « + » qui propose celles qui existent
// déjà. Le même pour une note, un cahier de recherche, une carte mentale, un canvas, une fiche du CRM
// et la fenêtre d'une action : l'appelant dit seulement les étiquettes, les suggestions et le geste.
import { tagColor, withoutTag, withTag } from "../state/tag-field";
import { actionButton, h } from "./crm-dom";
import "./tag-field.css";

/** Le nom du champ de saisie, que le clavier et les lecteurs d'écran lisent. */
export const ADD_TAG = "Ajouter une étiquette";
/** Le nom du bouton « + », qui valide le texte tapé. */
export const VALIDATE_TAG = "Ajouter l'étiquette";
/** Le nom du groupe des étiquettes. */
export const TAGS_LABEL = "Étiquettes";
/** Le nom du bouton « × » d'une étiquette. */
export const removeLabel = (tag: string): string => `Retirer l'étiquette ${tag}`;

export interface TagFieldOptions {
  /** Les étiquettes du contenu, dans leur ordre. */
  readonly tags: readonly string[];
  /** Les étiquettes qui existent déjà, proposées à la saisie (celles du contenu sont écartées). */
  readonly suggestions: readonly string[];
  /** Le geste : voici la liste des étiquettes après le clic sur « × » ou l'ajout ; l'appelant l'enregistre. */
  readonly change: (tags: string[]) => void;
  /** Le texte tapé et pas encore validé, gardé quand l'appelant redessine le champ. */
  readonly draft?: { get(): string; set(text: string): void };
  /** Le nom `data-field` du champ de saisie, par lequel l'appelant lui rend le curseur après un dessin. */
  readonly key?: string;
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

/** Les étiquettes proposées : celles qui existent, sans celles que le contenu porte déjà. */
function proposals(id: string, suggestions: readonly string[], tags: readonly string[]) {
  const list = h("datalist", "");
  list.id = id;
  const carried = new Set(tags.map((tag) => tag.toLowerCase()));
  for (const tag of suggestions.filter((s) => !carried.has(s.toLowerCase())))
    list.append(Object.assign(h("option", ""), { value: tag }));
  return list;
}

/** Le champ d'étiquettes d'un contenu. */
export function tagField(options: TagFieldOptions): HTMLElement {
  const { tags, change, draft, key } = options;
  const id = `tag-field-suggestions-${String(++fields)}`;
  const root = h("div", "tag-field");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", TAGS_LABEL);
  root.append(...tags.map((tag) => chip(tag, tags, change)));
  const input = h("input", "tag-input");
  input.setAttribute("aria-label", ADD_TAG);
  input.setAttribute("list", id);
  input.placeholder = ADD_TAG;
  input.spellcheck = false;
  input.value = draft?.get() ?? "";
  if (key !== undefined) input.dataset.field = key;
  input.addEventListener("input", () => draft?.set(input.value));
  const add = () => {
    const text = input.value;
    input.value = "";
    draft?.set("");
    const next = withTag(tags, text);
    if (next.length !== tags.length) change(next);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  });
  const validate = actionButton("tag-add", "+", VALIDATE_TAG);
  validate.title = VALIDATE_TAG;
  validate.addEventListener("click", () => (input.value.trim() === "" ? input.focus() : add()));
  root.append(input, validate, proposals(id, options.suggestions, tags));
  return root;
}
