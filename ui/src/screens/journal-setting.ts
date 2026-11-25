// Réglages du journal : une partie de l'écran de réglages, propre à l'espace de travail ouvert.
import type { JournalSettings } from "../state/journal";
import { folderChoiceLine } from "./folder-choice";

/** Une ligne de réglage : son nom, son champ, et son aide s'il en a une. */
function line(label: HTMLLabelElement, ...parts: HTMLElement[]): HTMLElement {
  const element = document.createElement("div");
  element.className = "setting";
  element.append(label, ...parts);
  return element;
}

/**
 * La partie « Journal » de l'écran de réglages : le dossier du journal (parmi `folders`, ou un nouveau), et la création de la note
 * du jour au lancement. Chaque changement est passé à `change` dès qu'il est fait.
 */
export function journalGroup(
  folders: readonly string[],
  current: JournalSettings,
  change: (next: JournalSettings) => void,
): HTMLElement {
  let settings = current;
  const apply = (next: JournalSettings) => ((settings = next), change(next));

  const folder = folderChoiceLine({
    ...{ id: "setting-journalFolder", name: "journalFolder", label: "Dossier du journal" },
    help: "Créé au besoin. La note du jour y est rangée sous sa date, pour « Note du jour ».",
    ...{ folders, current: settings.folder, creation: true },
    // Sans entrée « Aucun », le choix est toujours un dossier.
    choose: (chosen) => apply({ ...settings, folder: chosen as string }),
  });

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
  fieldset.append(legend, folder, check);
  return fieldset;
}
