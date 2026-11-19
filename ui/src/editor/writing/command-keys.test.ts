import type { Command } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { commandKeys, editorKey } from "./command-keys";

describe("touches de l'éditeur tirées de la liste des commandes", () => {
  it("écrit un raccourci de la palette comme le lit CodeMirror", () => {
    expect(editorKey("Cmd+B")).toBe("Mod-b");
    expect(editorKey("Cmd+1")).toBe("Mod-1");
    expect(editorKey("Cmd+Maj+8")).toBe("Mod-Shift-8");
    expect(editorKey("Ctrl+Alt+Cmd+D")).toBe("Ctrl-Alt-Mod-d");
  });

  it("relie chaque commande donnée à la touche de la liste, et rien d'autre", () => {
    const bold: Command = () => true;
    const date: Command = () => false;
    expect(commandKeys({ bold, "insert-date": date })).toEqual([
      { key: "Mod-b", run: bold },
      { key: "Mod-Shift-d", run: date },
    ]);
  });

  it("laisse de côté une commande sans raccourci", () => {
    expect(commandKeys({ "open-link": () => true })).toEqual([]);
  });
});
