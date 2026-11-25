// Choix de dossier : un contrôle déroulant qui montre les dossiers de l'espace de travail en
// arborescence (« Notes », « ⎿ Travail »…), réutilisé par les réglages qui choisissent un dossier.
// Selon le réglage : l'entrée « Aucun » en tête, et « Nouveau dossier… » à la fin, qui demande le
// nom, ou le chemin (« Perso/Carnet »), d'un dossier qui n'existe pas encore.
import { folderChoices, newFolderPath } from "../state/folder-choice";

export interface FolderChoiceOptions {
  /** L'identifiant du contrôle ; son aide a le même, suivi de « -help ». */
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly help: string;
  /** Les dossiers de l'espace de travail, dans l'ordre de l'arbre. */
  readonly folders: readonly string[];
  /** Le dossier choisi, qu'il existe ou non ; `null` pour « aucun ». */
  readonly current: string | null;
  /** Le nom de l'entrée « aucun dossier » (« Aucun ») ; sans elle, un dossier est toujours choisi. */
  readonly none?: string;
  /** Vrai pour proposer « Nouveau dossier… ». */
  readonly creation?: boolean;
  /** Le choix fait : un dossier, ou `null` pour « aucun ». */
  readonly choose: (folder: string | null) => void;
}

const NEW_LABEL = "Nouveau dossier…";
/** La valeur de « Nouveau dossier… » : un chemin de dossier ne peut pas contenir de caractère nul. */
const NEW_VALUE = "\0nouveau";
const NO_FOLDER = "";
const INVALID_NAME =
  "Ce nom ne convient pas : chaque dossier du chemin a un nom, ni caché (point au début), ni « .assets », ni « node_modules ».";

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "tool";
  element.textContent = text;
  element.addEventListener("click", onClick);
  return element;
}

/** Le champ du nom, ou du chemin, d'un nouveau dossier, avec « Créer » et « Annuler » ; masqué jusqu'à ce qu'on le demande. */
function creationField(done: (name: string | null) => void, id: string) {
  const input = document.createElement("input");
  input.className = "folder-new-input";
  input.placeholder = "Nom ou chemin (Perso/Carnet)";
  input.setAttribute("aria-label", "Nom du nouveau dossier");
  input.setAttribute("aria-describedby", `${id}-error`);
  input.spellcheck = false;
  const error = document.createElement("p");
  error.id = `${id}-error`;
  error.className = "setting-error";
  error.textContent = INVALID_NAME;
  const row = document.createElement("div");
  row.className = "folder-new";
  row.hidden = true;
  const validate = () => {
    const path = newFolderPath(input.value);
    input.setAttribute("aria-invalid", String(path === null));
    error.hidden = path !== null;
    if (path !== null) done(path);
  };
  const close = () => done(null);
  // Le champ est dans le formulaire des réglages : Entrée et Échap ne doivent ni l'envoyer ni fermer la fenêtre.
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Enter") validate();
    else close();
  });
  row.append(input, button("Créer", validate), button("Annuler", close), error);
  const open = () => {
    input.value = "";
    input.setAttribute("aria-invalid", "false");
    error.hidden = true;
    row.hidden = false;
    input.focus();
  };
  const hide = () => (row.hidden = true);
  return { row, open, hide };
}

/** La ligne de réglage : le nom, le contrôle de choix de dossier et son aide. */
export function folderChoiceLine(options: FolderChoiceOptions): HTMLElement {
  const { id, none, creation, choose } = options;
  let current = options.current;
  const select = document.createElement("select");
  select.id = id;
  select.name = options.name;
  const show = () => {
    const entries = folderChoices(options.folders, current);
    select.replaceChildren();
    if (none !== undefined) select.add(new Option(none, NO_FOLDER));
    for (const entry of entries) select.add(new Option(entry.label, entry.value));
    if (creation) select.add(new Option(NEW_LABEL, NEW_VALUE));
    select.value = current ?? NO_FOLDER;
  };
  // Le champ du nom n'existe que pour les réglages qui proposent « Nouveau dossier… ».
  const field = creation
    ? creationField((name) => {
        field?.hide();
        select.focus();
        if (name === null) return;
        current = name;
        show();
        choose(name);
      }, id)
    : null;
  select.addEventListener("change", () => {
    if (select.value === NEW_VALUE) {
      show();
      return field?.open();
    }
    field?.hide();
    current = select.value === NO_FOLDER ? null : select.value;
    choose(current);
  });
  show();
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = options.label;
  const help = document.createElement("p");
  help.id = `${id}-help`;
  help.className = "setting-help";
  help.textContent = options.help;
  select.setAttribute("aria-describedby", help.id);
  const line = document.createElement("div");
  line.className = "setting";
  line.append(label, select, ...(field ? [field.row] : []), help);
  return line;
}
