// Réglages du journal : une partie de l'écran de réglages, propre à la bibliothèque ouverte.
import { journalFolder, type JournalSettings } from "../state/journal";

/** Une ligne de réglage : son nom, son champ, et son aide s'il en a une. */
function line(label: HTMLLabelElement, ...parts: HTMLElement[]): HTMLElement {
  const element = document.createElement("div");
  element.className = "setting";
  element.append(label, ...parts);
  return element;
}

/**
 * La partie « Journal » de l'écran de réglages : le dossier du journal, et la création de la note
 * du jour au lancement. Chaque changement est passé à `change` dès qu'il est fait.
 */
export function journalGroup(
  current: JournalSettings,
  change: (next: JournalSettings) => void,
): HTMLElement {
  let settings = current;
  const apply = (next: JournalSettings) => ((settings = next), change(next));

  const folder = document.createElement("input");
  folder.id = "setting-journalFolder";
  folder.name = "journalFolder";
  folder.value = settings.folder;
  folder.addEventListener("change", () => {
    folder.value = journalFolder(folder.value);
    apply({ ...settings, folder: folder.value });
  });
  const folderLabel = document.createElement("label");
  folderLabel.htmlFor = folder.id;
  folderLabel.textContent = "Dossier du journal";
  const help = document.createElement("p");
  help.id = `${folder.id}-help`;
  help.className = "setting-help";
  help.textContent =
    "Créé au besoin. La note du jour y est rangée sous sa date, pour « Note du jour ».";
  folder.setAttribute("aria-describedby", help.id);

  const atLaunch = document.createElement("input");
  atLaunch.type = "checkbox";
  atLaunch.id = "setting-journalAtLaunch";
  atLaunch.name = "journalAtLaunch";
  atLaunch.checked = settings.atLaunch;
  atLaunch.addEventListener("change", () => apply({ ...settings, atLaunch: atLaunch.checked }));
  const atLaunchLabel = document.createElement("label");
  atLaunchLabel.htmlFor = atLaunch.id;
  atLaunchLabel.textContent = "Créer la note du jour au lancement";
  const check = line(atLaunchLabel);
  check.classList.add("setting-check");
  check.prepend(atLaunch);

  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Journal";
  fieldset.append(legend, line(folderLabel, folder, help), check);
  return fieldset;
}
