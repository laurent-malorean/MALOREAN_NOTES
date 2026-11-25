// Réglage du dossier des modèles : une partie de l'écran de réglages, propre à l'espace de travail ouvert.
import { folderChoiceLine } from "./folder-choice";

/**
 * La partie « Modèles » de l'écran de réglages : le dossier des modèles parmi `folders`, ou aucun.
 * Chaque choix est passé à `choose` dès qu'il est fait.
 */
export function templatesFolderGroup(
  folders: readonly string[],
  current: string | null,
  choose: (folder: string | null) => void,
): HTMLElement {
  const line = folderChoiceLine({
    ...{ id: "setting-templatesFolder", name: "templatesFolder", label: "Dossier des modèles" },
    help: "Chaque note de ce dossier est un modèle, pour « Nouvelle note depuis un modèle ».",
    ...{ folders, current, none: "Aucun", choose },
  });
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Modèles";
  fieldset.append(legend, line);
  return fieldset;
}
