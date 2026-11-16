import { describe, expect, it } from "vitest";
import { parseTable } from "./table";

describe("lecture d'un tableau", () => {
  it("sépare l'en-tête et les lignes en cellules", () => {
    expect(parseTable("| Fruit | Prix |\n| --- | --- |\n| Pomme | 2 € |\n| Poire | 3 € |")).toEqual(
      {
        header: ["Fruit", "Prix"],
        alignments: [null, null],
        rows: [
          ["Pomme", "2 €"],
          ["Poire", "3 €"],
        ],
      },
    );
  });

  it("accepte un tableau sans barres au bord", () => {
    expect(parseTable("a | b\n--|--\n1 | 2")).toEqual({
      header: ["a", "b"],
      alignments: [null, null],
      rows: [["1", "2"]],
    });
  });

  it("lit l'alignement de chaque colonne", () => {
    expect(parseTable("| a | b | c | d |\n|:--|:-:|--:|---|").alignments).toEqual([
      "left",
      "center",
      "right",
      null,
    ]);
  });

  it("tolère des espaces autour des marques d'alignement", () => {
    expect(parseTable("| a | b |\n| :---: | ---: |").alignments).toEqual(["center", "right"]);
  });

  it("ignore les espaces autour d'une ligne", () => {
    expect(parseTable("| a |\n|---|\n  | x |  ").rows).toEqual([["x"]]);
  });

  it("garde une barre échappée dans la cellule", () => {
    expect(parseTable("| a |\n|---|\n| x \\| y |").rows).toEqual([["x | y"]]);
  });

  it("complète ou coupe une ligne pour avoir autant de cellules que l'en-tête", () => {
    expect(parseTable("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |").rows).toEqual([
      ["1", ""],
      ["1", "2"],
    ]);
  });

  it("garde une cellule vide au milieu", () => {
    expect(parseTable("| a | b | c |\n|---|---|---|\n| 1 || 3 |").rows).toEqual([["1", "", "3"]]);
  });

  it("garde une barre finale échappée", () => {
    expect(parseTable("| a |\n|---|\n| x \\|").rows).toEqual([["x |"]]);
  });

  it("n'a aucune ligne quand il n'y a que l'en-tête", () => {
    expect(parseTable("| a |\n|---|").rows).toEqual([]);
  });
});
