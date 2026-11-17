import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { noteLinkAt, noteLinksIn } from "./note-links";

describe("liens entre notes dans le texte", () => {
  it("trouve chaque lien, sa place et le titre visé", () => {
    expect(noteLinksIn("Voir [[Courses]] et [[Agenda]].")).toEqual([
      { from: 5, to: 16, title: "Courses", textFrom: 7, textTo: 14 },
      { from: 20, to: 30, title: "Agenda", textFrom: 22, textTo: 28 },
    ]);
  });

  it("montre le texte après la barre, et vise le titre avant elle", () => {
    expect(noteLinksIn("[[Courses|la liste]]")).toEqual([
      { from: 0, to: 20, title: "Courses", textFrom: 10, textTo: 18 },
    ]);
  });

  it("ignore les espaces autour du titre", () => {
    expect(noteLinksIn("[[ Courses ]]")[0]?.title).toBe("Courses");
  });

  it("n'en voit pas dans un lien vide, coupé ou sans fin", () => {
    expect(noteLinksIn("[[]] [[ ]] [[|texte]] [[a\nb]] [[sans fin fin]] sans début]]")).toEqual([
      { from: 30, to: 46, title: "sans fin fin", textFrom: 32, textTo: 44 },
    ]);
    expect(noteLinksIn("pas de lien ]]")).toEqual([]);
  });

  it("commence le lien à l'ouverture la plus proche", () => {
    expect(noteLinksIn("[[a [[Courses]]").map((l) => l.title)).toEqual(["Courses"]);
    expect(noteLinksIn("[[Un]]]] [[Deux]]").map((l) => l.title)).toEqual(["Un", "Deux"]);
    expect(noteLinksIn("[[x]][[y]]").map((l) => l.title)).toEqual(["x", "y"]);
  });

  it("trouve n'importe quel titre écrit dans un lien", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-zA-Zéè]{1,8}( [a-zA-Zéè]{1,8}){0,3}$/), (title) => {
        const [link] = noteLinksIn(`avant [[${title}]] après`);
        expect(link?.title).toBe(title);
      }),
    );
  });
});

describe("lien sous une position", () => {
  const text = "Voir [[Courses]] ici";

  it("donne le titre du lien qui contient la position, crochets compris", () => {
    expect([5, 10, 16].map((pos) => noteLinkAt(text, pos))).toEqual([
      "Courses",
      "Courses",
      "Courses",
    ]);
  });

  it("ne donne rien hors d'un lien", () => {
    expect([4, 17].map((pos) => noteLinkAt(text, pos))).toEqual([null, null]);
  });
});
