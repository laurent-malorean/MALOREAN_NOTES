import { describe, expect, it } from "vitest";
import type { TrashInfo } from "../bridge";
import { renderTrash, type TrashActions } from "./trash-view";

const trash: TrashInfo = {
  folders: ["Travail", "Travail/Réunions"],
  notes: [
    { path: "racine.md", title: "Racine" },
    { path: "Travail/Réunions/mardi.md", title: "Mardi" },
    { path: "Travail/lundi.md", title: "Lundi" },
  ],
};

function view(contents: TrashInfo = trash) {
  const container = document.createElement("nav");
  document.body.replaceChildren(container);
  const asked: string[] = [];
  const actions: TrashActions = {
    restoreNote: (path) => asked.push(`note ${path}`),
    restoreFolder: (path) => asked.push(`dossier ${path}`),
    empty: () => asked.push("vider"),
  };
  renderTrash(container, "Notes", contents, actions);
  return { container, asked };
}

const rows = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>(".trash-row")].map((row) =>
    [...row.querySelectorAll(".trash-label, .trash-origin")].map((p) => p.textContent).join(" | "),
  );
const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement;

describe("corbeille", () => {
  it("liste les notes de la racine, puis chaque dossier suivi de ses notes, avec leur emplacement d'origine", () => {
    const { container } = view();
    expect(rows(container)).toEqual([
      "Racine | Notes",
      "Travail | Notes",
      "Lundi | Notes / Travail",
      "Réunions | Notes / Travail",
      "Mardi | Notes / Travail / Réunions",
    ]);
    const kinds = [...container.querySelectorAll(".trash-row")].map((r) =>
      r.classList.contains("trash-folder") ? "dossier" : "note",
    );
    expect(kinds).toEqual(["note", "dossier", "note", "dossier", "note"]);
    expect(container.querySelectorAll(".trash-row.trash-note")).toHaveLength(3);
    expect(container.querySelectorAll(".trash-row > .trash-text")).toHaveLength(5);
    expect(container.querySelectorAll(".trash-row > button.link")).toHaveLength(5);
  });

  it("montre un dossier vide de la corbeille", () => {
    const { container } = view({ folders: ["Vide"], notes: [] });
    expect(rows(container)).toEqual(["Vide | Notes"]);
  });

  it("restaure une note ou un dossier", () => {
    const { container, asked } = view();
    const restoreButtons = container.querySelectorAll<HTMLButtonElement>(".trash-row button");
    restoreButtons[2]?.click();
    restoreButtons[1]?.click();
    expect([...restoreButtons].every((b) => b.textContent === "Restaurer")).toBe(true);
    expect(asked).toEqual(["note Travail/lundi.md", "dossier Travail"]);
  });

  it("demande confirmation avant de vider, et peut renoncer", () => {
    const { container, asked } = view();
    expect(container.querySelector(".trash-header > button.link")?.textContent).toBe(
      "Vider la corbeille",
    );
    button(container, "Vider la corbeille").click();
    expect(button(container, "Vider définitivement").className).toBe("danger");
    expect(button(container, "Annuler").className).toBe("link");
    expect(container.querySelector(".trash-confirm")?.textContent).toContain(
      "Supprimer définitivement",
    );
    button(container, "Annuler").click();
    expect(button(container, "Vider la corbeille")).toBeDefined();
    expect(asked).toEqual([]);
    button(container, "Vider la corbeille").click();
    button(container, "Vider définitivement").click();
    expect(asked).toEqual(["vider"]);
  });

  it("dit quand la corbeille est vide, sans bouton pour la vider", () => {
    const { container } = view({ folders: [], notes: [] });
    expect(container.querySelector(".search-message")?.textContent).toBe("La corbeille est vide");
    expect(button(container, "Vider la corbeille")).toBeUndefined();
  });
});
