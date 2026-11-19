import { describe, expect, it } from "vitest";
import { COMMANDS } from "./commands";
import {
  insertionBelow,
  noSelection,
  SELECTION_CHANGED,
  WRITING_ACTION,
  WRITING_ACTIONS,
} from "./writing-assist";

describe("aide à l'écriture", () => {
  it("propose corriger, reformuler et résumer, chacune avec sa commande de la palette", () => {
    expect(WRITING_ACTIONS.map((a) => [a.action, a.label, a.command])).toEqual([
      ["correct", "Corriger", "correct-selection"],
      ["rephrase", "Reformuler", "rephrase-selection"],
      ["summarize", "Résumer", "summarize-selection"],
    ]);
    expect(WRITING_ACTION.rephrase).toBe(WRITING_ACTIONS[1]);
    const ids = COMMANDS.map((command) => command.id);
    for (const action of WRITING_ACTIONS) expect(ids).toContain(action.command);
  });

  it("demande de sélectionner d'abord le texte, en nommant l'action", () => {
    expect(WRITING_ACTIONS.map(noSelection)).toEqual([
      "Sélectionnez d'abord le texte à corriger",
      "Sélectionnez d'abord le texte à reformuler",
      "Sélectionnez d'abord le texte à résumer",
    ]);
  });

  it("dit que la note n'a pas changé quand la sélection a changé pendant la demande", () => {
    expect(SELECTION_CHANGED).toBe(
      "Le texte sélectionné a changé pendant la demande : la note n'a pas été modifiée",
    );
  });

  it("insère la proposition à la fin de la dernière ligne de la sélection, après une ligne vide", () => {
    const text = "Un deux trois\nquatre cinq\nsix";
    expect(insertionBelow(text, 4, 18, "Neuf")).toEqual({ at: 25, insert: "\n\nNeuf" });
  });

  it("une sélection qui finit la note insère à la fin", () => {
    expect(insertionBelow("Un\ndeux", 3, 7, "Neuf")).toEqual({ at: 7, insert: "\n\nNeuf" });
  });

  it("une sélection qui finit par un retour à la ligne insère sous la ligne d'avant", () => {
    expect(insertionBelow("Un\ndeux\ntrois", 0, 3, "Neuf")).toEqual({ at: 2, insert: "\n\nNeuf" });
  });

  it("une sélection vide insère sous la ligne du curseur, même au début d'une ligne", () => {
    expect(insertionBelow("Un\ndeux\ntrois", 3, 3, "Neuf")).toEqual({ at: 7, insert: "\n\nNeuf" });
  });
});
