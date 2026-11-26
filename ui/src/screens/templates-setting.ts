// Réglage du dossier des modèles : une partie de l'écran de réglages, propre à l'espace de travail ouvert.
import { folderChoiceLine } from "./folder-choice";

/** La ligne du choix : le dossier des modèles parmi `folders`, ou aucun ; chaque choix est passé à `choose`. */
function line(
  folders: readonly string[],
  current: string | null,
  choose: (folder: string | null) => void,
): HTMLElement {
  return folderChoiceLine({
    ...{ id: "setting-templatesFolder", name: "templatesFolder", label: "Dossier des modèles" },
    help: "Chaque note de ce dossier est un modèle, pour « Nouvelle note depuis un modèle ».",
    ...{ folders, current, none: "Aucun", choose },
  });
}

function fieldset(): HTMLFieldSetElement {
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Modèles";
  group.append(legend);
  return group;
}

/**
 * La partie « Modèles » de l'écran de réglages : le dossier des modèles parmi `folders`, ou aucun.
 * Chaque choix est passé à `choose` dès qu'il est fait.
 */
export function templatesFolderGroup(
  folders: readonly string[],
  current: string | null,
  choose: (folder: string | null) => void,
): HTMLElement {
  const group = fieldset();
  group.append(line(folders, current, choose));
  return group;
}

/**
 * La même partie, dessinée aussitôt et remplie quand le choix en cours est connu (le moteur le
 * garde) ; si `current` échoue, la ligne ne paraît pas.
 */
export function loadingTemplatesFolderGroup(
  folders: readonly string[],
  current: Promise<string | null>,
  choose: (folder: string | null) => void,
): HTMLElement {
  const group = fieldset();
  void current.then(
    (chosen) => group.append(line(folders, chosen, choose)),
    () => undefined,
  );
  return group;
}
