// Réglages, onglet « Favoris » : la note des favoris de l'espace de travail ouvert, la choisir, la créer
// (un nom et un dossier à demander), ou ne plus en utiliser (fiche 0102, spécification § 6).
import type { FavoritesNoteItem } from "../bridge";
import { folderChoiceLine } from "./folder-choice";

/** Ce que l'utilisateur peut demander depuis l'onglet : chacun est lancé par l'application, qui relit ensuite la note. */
export interface FavoritesSettingActions {
  /** Les dossiers de l'espace de travail, parmi lesquels ranger la note créée. */
  readonly folders: readonly string[];
  /** Ouvre la liste des notes, filtrée en tapant. */
  readonly choose: () => void;
  /** Crée la note titrée `title` dans `folder` (`""` : la racine). */
  readonly create: (title: string, folder: string) => void;
  readonly stop: () => void;
}

export interface FavoritesSetting {
  readonly element: HTMLElement;
  /** Montre la note des favoris, ou « Aucune ». */
  show(note: FavoritesNoteItem | null): void;
}

/** Le nom proposé à la création : la note des favoris s'appelle « Favoris », sauf avis contraire. */
export const PROPOSED_TITLE = "Favoris";
const NONE = "Aucune";
const ROOT = "Racine";

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "tool";
  element.textContent = text;
  element.addEventListener("click", onClick);
  return element;
}

/** La ligne qui dit quelle est la note des favoris. */
function currentLine() {
  const label = document.createElement("span");
  label.id = "setting-favoritesNote-label";
  label.className = "setting-label";
  label.textContent = "Note des favoris";
  const value = document.createElement("output");
  value.setAttribute("aria-labelledby", label.id);
  value.className = "favorites-current";
  const help = document.createElement("p");
  help.className = "setting-help";
  help.textContent =
    "Les favoris tiennent dans une seule note, que vous rangez comme vous voulez. L'étoile d'un contenu y ajoute ou en retire un lien.";
  const line = document.createElement("div");
  line.className = "setting";
  line.append(label, value, help);
  return { line, value };
}

/** Le formulaire de création : le nom (proposé « Favoris »), le dossier (proposé : la racine), « Créer » et « Annuler ». */
function creationForm(actions: FavoritesSettingActions) {
  const id = "setting-favoritesName";
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = "Nom de la note";
  const input = document.createElement("input");
  input.id = id;
  input.name = "favoritesName";
  input.value = PROPOSED_TITLE;
  input.spellcheck = false;
  const name = document.createElement("div");
  name.className = "setting";
  name.append(label, input);
  let folder = "";
  const place = folderChoiceLine({
    ...{ id: "setting-favoritesFolder", name: "favoritesFolder", label: "Dossier" },
    help: "La note est créée dans ce dossier.",
    ...{ folders: actions.folders, current: null, none: ROOT },
    choose: (chosen) => (folder = chosen ?? ""),
  });
  const form = document.createElement("div");
  form.className = "favorites-new";
  form.hidden = true;
  const close = () => (form.hidden = true);
  const create = () => {
    close();
    actions.create(input.value, folder);
  };
  const buttons = document.createElement("div");
  buttons.className = "folder-new";
  buttons.append(button("Créer", create), button("Annuler", close));
  // Le formulaire est dans celui des réglages : Entrée et Échap ne doivent ni l'envoyer ni fermer la fenêtre.
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Enter") create();
    else close();
  });
  form.append(name, place, buttons);
  return { form, open: () => ((form.hidden = false), input.focus()) };
}

/** La partie « Favoris » de l'écran de réglages. */
export function favoritesGroup(actions: FavoritesSettingActions): FavoritesSetting {
  const current = currentLine();
  const creation = creationForm(actions);
  const stop = button("Ne plus utiliser de note des favoris", actions.stop);
  const buttons = document.createElement("div");
  buttons.className = "favorites-actions";
  buttons.append(
    button("Choisir une note", actions.choose),
    button("Créer la note des favoris", creation.open),
    stop,
  );
  const legend = document.createElement("legend");
  legend.textContent = "Favoris";
  const element = document.createElement("fieldset");
  element.append(legend, current.line, buttons, creation.form);
  return {
    element,
    show(note) {
      current.value.textContent = note?.title ?? NONE;
      current.value.title = note?.path ?? "";
      stop.disabled = note === null;
    },
  };
}
