import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { askName } from "./name-prompt";

function dialog() {
  const element = document.createElement("dialog");
  document.body.replaceChildren(element);
  return element;
}

const OPTIONS = { question: "Nom de l'espace de travail", initial: "Notes", confirm: "Ajouter" };
const field = (element: HTMLElement) => element.querySelector("input") as HTMLInputElement;
const button = (element: HTMLElement, text: string) =>
  [...element.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement;

describe("demande d'un nom", () => {
  it("pose la question, le nom proposé écrit et choisi, avec Annuler puis le bouton de l'action", () => {
    const element = dialog();
    void askName(element, OPTIONS);
    expect(element.open).toBe(true);
    expect(element.className).toBe("confirmation");
    expect(element.getAttribute("aria-label")).toBe("Nom de l'espace de travail");
    expect(element.querySelector(".confirmation-question")?.textContent).toBe(
      "Nom de l'espace de travail",
    );
    expect(field(element).className).toBe("name-prompt-input");
    expect(field(element).value).toBe("Notes");
    expect(field(element).spellcheck).toBe(false);
    expect(document.activeElement).toBe(field(element));
    expect([field(element).selectionStart, field(element).selectionEnd]).toEqual([0, 5]);
    expect([...element.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Annuler",
      "Ajouter",
    ]);
    expect(element.querySelector(".confirmation-buttons")?.childElementCount).toBe(2);
    expect(button(element, "Ajouter").className).toBe("primary");
    expect(button(element, "Annuler").className).toBe("link");
  });

  it("Entrée rend le nom tapé et ferme la fenêtre", async () => {
    const element = dialog();
    const answer = askName(element, OPTIONS);
    await userEvent.keyboard("Perso{Enter}");
    await expect(answer).resolves.toBe("Perso");
    expect(element.open).toBe(false);
  });

  it("le bouton de l'action rend le nom tapé", async () => {
    const element = dialog();
    const answer = askName(element, OPTIONS);
    field(element).value = "Travail";
    button(element, "Ajouter").click();
    await expect(answer).resolves.toBe("Travail");
  });

  it("Annuler ne rend rien, même après un premier nom validé", async () => {
    const element = dialog();
    const first = askName(element, OPTIONS);
    button(element, "Ajouter").click();
    await first;
    const answer = askName(element, OPTIONS);
    button(element, "Annuler").click();
    await expect(answer).resolves.toBeNull();
    expect(element.open).toBe(false);
  });

  it("Échap ne rend rien", async () => {
    const element = dialog();
    const answer = askName(element, OPTIONS);
    await userEvent.keyboard("{Escape}");
    await expect(answer).resolves.toBeNull();
  });
});
