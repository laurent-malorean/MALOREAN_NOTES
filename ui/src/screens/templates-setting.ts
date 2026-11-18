// Réglage du dossier des modèles : une partie de l'écran de réglages, propre à la bibliothèque ouverte.

/**
 * La partie « Modèles » de l'écran de réglages : le dossier des modèles parmi `folders`, ou aucun.
 * Chaque choix est passé à `choose` dès qu'il est fait.
 */
export function templatesFolderGroup(
  folders: readonly string[],
  current: string | null,
  choose: (folder: string | null) => void,
): HTMLElement {
  const select = document.createElement("select");
  select.id = "setting-templatesFolder";
  select.name = "templatesFolder";
  select.add(new Option("Aucun", ""));
  for (const folder of folders) select.add(new Option(folder, folder));
  select.value = current ?? "";
  select.addEventListener("change", () => choose(select.value || null));
  const label = document.createElement("label");
  label.htmlFor = select.id;
  label.textContent = "Dossier des modèles";
  const help = document.createElement("p");
  help.id = `${select.id}-help`;
  help.className = "setting-help";
  help.textContent =
    "Chaque note de ce dossier est un modèle, pour « Nouvelle note depuis un modèle ».";
  select.setAttribute("aria-describedby", help.id);
  const line = document.createElement("div");
  line.className = "setting";
  line.append(label, select, help);
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Modèles";
  fieldset.append(legend, line);
  return fieldset;
}
