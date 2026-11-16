import { describe, expect, it } from "vitest";
import { keptPosition, reactionToChange, touchesNote } from "./external-change";

const disk = (content: string, fingerprint: string) => ({ path: "a.md", content, fingerprint });

describe("note ouverte changée hors de l'application", () => {
  it("ne fait rien quand le disque a la version que l'on connaît", () => {
    expect(reactionToChange(disk("texte", "f1"), "f1", true)).toEqual({ kind: "ignore" });
  });

  it("recharge la note quand rien n'attend d'être enregistré", () => {
    expect(reactionToChange(disk("nouveau", "f2"), "f1", true)).toEqual({
      kind: "reload",
      content: "nouveau",
      fingerprint: "f2",
    });
  });

  it("enregistre tout de suite ce qui est tapé quand la note a changé des deux côtés", () => {
    expect(reactionToChange(disk("nouveau", "f2"), "f1", false)).toEqual({ kind: "conflict" });
  });

  it("garde le texte quand la note a été supprimée", () => {
    expect(reactionToChange(null, "f1", true)).toEqual({ kind: "deleted" });
    expect(reactionToChange(null, "f1", false)).toEqual({ kind: "deleted" });
  });
});

describe("changement qui concerne la note ouverte", () => {
  it("la concerne si son chemin est annoncé", () => {
    expect(touchesNote(["b.md", "Travail/a.md"], "Travail/a.md")).toBe(true);
    expect(touchesNote(["b.md"], "Travail/a.md")).toBe(false);
    expect(touchesNote(["a.md"], null)).toBe(false);
  });
});

describe("curseur gardé au rechargement", () => {
  it("reste à la même ligne et à la même colonne", () => {
    expect(keptPosition("un\ndeux\ntrois", 2, 3)).toBe("un\n".length + 3);
  });

  it("revient en fin de ligne si elle est devenue plus courte", () => {
    expect(keptPosition("un\nd\ntrois", 2, 3)).toBe("un\nd".length);
  });

  it("va à la dernière ligne si la note est devenue plus courte", () => {
    expect(keptPosition("un\ndeux", 5, 1)).toBe("un\nd".length);
  });

  it("compte les fins de ligne Windows comme une seule", () => {
    expect(keptPosition("un\r\ndeux", 2, 1)).toBe("un\n".length + 1);
  });
});
