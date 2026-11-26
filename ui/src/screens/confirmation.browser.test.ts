import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { askConfirmation, askTrash, askWorkspaceRemoval } from "./confirmation";

function dialog() {
  const element = document.createElement("dialog");
  document.body.replaceChildren(element);
  return element;
}

const button = (element: HTMLElement, text: string) =>
  [...element.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement;

describe("confirmation", () => {
  it("pose la question, nommée « Confirmation », avec Annuler puis le bouton de l'action", () => {
    const element = dialog();
    void askConfirmation(element, { question: "Partir ?", confirm: "Partir" });
    expect(element.open).toBe(true);
    expect(element.className).toBe("confirmation");
    expect(element.getAttribute("aria-label")).toBe("Confirmation");
    expect(element.querySelector(".confirmation-question")?.textContent).toBe("Partir ?");
    expect([...element.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Annuler",
      "Partir",
    ]);
    expect(element.querySelector(".confirmation-buttons")?.childElementCount).toBe(2);
    expect(button(element, "Partir").className).toBe("danger");
    expect(button(element, "Annuler").className).toBe("link");
  });

  it("le bouton de l'action accepte et ferme la fenêtre", async () => {
    const element = dialog();
    const answer = askConfirmation(element, { question: "Partir ?", confirm: "Partir" });
    button(element, "Partir").click();
    await expect(answer).resolves.toBe(true);
    expect(element.open).toBe(false);
  });

  it("Entrée accepte : le bouton de l'action a la main dès l'ouverture", async () => {
    const element = dialog();
    const answer = askConfirmation(element, { question: "Partir ?", confirm: "Partir" });
    expect(document.activeElement).toBe(button(element, "Partir"));
    await userEvent.keyboard("{Enter}");
    await expect(answer).resolves.toBe(true);
  });

  it("Annuler refuse", async () => {
    const element = dialog();
    const answer = askConfirmation(element, { question: "Partir ?", confirm: "Partir" });
    button(element, "Annuler").click();
    await expect(answer).resolves.toBe(false);
    expect(element.open).toBe(false);
  });

  it("Échap refuse, même après une confirmation acceptée", async () => {
    const element = dialog();
    const first = askConfirmation(element, { question: "Partir ?", confirm: "Partir" });
    button(element, "Partir").click();
    await first;
    const answer = askConfirmation(element, { question: "Partir ?", confirm: "Partir" });
    await userEvent.keyboard("{Escape}");
    await expect(answer).resolves.toBe(false);
    expect(element.open).toBe(false);
  });

  it("demande avant de placer un élément dans la corbeille, en le nommant", () => {
    const element = dialog();
    void askTrash(element, "Courses");
    expect(element.querySelector(".confirmation-question")?.textContent).toBe(
      "Placer « Courses » dans la corbeille ?",
    );
    expect(button(element, "Placer dans la corbeille").className).toBe("danger");
  });

  it("un CRM dit combien de fiches partent avec lui", () => {
    const question = (fiches: number) => {
      const element = dialog();
      void askTrash(element, "CRM1", fiches);
      return element.querySelector(".confirmation-question")?.textContent;
    };
    expect(question(0)).toBe("Placer « CRM1 » dans la corbeille ?");
    expect(question(1)).toBe("Placer « CRM1 » et sa fiche dans la corbeille ?");
    expect(question(2)).toBe("Placer « CRM1 » et ses 2 fiches dans la corbeille ?");
  });

  it("retirer un espace de travail dit que ses notes restent", () => {
    const element = dialog();
    void askWorkspaceRemoval(element, "Travail");
    expect(element.querySelector(".confirmation-question")?.textContent).toBe(
      "Retirer « Travail » de la liste des espaces de travail ? Ses notes restent dans leur dossier.",
    );
    expect(button(element, "Retirer").className).toBe("danger");
  });
});
