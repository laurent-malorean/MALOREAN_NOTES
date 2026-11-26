// Les checklists et les commentaires dans la fenêtre d'une action existante (fiche 0062,
// spécification § 8) : chaque geste est enregistré aussitôt. Une checklist, un élément ou un commentaire
// se désigne à Rust par sa place dans l'ordre écrit.
import type { ChecklistItem } from "../bridge/generated/ChecklistItem";
import type { CommentItem } from "../bridge/generated/CommentItem";
import { newestFirst, progress, segmentsOf } from "../state/crm-action-window";
import { actionButton, h } from "./crm-dom";
import { section, type WindowActions, type WindowModel } from "./crm-action-fields";
import { addControl } from "./crm-action-links";

const EDIT_PREFIX = "comment-edit-";
const NEW_COMMENT = "comment-new";

/** Un champ de texte qui enregistre en quittant le champ : une valeur vidée reprend la précédente. */
function editable(
  { label, field, className }: { label: string; field: string; className: string },
  value: string,
  save: (text: string) => void,
): HTMLInputElement {
  const input = h("input", className);
  input.value = value;
  input.setAttribute("aria-label", label);
  input.dataset.field = field;
  input.addEventListener("change", () => {
    const text = input.value.trim();
    if (text === "" || text === value) input.value = value;
    else save(text);
  });
  return input;
}

function itemRow(
  list: number,
  index: number,
  item: ChecklistItem["items"][number],
  act: WindowActions,
) {
  const row = h("li", "crm-aw-item");
  const box = h("input", "crm-aw-check");
  box.type = "checkbox";
  box.checked = item.done;
  box.setAttribute("aria-label", `Cocher ${item.text}`);
  const text = editable(
    {
      label: `Élément ${item.text}`,
      field: `item-${String(list)}-${String(index)}`,
      className: item.done ? "crm-aw-item-text done" : "crm-aw-item-text",
    },
    item.text,
    (value) => act.body({ kind: "editItem", list, item: index, text: value }),
  );
  box.addEventListener("change", () => {
    text.classList.toggle("done", box.checked);
    act.body({ kind: "checkItem", list, item: index, done: box.checked });
  });
  const remove = actionButton("crm-aw-remove", "×", `Retirer ${item.text}`);
  remove.addEventListener("click", () => act.body({ kind: "removeItem", list, item: index }));
  row.append(box, text, remove);
  return row;
}

/** La barre d'avancement : de 0 à 100, lue par les lecteurs d'écran comme une barre de progression. */
function progressBar(list: ChecklistItem): HTMLElement {
  const percent = progress(list);
  const bar = h("div", "crm-aw-bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", `Avancement de la checklist ${list.name}`);
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", String(percent));
  const fill = h("div", "crm-aw-bar-fill");
  fill.style.width = `${String(percent)}%`;
  bar.append(fill);
  return bar;
}

function checklistBox(list: ChecklistItem, index: number, act: WindowActions): HTMLElement {
  const box = h("div", "crm-aw-checklist");
  const head = h("div", "crm-aw-checklist-head");
  const name = editable(
    {
      label: `Nom de la checklist ${list.name}`,
      field: `list-${String(index)}`,
      className: "crm-aw-list-name",
    },
    list.name,
    (value) => act.body({ kind: "renameChecklist", list: index, name: value }),
  );
  const done = h("span", "crm-aw-progress", `${String(progress(list))} %`);
  const remove = actionButton(
    "crm-aw-remove crm-aw-remove-list",
    "×",
    `Supprimer la checklist ${list.name}`,
  );
  remove.title = `Supprimer la checklist ${list.name}`;
  remove.addEventListener("click", () => act.removeChecklist(index, list));
  head.append(name, done, remove);
  const items = h("ul", "crm-aw-items");
  list.items.forEach((item, at) => items.append(itemRow(index, at, item, act)));
  const add = addControl(
    act,
    { key: `item-new-${String(index)}`, label: "Ajouter un élément", className: "crm-aw-add" },
    (text) => text.trim() !== "" && act.body({ kind: "addItem", list: index, text: text.trim() }),
  );
  box.append(head, progressBar(list), items, add);
  return box;
}

