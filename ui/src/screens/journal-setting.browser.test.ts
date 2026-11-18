import { afterEach, describe, expect, it } from "vitest";
import type { JournalSettings } from "../state/journal";
import { DEFAULT_SETTINGS } from "../state/settings";
import { journalGroup } from "./journal-setting";
import { openSettings } from "./settings-view";

function open(current: JournalSettings) {
  const dialog = document.createElement("dialog");
  document.body.replaceChildren(dialog);
  const changes: JournalSettings[] = [];
  openSettings(dialog, DEFAULT_SETTINGS, () => undefined, [
    journalGroup(current, (next) => changes.push(next)),
  ]);
  const folder = dialog.querySelector<HTMLInputElement>("input[name=journalFolder]");
  const atLaunch = dialog.querySelector<HTMLInputElement>("input[name=journalAtLaunch]");
  if (!folder || !atLaunch) throw new Error("champ introuvable");
  return { dialog, folder, atLaunch, changes };
}

const labelOf = (dialog: HTMLElement, text: string) =>
  [...dialog.querySelectorAll("label")].find((l) => l.textContent === text);

afterEach(() => document.body.replaceChildren());

describe("réglages du journal", () => {
  it("a sa partie, avec le dossier du journal et la case de la note du jour au lancement", () => {
    const { dialog, folder, atLaunch } = open({ folder: "Carnet", atLaunch: false });
    const legends = [...dialog.querySelectorAll("legend")].map((l) => l.textContent);
    expect(legends).toEqual(["Écriture", "Affichage", "Journal"]);
    expect(labelOf(dialog, "Dossier du journal")?.control).toBe(folder);
    expect(labelOf(dialog, "Créer la note du jour au lancement")?.control).toBe(atLaunch);
    expect([folder.type, folder.value, atLaunch.type, atLaunch.checked]).toEqual([
      "text",
      "Carnet",
      "checkbox",
      false,
    ]);
    expect(folder.closest(".setting")).not.toBeNull();
    expect(atLaunch.closest(".setting")).not.toBeNull();
    const help = document.getElementById(folder.getAttribute("aria-describedby") ?? "");
    expect([help?.className, help?.textContent]).toEqual([
      "setting-help",
      "Créé au besoin. La note du jour y est rangée sous sa date, pour « Note du jour ».",
    ]);
  });

  it("applique le dossier tapé, nettoyé, et la case, chacun gardant l'autre", () => {
    const { folder, atLaunch, changes } = open({ folder: "Journal", atLaunch: true });
    folder.value = " Perso/Jours/ ";
    folder.dispatchEvent(new Event("change"));
    expect(folder.value).toBe("Perso/Jours");
    atLaunch.checked = false;
    atLaunch.dispatchEvent(new Event("change"));
    folder.value = "";
    folder.dispatchEvent(new Event("change"));
    expect(folder.value).toBe("Journal");
    expect(changes).toEqual([
      { folder: "Perso/Jours", atLaunch: true },
      { folder: "Perso/Jours", atLaunch: false },
      { folder: "Journal", atLaunch: false },
    ]);
  });
});
