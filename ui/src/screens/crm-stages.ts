// Les étapes, depuis le Kanban (fiche 0060, spécification § 7.1) : « + Ajouter une étape », cliquer
// le nom pour le changer, « × » pour retirer. « TODO », « Done » et « Cancel » n'ont rien de tout cela.
import { actionButton, h } from "./crm-dom";

/** Le champ d'étape ouvert : le renommage d'une étape, ou l'ajout d'une nouvelle. */
export type StageEdit =
  | { readonly kind: "rename"; readonly stage: string; readonly value: string }
  | { readonly kind: "add"; readonly value: string };

/** Ce que font les étapes, dit par l'écran. */
export interface StageActions {
  readonly beginRename: (stage: string) => void;
  readonly beginAdd: () => void;
  readonly typed: (value: string) => void;
  readonly commit: () => void;
  readonly cancel: () => void;
  readonly remove: (stage: string) => void;
}

/** Le champ de nom : Entrée valide, Échap annule, quitter le champ annule aussi. */
export function stageInput(
  edit: StageEdit,
  act: StageActions,
  blurred: () => boolean,
): HTMLInputElement {
  const input = h("input", "crm-stage-input");
  input.setAttribute("aria-label", "Nom de l'étape");
  input.dataset.keep = "stage";
  input.value = edit.value;
  input.spellcheck = false;
  input.addEventListener("input", () => act.typed(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") act.commit();
    if (event.key === "Escape") {
      event.stopPropagation();
      act.cancel();
    }
  });
  // Le dessin de l'écran retire le champ : ce n'est pas un départ de l'utilisateur.
  input.addEventListener("blur", () => blurred() || !input.isConnected || act.cancel());
  return input;
}

/** Le nom d'une étape dans son en-tête : un bouton, ou le champ s'il est en cours de changement. */
export function stageName(
  stage: string,
  edit: StageEdit | null,
  act: StageActions,
  blurred: () => boolean,
): HTMLElement {
  if (edit?.kind === "rename" && edit.stage === stage) return stageInput(edit, act, blurred);
  const name = actionButton("crm-column-name crm-stage-name", stage);
  name.title = "Changer le nom de l'étape";
  name.addEventListener("click", () => act.beginRename(stage));
  return name;
}

/** « × » : retire l'étape. */
export function removeButton(stage: string, act: StageActions): HTMLButtonElement {
  const button = actionButton("crm-stage-remove", "×", `Retirer l'étape ${stage}`);
  button.title = "Retirer l'étape";
  button.addEventListener("click", () => act.remove(stage));
  return button;
}

/** Entre la dernière étape et « Done » : le bouton « + Ajouter une étape », ou le champ « Nom de l'étape ». */
export function addStageTile(
  edit: StageEdit | null,
  act: StageActions,
  blurred: () => boolean,
): HTMLElement {
  const tile = h("div", "crm-add-stage");
  if (edit?.kind === "add") {
    tile.append(stageInput(edit, act, blurred));
    return tile;
  }
  const button = actionButton("crm-add-stage-button link", "+ Ajouter une étape");
  button.addEventListener("click", act.beginAdd);
  tile.append(button);
  return tile;
}
