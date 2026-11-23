import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../state/settings";
import { openSettings } from "./settings-view";
import { templatesFolderGroup } from "./templates-setting";

function open(current: string | null) {
  const dialog = document.createElement("dialog");
  document.body.replaceChildren(dialog);
  const chosen: (string | null)[] = [];
  const group = templatesFolderGroup(["Modèles", "Travail/Gabarits"], current, (folder) =>
    chosen.push(folder),
  );
  openSettings(dialog, DEFAULT_SETTINGS, () => undefined, [group], {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  const select = dialog.querySelector<HTMLSelectElement>("select[name=templatesFolder]");
  if (!select) throw new Error("champ introuvable");
  return { dialog, select, chosen };
}

afterEach(() => document.body.replaceChildren());

describe("réglage du dossier des modèles", () => {
  it("a sa partie, après les autres réglages, avant le bouton pour fermer", () => {
    const { dialog, select } = open(null);
    const legends = [...dialog.querySelectorAll("legend")].map((l) => l.textContent);
    expect(legends).toEqual(["Affichage", "Écriture", "Modèles", "Claude"]);
    expect(dialog.querySelector("form")?.lastElementChild?.tagName).toBe("FOOTER");
    const label = [...dialog.querySelectorAll("label")].find(
      (l) => l.textContent === "Dossier des modèles",
    );
    expect(label?.control).toBe(select);
    expect(select.closest(".setting")).not.toBeNull();
    const help = document.getElementById(select.getAttribute("aria-describedby") ?? "");
    expect([help?.className, help?.textContent]).toEqual([
      "setting-help",
      "Chaque note de ce dossier est un modèle, pour « Nouvelle note depuis un modèle ».",
    ]);
  });

  it("propose aucun dossier, puis chaque dossier de l'espace de travail, et montre le choix en cours", () => {
    const { select } = open("Travail/Gabarits");
    expect([...select.options].map((o) => [o.value, o.text])).toEqual([
      ["", "Aucun"],
      ["Modèles", "Modèles"],
      ["Travail/Gabarits", "Travail/Gabarits"],
    ]);
    expect(select.value).toBe("Travail/Gabarits");
    expect(open(null).select.selectedOptions[0]?.text).toBe("Aucun");
  });

  it("applique le dossier choisi, ou aucun", () => {
    const { select, chosen } = open(null);
    select.value = "Modèles";
    select.dispatchEvent(new Event("change"));
    select.value = "";
    select.dispatchEvent(new Event("change"));
    expect(chosen).toEqual(["Modèles", null]);
  });
});
