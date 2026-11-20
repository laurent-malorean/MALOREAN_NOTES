import { describe, expect, it } from "vitest";
import type { CommandId } from "../state/commands";
import { buildFormatBar, showNoteShown } from "./format-bar";

function setup() {
  const bar = document.createElement("div");
  document.body.append(bar);
  const ran: CommandId[] = [];
  buildFormatBar(bar, (command) => ran.push(command));
  const button = (name: string) =>
    bar.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`) as HTMLButtonElement;
  return { bar, ran, button };
}

describe("barre de mise en forme", () => {
  it("est une barre d'outils nommée, en trois groupes de boutons", () => {
    const { bar } = setup();
    expect(bar.getAttribute("role")).toBe("toolbar");
    expect(bar.getAttribute("aria-label")).toBe("Mise en forme");
    const groups = [...bar.children];
    expect(groups.map((group) => group.getAttribute("role"))).toEqual(["group", "group", "group"]);
    expect(groups.every((group) => group.classList.contains("format-group"))).toBe(true);
    expect(groups.map((group) => group.querySelectorAll("button").length)).toEqual([3, 6, 2]);
  });

  it("chaque bouton montre son texte court, porte le nom de sa commande et sa bulle d'aide", () => {
    const { button } = setup();
    const bold = button("Gras");
    expect(bold.textContent).toBe("G");
    expect(bold.title).toBe("Gras (Cmd+B)");
    expect(bold.type).toBe("button");
    expect(bold.classList.contains("tool")).toBe(true);
    expect(bold.dataset.command).toBe("bold");
    expect(button("Copier en texte mis en forme").textContent).toBe("Copier mis en forme");
  });

  it("un clic lance la commande du bouton", () => {
    const { button, ran } = setup();
    showNoteShown(button("Gras").closest("[role=toolbar]") as HTMLElement, true);
    button("Titre 2").click();
    button("Copier en Markdown").click();
    expect(ran).toEqual(["heading-2", "copy-markdown"]);
  });

  it("est grisée tant qu'aucune note n'est montrée", () => {
    const { bar, button } = setup();
    const buttons = [...bar.querySelectorAll("button")];
    expect(buttons.every((each) => each.disabled)).toBe(true);
    showNoteShown(bar, true);
    expect(buttons.some((each) => each.disabled)).toBe(false);
    showNoteShown(bar, false);
    expect(button("Italique").disabled).toBe(true);
  });

  it("appuyer sur un bouton ne prend pas le focus : la sélection reste dans l'éditeur", () => {
    const { bar, button } = setup();
    showNoteShown(bar, true);
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    button("Gras").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
