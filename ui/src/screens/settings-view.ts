// Écran de réglages : une fenêtre par-dessus l'application, qui applique chaque réglage dès qu'il est tapé.
import { type NumberField, SETTING_FIELDS, type Settings, settingChanged } from "../state/settings";

const number = new Intl.NumberFormat("fr-FR");

/** Le champ d'un réglage nombre : refusé, il le signale ; quitté, il revient à la dernière valeur valable. */
function numberField(
  field: NumberField,
  current: () => Settings,
  apply: (next: Settings) => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "setting";
  const id = `setting-${field.key}`;
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = field.label;
  const input = document.createElement("input");
  input.id = id;
  input.name = field.key;
  input.inputMode = "numeric";
  input.value = String(current()[field.key]);
  input.setAttribute("aria-describedby", `${id}-help ${id}-error`);
  const help = document.createElement("p");
  help.id = `${id}-help`;
  help.className = "setting-help";
  help.textContent = field.help;
  const error = document.createElement("p");
  error.id = `${id}-error`;
  error.className = "setting-error";
  error.textContent = `Un nombre entier entre ${number.format(field.min)} et ${number.format(field.max)}.`;
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
  row.append(label, input, help, error);
  return row;
}

/** Ouvre l'écran de réglages sur `settings` ; chaque changement valable est passé à `onChange`. */
export function openSettings(
  dialog: HTMLDialogElement,
  settings: Settings,
  onChange: (next: Settings) => void,
): void {
  let current = settings;
  const apply = (next: Settings) => {
    current = next;
    onChange(next);
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
  form.append(title, ...SETTING_FIELDS.map((f) => numberField(f, () => current, apply)), footer);
  dialog.replaceChildren(form);
  dialog.showModal();
}
