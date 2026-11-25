// Les étiquettes et les notes liées dans la fenêtre d'une action (fiche 0062, spécification § 8).
import { withTag } from "../state/crm-action-window";
import { tagColor } from "../state/crm-card";
import { actionButton, h } from "./crm-dom";
import { section, type WindowActions, type WindowModel } from "./crm-action-fields";

/** Le texte du bouton qui lie une note. */
export const LINK_NOTE = "+ Lier une note";
/** La clé du texte en cours de saisie dans le champ des étiquettes. */
const TAG_KEY = "tag";
const TAG_LIST_ID = "crm-aw-tag-suggestions";

/** Un champ d'ajout : Entrée valide `submit` avec le texte tapé, qui est gardé entre deux dessins. */
export function addField(
  act: WindowActions,
  { key, label, className }: { key: string; label: string; className: string },
  submit: (text: string) => void,
): HTMLInputElement {
  const input = h("input", className);
  input.setAttribute("aria-label", label);
  input.placeholder = label;
  input.dataset.field = key;
  input.value = act.drafts.get(key);
  input.addEventListener("input", () => act.drafts.set(key, input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const text = input.value;
    act.drafts.set(key, "");
    input.value = "";
    submit(text);
  });
  return input;
}

/** Les étiquettes, chacune à sa couleur avec « × », et le champ « Ajouter une étiquette » qui propose celles du CRM. */
export function tagsSection(model: WindowModel, act: WindowActions): HTMLElement {
  const { tags } = model.fields;
  const row = h("div", "crm-aw-tags");
  for (const tag of tags) {
    const chip = h("span", "crm-tag crm-aw-tag", tag);
    chip.style.setProperty("--label-color", `var(--palette-${tagColor(tag)})`);
    const remove = actionButton("crm-aw-remove", "×", `Retirer l'étiquette ${tag}`);
    remove.addEventListener("click", () =>
      act.change({ kind: "tags", tags: tags.filter((t) => t !== tag) }),
    );
    chip.append(remove);
    row.append(chip);
  }
  const input = addField(
    act,
    { key: TAG_KEY, label: "Ajouter une étiquette", className: "crm-aw-add" },
    (text) => {
      const next = withTag(tags, text);
      if (next.length !== tags.length) act.change({ kind: "tags", tags: next });
    },
  );
  const suggestions = h("datalist", "");
  suggestions.id = TAG_LIST_ID;
  for (const tag of model.crm.tags)
    suggestions.append(Object.assign(h("option", ""), { value: tag }));
  input.setAttribute("list", TAG_LIST_ID);
  return section("crm-aw-tags-section", "Étiquettes", row, input, suggestions);
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
  const add = actionButton("crm-aw-link-note link", LINK_NOTE);
  add.addEventListener("click", act.linkNote);
  return section("crm-aw-notes-section", "Notes liées", list, add);
}
