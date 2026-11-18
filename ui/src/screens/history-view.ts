// Historique d'une note : la liste datée de ses versions ; la version choisie est montrée avec ses
// différences surlignées par rapport à la note actuelle ; « Restaurer » y revient.
import type { DifferenceItem, VersionItem } from "../bridge";

export interface HistoryOptions {
  /** Le titre de la note, en tête de la fenêtre. */
  readonly title: string;
  /** Les versions de la note, la plus récente d'abord. */
  readonly versions: readonly VersionItem[];
  /** Les lignes de la note actuelle et de cette version. */
  readonly compare: (version: string) => Promise<readonly DifferenceItem[]>;
  /** Revenir à cette version ; la fenêtre est déjà fermée. */
  readonly restore: (version: string) => void;
  readonly error: (error: unknown) => void;
}

export const NO_VERSION =
  "Aucune version pour l'instant. Une version est gardée après 5 minutes de frappe, en quittant la note, et avant chaque changement fait hors de l'application.";

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.className = className;
  created.textContent = text;
  return created;
}

/** La légende des couleurs des différences. */
function legend(): HTMLElement {
  const paragraph = element("p", "history-legend");
  paragraph.append(
    element("span", "added", "Seulement dans cette version"),
    " · ",
    element("span", "removed", "Seulement dans la note actuelle"),
  );
  return paragraph;
}

/** Les lignes comparées, chacune marquée selon d'où elle vient. */
function renderLines(preview: HTMLElement, lines: readonly DifferenceItem[]) {
  preview.replaceChildren(
    ...lines.map((line) => element("span", `history-line ${line.kind}`, line.text)),
  );
}

/** La liste des versions et l'aperçu de celle qu'on choisit ; rend la version choisie. */
function versionsPane(options: HistoryOptions, restore: HTMLButtonElement) {
  const list = element("ul", "history-versions");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Versions");
  const preview = element("pre", "history-preview");
  let chosen: string | null = null;
  const buttons = options.versions.map((version) => {
    const button = element("button", "history-version", version.label);
    button.type = "button";
    button.setAttribute("role", "option");
    button.addEventListener("click", () => choose(version.id, button));
    const item = document.createElement("li");
    item.append(button);
    list.append(item);
    return button;
  });
  const choose = (id: string, button: HTMLButtonElement) => {
    chosen = id;
    restore.value = id;
    restore.disabled = false;
    for (const other of buttons) other.setAttribute("aria-selected", String(other === button));
    options.compare(id).then((lines) => {
      // Une autre version a pu être choisie pendant la comparaison.
      if (chosen === id) renderLines(preview, lines);
    }, options.error);
  };
  const body = element("div", "history-body");
  body.append(list, preview);
  return { body, first: () => buttons[0]?.click() };
}

/** Ouvre l'historique de la note dans `dialog`, la version la plus récente choisie. */
export function showHistory(dialog: HTMLDialogElement, options: HistoryOptions): void {
  const restore = element("button", "", "Restaurer");
  restore.disabled = true;
  const close = element("button", "link", "Fermer");
  const buttons = element("div", "confirmation-buttons");
  buttons.append(close, restore);
  // Chaque bouton d'un formulaire « dialog » ferme la fenêtre, comme Échap.
  const form = document.createElement("form");
  form.method = "dialog";
  const heading = element("h2", "history-title", `Historique de « ${options.title} »`);
  const versions = versionsPane(options, restore);
  if (options.versions.length === 0)
    form.append(heading, element("p", "history-empty", NO_VERSION));
  else form.append(heading, versions.body, legend());
  form.append(buttons);
  restore.addEventListener("click", () => {
    // « Restaurer » ne s'active qu'une fois une version choisie : elle est sa valeur.
    const chosen = restore.value;
    dialog.addEventListener("close", () => options.restore(chosen), { once: true });
  });
  dialog.className = "history";
  dialog.setAttribute("aria-label", "Historique");
  dialog.replaceChildren(form);
  dialog.onclose = null;
  dialog.showModal();
  versions.first();
  close.focus();
}
