// Les étiquettes et les notes liées dans la fenêtre d'une action (fiche 0062, spécification § 8).
import { appIcon } from "./app-icons";
import { actionButton, h } from "./crm-dom";
import { section, type WindowActions, type WindowModel } from "./crm-action-fields";
import { tagField } from "./tag-field";

/** Le texte du bouton qui lie une note. */
export const LINK_NOTE = "Lier une note";
/** La clé du texte en cours de saisie dans le champ des étiquettes. */
const TAG_KEY = "tag";

/** Un bouton secondaire discret : le « + » du jeu d'icônes, puis le texte. */
export function plusButton(className: string, text: string): HTMLButtonElement {
  const button = actionButton(`crm-aw-plus ${className}`, "");
  button.append(appIcon("add"), h("span", "", text));
  return button;
}

/**
 * Un ajout : le bouton « + texte » ; un clic ouvre un champ (Entrée ajoute et le laisse ouvert pour
 * le suivant, Échap ou « Annuler » le ferme). Le texte tapé est gardé entre deux dessins.
 */
export function addControl(
  act: WindowActions,
  { key, label, className }: { key: string; label: string; className: string },
  submit: (text: string) => void,
): HTMLElement {
  if (act.adding.get() !== key) {
    const open = plusButton(className, label);
    open.addEventListener("click", () => act.adding.set(key));
    return open;
  }
  const input = h("input", "crm-aw-add-input");
  input.setAttribute("aria-label", label);
  input.placeholder = label;
  input.dataset.field = key;
  input.dataset.draft = "";
  input.value = act.drafts.get(key);
  input.addEventListener("input", () => act.drafts.set(key, input.value));
  const send = () => {
    const text = input.value;
    act.drafts.set(key, "");
    input.value = "";
    input.focus();
    submit(text);
  };
  const close = () => {
    act.drafts.set(key, "");
    act.adding.set(null);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      send();
    } else if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  });
  const add = actionButton("crm-aw-add-send", "Ajouter");
  add.addEventListener("click", send);
  const cancel = actionButton("crm-aw-cancel link", "Annuler");
  cancel.addEventListener("click", close);
  const row = h("div", `crm-aw-add-row ${className}`);
  row.append(input, add, cancel);
  return row;
}

/** Les étiquettes : le champ d'étiquettes de l'application, qui propose celles du CRM. */
export function tagsSection(model: WindowModel, act: WindowActions): HTMLElement {
  const field = tagField({
    tags: model.fields.tags,
    suggestions: model.crm.tags.map((name) => ({ name })),
    change: (tags) => act.change({ kind: "tags", tags }),
    draft: { get: () => act.drafts.get(TAG_KEY), set: (text) => act.drafts.set(TAG_KEY, text) },
    data: { field: TAG_KEY, draft: "" },
  });
  return section("crm-aw-tags-section", "Étiquettes", field);
}

/** Les notes liées : chacune s'ouvre d'un clic, « × » la délie ; « + Lier une note » ouvre la recherche de notes. */
export function linkedNotesSection(model: WindowModel, act: WindowActions): HTMLElement {
  const { linkedNotes } = model.fields;
  const list = h("ul", "crm-aw-notes");
  for (const title of linkedNotes) {
    const row = h("li", "crm-aw-note");
    const open = actionButton("crm-aw-note-link link", title);
    open.addEventListener("click", () => act.openNote(title));
    const unlink = actionButton("crm-aw-remove", "×", `Délier ${title}`);
    unlink.addEventListener("click", () =>
      act.change({ kind: "linkedNotes", notes: linkedNotes.filter((n) => n !== title) }),
    );
    row.append(open, unlink);
    list.append(row);
  }
  const add = plusButton("crm-aw-link-note", LINK_NOTE);
  add.addEventListener("click", act.linkNote);
  return section("crm-aw-notes-section", "Notes liées", list, add);
}