/** Les checklists : chacune son nom, son avancement (pourcentage et barre), ses éléments ; « Ajouter une checklist ». */
export function checklistsSection(model: WindowModel, act: WindowActions): HTMLElement {
  const lists = (model.action?.checklists ?? []).map((list, index) =>
    checklistBox(list, index, act),
  );
  const add = addControl(
    act,
    { key: "list-new", label: "Ajouter une checklist", className: "crm-aw-add crm-aw-add-list" },
    (text) => text.trim() !== "" && act.body({ kind: "addChecklist", name: text.trim() }),
  );
  return section("crm-aw-checklists", "Checklists", ...lists, add);
}

/** Un commentaire : le texte, chaque adresse en lien cliquable (ouvert dans le navigateur). */
function commentText(comment: CommentItem, act: WindowActions): HTMLElement {
  const text = h("div", "crm-aw-comment-text");
  for (const segment of segmentsOf(comment.text)) {
    if (segment.kind === "text") {
      text.append(segment.text);
      continue;
    }
    const link = h("a", "crm-aw-comment-link", segment.text);
    link.href = segment.url;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      act.openAddress(segment.url);
    });
    text.append(link);
  }
  return text;
}

function commentEditor(index: number, comment: CommentItem, act: WindowActions): HTMLElement {
  const key = `${EDIT_PREFIX}${String(index)}`;
  const area = h("textarea", "crm-aw-comment-edit");
  area.value = act.drafts.get(key) || comment.text;
  area.rows = 3;
  area.dataset.field = key;
  area.setAttribute("aria-label", "Modifier le commentaire");
  area.addEventListener("input", () => act.drafts.set(key, area.value));
  const save = actionButton("crm-aw-save", "Enregistrer le commentaire");
  save.addEventListener("click", () => {
    const text = area.value.trim();
    if (text === "") return;
    act.drafts.set(key, "");
    act.editing.set(null);
    act.body({ kind: "editComment", comment: index, text });
  });
  const cancel = actionButton("crm-aw-cancel link", "Annuler");
  cancel.addEventListener("click", () => {
    act.drafts.set(key, "");
    act.editing.set(null);
  });
  const row = h("div", "crm-aw-comment-buttons");
  row.append(save, cancel);
  const box = h("div", "crm-aw-comment-editor");
  box.append(area, row);
  return box;
}

function commentRow(index: number, comment: CommentItem, act: WindowActions): HTMLElement {
  const row = h("li", "crm-aw-comment");
  row.append(h("time", "crm-aw-comment-at", comment.at));
  if (act.editing.get() === index) {
    row.append(commentEditor(index, comment, act));
    return row;
  }
  const edit = actionButton(
    "crm-aw-edit link",
    "Modifier",
    `Modifier le commentaire du ${comment.at}`,
  );
  edit.addEventListener("click", () => act.editing.set(index));
  const remove = actionButton(
    "crm-aw-remove-comment link",
    "Supprimer",
    `Supprimer le commentaire du ${comment.at}`,
  );
  remove.addEventListener("click", () => act.body({ kind: "removeComment", comment: index }));
  const buttons = h("div", "crm-aw-comment-buttons");
  buttons.append(edit, remove);
  row.append(commentText(comment, act), buttons);
  return row;
}

/** Les commentaires, le plus récent d'abord, et le champ pour en ajouter un. */
export function commentsSection(model: WindowModel, act: WindowActions): HTMLElement {
  const area = h("textarea", "crm-aw-comment-new");
  area.rows = 3;
  area.value = act.drafts.get(NEW_COMMENT);
  area.placeholder = "Ajouter un commentaire";
  area.setAttribute("aria-label", "Ajouter un commentaire");
  area.dataset.field = NEW_COMMENT;
  area.addEventListener("input", () => act.drafts.set(NEW_COMMENT, area.value));
  const add = actionButton("crm-aw-add-comment", "Ajouter le commentaire");
  add.addEventListener("click", () => {
    const text = area.value.trim();
    if (text === "") return;
    act.drafts.set(NEW_COMMENT, "");
    area.value = "";
    act.body({ kind: "addComment", text });
  });
  const list = h("ul", "crm-aw-comments");
  for (const { index, comment } of newestFirst(model.action?.comments ?? []))
    list.append(commentRow(index, comment, act));
  return section("crm-aw-comments-section", "Commentaires", area, add, list);
}
