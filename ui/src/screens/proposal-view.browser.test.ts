import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type { ProposalItem } from "../bridge";
import { showProposal } from "./proposal-view";

const PENDING = "Proposition en cours…";

const proposal: ProposalItem = {
  text: "Une faute ici.",
  differences: [
    { kind: "same", text: "Une " },
    { kind: "removed", text: "fote" },
    { kind: "added", text: "faute" },
    { kind: "same", text: " ici." },
  ],
};

/** La fenêtre ouverte sur une proposition qu'on fait arriver, ou échouer, quand on veut. */
function open() {
  const dialog = document.createElement("dialog");
  document.body.replaceChildren(dialog);
  const heard: string[] = [];
  let answer: (item: ProposalItem) => void = () => {};
  let fail: (error: unknown) => void = () => {};
  showProposal(dialog, {
    action: "Corriger",
    proposal: new Promise((resolve, reject) => ((answer = resolve), (fail = reject))),
    replace: (text) => heard.push(`remplacer ${text}`),
    insertBelow: (text) => heard.push(`insérer ${text}`),
    error: (error) => heard.push(`erreur ${(error as Error).message}`),
  });
  const button = (text: string) =>
    [...dialog.querySelectorAll<HTMLButtonElement>(".confirmation-buttons button")].find(
      (b) => b.textContent === text,
    ) as HTMLButtonElement;
  const side = (index: number) =>
    dialog.querySelectorAll<HTMLElement>(".proposal-text")[index] as HTMLElement;
  const marked = (index: number) =>
    [...side(index).querySelectorAll(".proposal-part")].map((p) => [p.className, p.textContent]);
  return { dialog, heard, answer: (item = proposal) => answer(item), fail, button, side, marked };
}

/** Laisse passer la réponse de la promesse. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("proposition de l'aide à l'écriture", () => {
  it("s'ouvre en attendant la proposition : seul « Annuler » est possible", () => {
    const { dialog, button, side } = open();
    expect(dialog.open).toBe(true);
    expect(dialog.className).toBe("proposal");
    expect(dialog.getAttribute("aria-label")).toBe("Corriger la sélection");
    expect(dialog.querySelector("h2.proposal-title")?.textContent).toBe("Corriger la sélection");
    expect(dialog.querySelectorAll(".proposal-body > .proposal-side")).toHaveLength(2);
    expect(side(0).textContent).toBe("");
    expect(
      [button("Annuler"), button("Insérer dessous"), button("Remplacer")].map((b) => b.className),
    ).toEqual(["link", "", ""]);
    expect(side(1).textContent).toBe(PENDING);
    expect(side(1).getAttribute("role")).toBe("status");
    expect(
      [button("Annuler"), button("Insérer dessous"), button("Remplacer")].map((b) => b.disabled),
    ).toEqual([false, true, true]);
    expect(document.activeElement).toBe(button("Annuler"));
  });

  it("montre côte à côte la sélection et la proposition, chacune avec ses mots changés surlignés", async () => {
    const { dialog, answer, button, side, marked } = open();
    answer();
    await settle();
    const titles = [...dialog.querySelectorAll(".proposal-side-title")].map((t) => t.textContent);
    expect(titles).toEqual(["Sélection", "Proposition"]);
    expect(marked(0)).toEqual([
      ["proposal-part same", "Une "],
      ["proposal-part removed", "fote"],
      ["proposal-part same", " ici."],
    ]);
    expect(marked(1)).toEqual([
      ["proposal-part same", "Une "],
      ["proposal-part added", "faute"],
      ["proposal-part same", " ici."],
    ]);
    expect(side(1).hasAttribute("role")).toBe(false);
    expect(button("Remplacer").disabled).toBe(false);
    expect(button("Insérer dessous").disabled).toBe(false);
    expect(document.activeElement).toBe(button("Remplacer"));
  });

  it("« Remplacer » ferme la fenêtre puis remplace la sélection par la proposition", async () => {
    const { dialog, heard, answer, button } = open();
    answer();
    await settle();
    button("Remplacer").click();
    await expect.poll(() => heard).toEqual(["remplacer Une faute ici."]);
    expect(dialog.open).toBe(false);
    // La fenêtre rouverte pour une autre proposition, puis annulée, ne remplace pas une seconde fois.
    showProposal(dialog, {
      action: "Résumer",
      proposal: new Promise(() => {}),
      replace: (text) => heard.push(`remplacer encore ${text}`),
      insertBelow: () => {},
      error: () => {},
    });
    button("Annuler").click();
    await expect.poll(() => dialog.open).toBe(false);
    await settle();
    expect(heard).toEqual(["remplacer Une faute ici."]);
  });

  it("« Insérer dessous » ferme la fenêtre puis ajoute la proposition sous la sélection", async () => {
    const { dialog, heard, answer, button } = open();
    answer();
    await settle();
    button("Insérer dessous").click();
    await expect.poll(() => heard).toEqual(["insérer Une faute ici."]);
    expect(dialog.open).toBe(false);
  });

  it("« Annuler » ne touche à rien, même quand la proposition arrive après", async () => {
    const { dialog, heard, answer, button, side } = open();
    button("Annuler").click();
    await expect.poll(() => dialog.open).toBe(false);
    answer();
    await settle();
    expect(heard).toEqual([]);
    expect(side(1).textContent).toBe(PENDING);
  });

  it("Échap ferme la fenêtre sans rien changer", async () => {
    const { dialog, heard, answer } = open();
    answer();
    await settle();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => dialog.open).toBe(false);
    expect(heard).toEqual([]);
  });

  it("une demande en échec ferme la fenêtre et dit pourquoi", async () => {
    const { dialog, heard, fail } = open();
    fail(new Error("modèle indisponible"));
    await expect.poll(() => heard).toEqual(["erreur modèle indisponible"]);
    expect(dialog.open).toBe(false);
  });

  it("une réponse arrivée quand la fenêtre sert à autre chose est oubliée", async () => {
    const { dialog, heard, fail } = open();
    dialog.replaceChildren(document.createElement("form"));
    fail(new Error("trop tard"));
    await settle();
    expect(heard).toEqual([]);
    expect(dialog.open).toBe(true);
  });

  it("un échec arrivé après « Annuler » est oublié", async () => {
    const { heard, fail, button } = open();
    button("Annuler").click();
    fail(new Error("trop tard"));
    await settle();
    expect(heard).toEqual([]);
  });
});
