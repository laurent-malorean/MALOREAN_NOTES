// Écran de réglages : une fenêtre par-dessus l'application, qui applique chaque réglage dès qu'il est changé.
import {
  type ChoiceField,
  type NumberField,
  SETTING_FIELDS,
  type SettingField,
  type Settings,
  settingChanged,
} from "../state/settings";

const number = new Intl.NumberFormat("fr-FR");

/** Ce dont chaque champ a besoin : les réglages en cours, et de quoi en appliquer de nouveaux. */
interface Editing {
  readonly current: () => Settings;
  readonly apply: (next: Settings) => void;
}

function paragraph(id: string, className: string, text: string): HTMLParagraphElement {
  const element = document.createElement("p");
  element.id = id;
  element.className = className;
  element.textContent = text;
  return element;
}

/** Une ligne de l'écran : le nom du réglage, son champ, son aide, et ce qui suit. */
function row(
  field: SettingField,
  control: HTMLInputElement | HTMLSelectElement,
  ...after: HTMLElement[]
) {
  const id = `setting-${field.key}`;
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = field.label;
  control.id = id;
  control.name = field.key;
  const help = paragraph(`${id}-help`, "setting-help", field.help);
  control.setAttribute("aria-describedby", [help, ...after].map((e) => e.id).join(" "));
  const line = document.createElement("div");
  line.className = "setting";
  line.append(label, control, help, ...after);
  return line;
}

/** Le champ d'un réglage nombre : refusé, il le signale ; quitté, il revient à la dernière valeur valable. */
function numberField(field: NumberField, { current, apply }: Editing): HTMLElement {
  const input = document.createElement("input");
  input.inputMode = "numeric";
  input.value = String(current()[field.key]);
  const error = paragraph(
    `setting-${field.key}-error`,
    "setting-error",
    `Un nombre entier entre ${number.format(field.min)} et ${number.format(field.max)}.`,
  );
  const showValid = (valid: boolean) => {
    input.setAttribute("aria-invalid", String(!valid));
    error.hidden = valid;
  };
  showValid(true);
  input.addEventListener("input", () => {
    const next = settingChanged(current(), field, input.value);
    showValid(next !== null);
    if (next) apply(next);
  });
  input.addEventListener("change", () => {
    if (input.getAttribute("aria-invalid") === "false") return;
    input.value = String(current()[field.key]);
    showValid(true);
  });
  return row(field, input, error);
}

/** Le champ d'un réglage à choix : une liste, appliquée dès qu'on choisit. */
function choiceField(field: ChoiceField, { current, apply }: Editing): HTMLElement {
  const select = document.createElement("select");
  for (const choice of field.choices) select.add(new Option(choice.label, choice.value));
  select.value = current()[field.key];
  select.addEventListener("change", () => {
    const next = settingChanged(current(), field, select.value);
    if (next) apply(next);
  });
  return row(field, select);
}

/** Les réglages d'une partie de l'écran, sous son titre. */
function group(name: string, editing: Editing): HTMLElement {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = name;
  const fields = SETTING_FIELDS.filter((f) => f.group === name).map((f) =>
    f.kind === "number" ? numberField(f, editing) : choiceField(f, editing),
  );
  fieldset.append(legend, ...fields);
  return fieldset;
}

/**
 * Ouvre l'écran de réglages sur `settings` ; chaque changement valable est passé à `onChange`.
 * `extra` : des parties de plus, qui gèrent elles-mêmes leurs réglages, après les autres.
 */
export function openSettings(
  dialog: HTMLDialogElement,
  settings: Settings,
  onChange: (next: Settings) => void,
  extra: readonly HTMLElement[],
): void {
  let current = settings;
  const editing: Editing = {
    current: () => current,
    apply: (next) => {
      current = next;
      onChange(next);
    },
  };
  const form = document.createElement("form");
  form.method = "dialog";
  const title = document.createElement("h2");
  title.textContent = "Réglages";
  const close = document.createElement("button");
  close.className = "primary";
  close.textContent = "Fermer";
  const footer = document.createElement("footer");
  footer.append(close);
  const groups = [...new Set(SETTING_FIELDS.map((f) => f.group))];
  form.append(title, ...groups.map((name) => group(name, editing)), ...extra, footer);
  dialog.replaceChildren(form);
  dialog.showModal();
}
