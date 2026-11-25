// Écran de réglages : une fenêtre par-dessus l'application, qui applique chaque réglage dès qu'il est changé.
import type { PreferenceStorage } from "../state/focus-preference";
import {
  type ChoiceField,
  type NumberField,
  SETTING_FIELDS,
  type SettingField,
  type Settings,
  settingChanged,
} from "../state/settings";
import {
  loadSettingsTab,
  placeInTabs,
  SETTINGS_TABS,
  saveSettingsTab,
  tabMoved,
} from "../state/settings-tabs";

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

/** Le titre d'une partie de l'écran, qui dit dans quel onglet elle va. */
const groupName = (element: HTMLElement) => element.querySelector("legend")?.textContent as string;

/** Les onglets, et le panneau de chacun : un seul est montré, celui de `selected`. */
function tabs(panels: readonly HTMLElement[][], storage: PreferenceStorage): HTMLElement {
  const list = document.createElement("div");
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", "Parties des réglages");
  list.className = "settings-tabs";
  const body = document.createElement("div");
  body.className = "settings-panels";
  const buttons = SETTINGS_TABS.map((tab, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `settings-tab-${index}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `settings-panel-${index}`);
    button.textContent = tab.name;
    return button;
  });
  const sections = panels.map((groups, index) => {
    const section = document.createElement("section");
    section.id = `settings-panel-${index}`;
    section.className = "settings-panel";
    section.setAttribute("role", "tabpanel");
    section.setAttribute("aria-labelledby", `settings-tab-${index}`);
    section.append(...groups);
    return section;
  });
  const select = (selected: number) => {
    buttons.forEach((button, index) => {
      button.setAttribute("aria-selected", String(index === selected));
      button.tabIndex = index === selected ? 0 : -1;
    });
    sections.forEach((section, index) => (section.hidden = index !== selected));
    saveSettingsTab(storage, selected);
  };
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => select(index));
    button.addEventListener("keydown", (event) => {
      const moved = tabMoved(index, event.key, buttons.length);
      if (moved === null) return;
      event.preventDefault();
      select(moved);
      (buttons[moved] as HTMLElement).focus();
    });
  });
  select(loadSettingsTab(storage));
  list.append(...buttons);
  body.append(...sections);
  const element = document.createElement("div");
  element.className = "settings-tabbed";
  element.append(list, body);
  return element;
}

/**
 * Ouvre l'écran de réglages sur `settings` ; chaque changement valable est passé à `onChange`.
 * `extra` : des parties de plus, qui gèrent elles-mêmes leurs réglages, après les autres. Chaque
 * partie va dans son onglet ; le dernier onglet ouvert, gardé dans `storage`, se rouvre.
 */
export function openSettings(
  dialog: HTMLDialogElement,
  settings: Settings,
  onChange: (next: Settings) => void,
  extra: readonly HTMLElement[],
  storage: PreferenceStorage,
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
  const names = [...new Set(SETTING_FIELDS.map((f) => f.group))];
  const elements = [...names.map((name) => group(name, editing)), ...extra];
  const placed = placeInTabs(elements.map((element) => ({ name: groupName(element), element })));
  const panels = placed.map((tab) => tab.map((item) => item.element));
  form.append(title, tabs(panels, storage), footer);
  dialog.replaceChildren(form);
  dialog.showModal();
}
