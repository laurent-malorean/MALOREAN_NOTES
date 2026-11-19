// Fenêtre de choix : on tape pour filtrer, les flèches ou un clic choisissent, Entrée valide ;
// Échap ou un clic à côté la ferment.
// Sert à l'ouverture rapide, à la palette de commandes et au choix d'un modèle de note.

/** Ce qu'un choix montre : son nom, et un détail en plus petit. */
export interface PickerEntry {
  readonly label: string;
  readonly detail?: string | undefined;
}

export interface PickerOptions<T> {
  /** Le nom de la fenêtre, lu par les lecteurs d'écran. */
  readonly label: string;
  readonly placeholder: string;
  /** Ce qui s'affiche quand rien ne correspond. */
  readonly empty: string;
  /** Les choix pour ce qui est tapé, dans l'ordre. */
  readonly entries: (query: string) => readonly T[];
  readonly describe: (item: T) => PickerEntry;
  /** Appelé avec le choix fait, une fois la fenêtre fermée. */
  readonly choose: (item: T) => void;
}

const LIST_ID = "picker-list";
const optionId = (index: number) => `picker-option-${index}`;

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function searchField({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}): HTMLInputElement {
  const input = document.createElement("input");
  input.className = "picker-input";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", label);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", LIST_ID);
  return input;
}

function optionElement(
  { label, detail }: PickerEntry,
  index: number,
  selected: boolean,
  onClick: () => void,
): HTMLLIElement {
  const element = document.createElement("li");
  element.id = optionId(index);
  element.className = "picker-option";
  element.setAttribute("role", "option");
  element.setAttribute("aria-selected", String(selected));
  element.append(span("picker-label", label));
  if (detail) element.append(span("picker-detail", detail));
  element.addEventListener("click", onClick);
  return element;
}

/** Ouvre la fenêtre de choix, vide, le premier choix en avant. */
export function openPicker<T>(dialog: HTMLDialogElement, options: PickerOptions<T>): void {
  const input = searchField(options);
  const list = document.createElement("ul");
  list.id = LIST_ID;
  list.className = "picker-list";
  list.setAttribute("role", "listbox");
  let items = options.entries("");
  let active = 0;

  const choose = (item: T) => {
    dialog.close();
    options.choose(item);
  };
  const option = (item: T, index: number) =>
    optionElement(options.describe(item), index, index === active, () => choose(item));
  const render = () => {
    if (items.length === 0) {
      input.removeAttribute("aria-activedescendant");
      return list.replaceChildren(span("picker-empty", options.empty));
    }
    input.setAttribute("aria-activedescendant", optionId(active));
    list.replaceChildren(...items.map(option));
    (list.children[active] as HTMLElement).scrollIntoView({ block: "nearest" });
  };
  const filter = () => {
    items = options.entries(input.value);
    active = 0;
    render();
  };
  const MOVES: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };
  input.addEventListener("input", filter);
  input.addEventListener("keydown", (event) => {
    const move = MOVES[event.key];
    if (move !== undefined) {
      active = Math.min(Math.max(active + move, 0), items.length - 1);
      render();
    } else if (event.key === "Enter") {
      const item = items[active];
      if (item !== undefined) choose(item);
    } else return;
    event.preventDefault();
  });

  // Le champ et la liste couvrent toute la fenêtre : un clic qui arrive à la fenêtre elle-même
  // vient de son fond, à côté d'elle. Il la ferme sans rien choisir, comme Échap.
  dialog.onclick = (event) => {
    if (event.target === dialog) dialog.close();
  };
  dialog.className = "picker";
  dialog.setAttribute("aria-label", options.label);
  dialog.replaceChildren(input, list);
  render();
  // La fenêtre donne la main à son premier champ : on peut taper aussitôt.
  dialog.showModal();
}
