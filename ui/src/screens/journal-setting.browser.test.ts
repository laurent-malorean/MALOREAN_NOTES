import { afterEach, describe, expect, it } from "vitest";
import type { JournalSettings } from "../state/journal";
import { DEFAULT_SETTINGS } from "../state/settings";
import { journalGroup } from "./journal-setting";
import { openSettings } from "./settings-view";

const FOLDERS = ["Journal", "Notes", "Notes/Perso"];

function open(current: JournalSettings, folders: readonly string[] = FOLDERS) {
  const dialog = document.createElement("dialog");
  document.body.replaceChildren(dialog);
  const changes: JournalSettings[] = [];
  const group = journalGroup(folders, current, (next) => changes.push(next));
  openSettings(dialog, DEFAULT_SETTINGS, () => undefined, [group], {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  const folder = dialog.querySelector<HTMLSelectElement>("select[name=journalFolder]");
  const atLaunch = dialog.querySelector<HTMLInputElement>("input[name=journalAtLaunch]");
  if (!folder || !atLaunch) throw new Error("champ introuvable");
  return { dialog, folder, atLaunch, changes };
}

const labelOf = (dialog: HTMLElement, text: string) =>
  [...dialog.querySelectorAll("label")].find((l) => l.textContent === text);

afterEach(() => document.body.replaceChildren());

describe("réglages du journal", () => {
  it("a sa partie, avec le dossier du journal en liste et la case de la note du jour au lancement", () => {
    const { dialog, folder, atLaunch } = open({ folder: "Notes", atLaunch: false });
    const legends = [...dialog.querySelectorAll("legend")].map((l) => l.textContent);
    expect(legends).toEqual(["Affichage", "Écriture", "Journal", "Claude"]);
    expect(labelOf(dialog, "Dossier du journal")?.control).toBe(folder);
    expect(labelOf(dialog, "Créer la note du jour au lancement")?.control).toBe(atLaunch);
    expect([folder.tagName, folder.value, atLaunch.type, atLaunch.checked]).toEqual([
      "SELECT",
      "Notes",
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

  it("propose les dossiers en arborescence, puis « Nouveau dossier… », sans « Aucun »", () => {
    const { folder } = open({ folder: "Journal", atLaunch: true });
    expect([...folder.options].map((o) => [o.value, o.text])).toEqual([
      ["Journal", "Journal"],
      ["Notes", "Notes"],
      ["Notes/Perso", "⎿ Perso"],
      ["\0nouveau", "Nouveau dossier…"],
    ]);
  });

  it("montre le dossier par défaut « Journal » même s'il n'existe pas encore", () => {
    const { folder } = open({ folder: "Journal", atLaunch: true }, ["Notes"]);
    expect(folder.value).toBe("Journal");
    expect(folder.selectedOptions[0]?.text).toBe("Journal");
  });

  it("applique le dossier choisi et la case, chacun gardant l'autre", () => {
    const { folder, atLaunch, changes } = open({ folder: "Journal", atLaunch: true });
    folder.value = "Notes/Perso";
    folder.dispatchEvent(new Event("change"));
    atLaunch.checked = false;
    atLaunch.dispatchEvent(new Event("change"));
    folder.value = "Notes";
    folder.dispatchEvent(new Event("change"));
    expect(changes).toEqual([
      { folder: "Notes/Perso", atLaunch: true },
      { folder: "Notes/Perso", atLaunch: false },
      { folder: "Notes", atLaunch: false },
    ]);
  });

  it("choisit un nouveau dossier par « Nouveau dossier… » et le garde comme dossier du journal", () => {
    const { dialog, folder, changes } = open({ folder: "Journal", atLaunch: true });
    folder.value = "\0nouveau";
    folder.dispatchEvent(new Event("change"));
    const input = dialog.querySelector<HTMLInputElement>(".folder-new-input");
    if (!input) throw new Error("champ introuvable");
    input.value = " Carnet ";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(changes).toEqual([{ folder: "Carnet", atLaunch: true }]);
    expect(folder.value).toBe("Carnet");
  });
});
