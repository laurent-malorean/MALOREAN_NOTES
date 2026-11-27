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
  it("est une barre d'outils nommée, en deux pilules de boutons", () => {
    const { bar } = setup();
    expect(bar.getAttribute("role")).toBe("toolbar");
    expect(bar.getAttribute("aria-label")).toBe("Mise en forme");
    const groups = [...bar.children];
    expect(groups.map((group) => group.getAttribute("role"))).toEqual(["group", "group"]);
    expect(groups.every((group) => group.classList.contains("format-group"))).toBe(true);
    expect(groups.map((group) => group.querySelectorAll("button").length)).toEqual([10, 2]);
  });

  it("chaque bouton montre une icône seule, porte le nom de sa commande et sa bulle d'aide", () => {
    const { bar, button } = setup();
    const bold = button("Gras");
    expect(bold.textContent).toBe("");
    expect(bold.title).toBe("Gras (Cmd+B)");
    expect(bold.type).toBe("button");
    expect(bold.classList.contains("format-button")).toBe(true);
    expect(bold.dataset.command).toBe("bold");
    for (const each of bar.querySelectorAll("button")) {
      expect(each.textContent).toBe("");
      const icon = each.querySelector("svg") as SVGSVGElement;
      expect(icon.getAttribute("aria-hidden")).toBe("true");
      expect(icon.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(icon.querySelectorAll("path").length).toBeGreaterThan(0);
    }
    expect(button("Copier en texte mis en forme").querySelector("svg")).not.toBeNull();
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
    // Le micro n'en dépend pas : la saisie vocale dit elle-même pourquoi il est grisé.
    const buttons = [...bar.querySelectorAll("button")].filter(
      (each) => each.dataset.command !== "voice-input",
    );
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
