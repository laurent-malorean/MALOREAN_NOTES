import { describe, expect, it } from "vitest";
import { noteMenu } from "./note-menu";

describe("menu d'une note", () => {
  it("propose de l'ouvrir dans un nouvel onglet, à gauche, à droite, ou de la fermer", () => {
    const asked: string[] = [];
    const entries = noteMenu({
      place: (placement) => asked.push(placement),
      close: () => asked.push("fermer"),
    });
    expect(entries.map((entry) => entry.label)).toEqual([
      "Ouvrir dans un nouvel onglet",
      "Ouvrir à gauche",
      "Ouvrir à droite",
      "Fermer",
    ]);
    for (const entry of entries) entry.run();
    expect(asked).toEqual(["newTab", "left", "right", "fermer"]);
  });
});
